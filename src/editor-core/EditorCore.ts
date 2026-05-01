import { Editor } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import { parseMarkdown } from './io/parseMarkdown'
import { serializeMarkdown } from './io/serializeMarkdown'
import { resolveEffectiveDocumentMarkdownOptionsForLoad } from './io/emptyParagraphPreservation'
import {
  joinWithFrontmatter,
  parseFrontmatterFields,
  splitLeadingFrontmatter,
} from './io/frontmatter'
import type {
  ClientRectSnapshot,
  CommandAvailability,
  HeadingInfo,
  HeadingUiSnapshot,
  LineBreakPolicy,
  LineBreakPolicyListener,
  MarkdownDocumentOptions,
  ParagraphPlainModeListener,
  ParagraphSourceContext,
  RubyEditContext,
  SearchState,
  SearchStateListener,
  SelectionRange,
  UpdateListener,
  EditorCoreHandle,
  LogListener,
  OpenExternalUrl,
  SelectionListener,
} from './types'
import { buildExtensions, DEFAULT_EDITOR_CONTENT } from './extensions/buildExtensions'
import {
  resolveAutoTcyDigitRange,
  createBasicCommandsController,
  bindEditorDomEvents,
  buildCommandAvailability,
  clearStoredMarksAtBoundary,
  clearCheckedChecklistItemsInRange,
  createCommandAvailabilityController,
  createCoreNotifiers,
  createEditorClickHandler,
  createEditorLifecycleCallbacks,
  createEditorPropsKeyDownHandler,
  createEditorPropsPasteHandler,
  editorClipboardCopyCutDOMHandlers,
  createCompositionEventHandlers,
  createFoldTooltipController,
  createInlineAnnotationController,
  createLineBreakPolicyController,
  createListenerSubscriptions,
  createMarkdownIoController,
  createOutlineNavigationController,
  createParagraphPlainModeController,
  createSearchController,
  createVerticalWheelScrollController,
  deleteHorizontalRuleWithKey,
  resolveChecklistClickPos,
  resolveClickTargetElement,
  resolveFoldToggleHeadingPos,
  inspectPmCollapsedAfterSpecialInline,
  moveListItemDown,
  moveListItemUp,
  MAX_DIFF_LOG_LENGTH,
  MAX_DIFF_LOG_OPS,
  measureCanonicalDiff,
  captureViewportAnchor,
  restoreViewportAnchor,
  scrollEditorSurfaceToTextOffset,
  scrollEditorSurfaceToRatio,
  selectHorizontalRuleAtEventTarget,
  parseSingleParagraphNode,
  recordSpecialInlinePointerSample,
  resolveParagraphElement,
  resolveParagraphNodeContext,
  resolveRubyEditContext,
  serializeParagraphNode,
  shortenForLog,
  shouldBlockShiftEnterInRegularBody,
  shouldInsertHardBreakOnShiftEnterInRegularBody,
  toggleChecklistInSelection,
  toggleChecklistItemAtDocPos,
  toggleChecklistItemAtSelection,
  toClientRectSnapshot,
  resetHomeEndState,
  notifySelectionChanged,
} from './features'
import {
  FOLD_TOGGLE_CLASS,
  FOLD_ELLIPSIS_CLASS,
} from './extensions/headingFold'
import { searchHighlightPluginKey } from './extensions/searchHighlight'
import { replaceMatchInDoc, replaceAllMatchesInDoc } from './features'
import { serializeClipboardSliceToPlainText } from './io/clipboardSlicePlainText'

const TCY_VALID_PATTERN = /^[A-Za-z0-9!?]{2,4}$/

export interface CreateEditorCoreOptions {
  /** Required: the DOM element to mount the editor into */
  element: HTMLElement
  /** Optional: markdown line break policy */
  lineBreakPolicy?: LineBreakPolicy
  /** Optional: safely open a validated https URL outside the editor. */
  openExternalUrl?: OpenExternalUrl
}

export function createEditorCore(options: CreateEditorCoreOptions): EditorCoreHandle {
  const logListeners = new Set<LogListener>()
  const selectionListeners = new Set<SelectionListener>()
  const lineBreakPolicyListeners = new Set<LineBreakPolicyListener>()
  const updateListeners = new Set<UpdateListener>()
  const foldChangeListeners = new Set<UpdateListener>()
  const searchStateListeners = new Set<SearchStateListener>()
  const listenerSubscriptions = createListenerSubscriptions({
    logListeners,
    selectionListeners,
    updateListeners,
    foldChangeListeners,
    lineBreakPolicyListeners,
    searchStateListeners,
  })
  let isComposing = false
  let enableRubyFlag = true
  let autoTcyEnabled = false
  let autoTcyNumbersOnly = false
  let autoTcyDigitRange = resolveAutoTcyDigitRange()
  let documentLineBreakPolicy: LineBreakPolicy = options.lineBreakPolicy ?? 'obsidian-paragraph'
  let documentMarkdownOptions: MarkdownDocumentOptions = {
    preserveEmptyParagraphs: false,
  }

  function getSearchStateSnapshot(): SearchState {
    const pluginState = searchHighlightPluginKey.getState(editor.state)
    if (!pluginState || !pluginState.query) {
      return { query: '', caseSensitive: false, matchCount: 0, currentIndex: -1 }
    }
    return {
      query: pluginState.query,
      caseSensitive: pluginState.caseSensitive,
      matchCount: pluginState.matches.length,
      currentIndex: pluginState.currentIndex,
    }
  }

  const {
    pushLog,
    emitLineBreakPolicyChange,
    emitFoldChange,
    emitSearchStateChange,
  } = createCoreNotifiers({
    logListeners,
    lineBreakPolicyListeners,
    foldChangeListeners,
    searchStateListeners,
    getSearchStateSnapshot,
  })
  const { getLineBreakPolicy: readLineBreakPolicy, setLineBreakPolicy: applyLineBreakPolicy } =
    createLineBreakPolicyController({
      initialPolicy: options.lineBreakPolicy ?? 'obsidian-paragraph',
      pushLog,
      emitLineBreakPolicyChange,
    })

  const onEditorPropsKeyDown = createEditorPropsKeyDownHandler({
    getIsComposing: (viewComposing) => isComposing || viewComposing,
    getLineBreakPolicy: readLineBreakPolicy,
    deleteHorizontalRuleWithKey,
    shouldInsertHardBreakOnShiftEnterInRegularBody,
    shouldBlockShiftEnterInRegularBody,
    pushLog,
  })
  const onEditorPropsPaste = createEditorPropsPasteHandler({
    getIsComposing: (viewComposing) => isComposing || viewComposing,
    getLineBreakPolicy: readLineBreakPolicy,
    getDocumentMarkdownOptions: () => documentMarkdownOptions,
    pushLog,
  })
  const { onSelectionUpdate: baseOnSelectionUpdate, onUpdate: emitUpdate } = createEditorLifecycleCallbacks({
    selectionListeners,
    updateListeners,
    pushLog,
  })
  const onSelectionUpdate = (payload: Parameters<typeof baseOnSelectionUpdate>[0]) => {
    notifySelectionChanged()
    baseOnSelectionUpdate(payload)
  }
  const onUpdate = () => {
    // If policy changed without "apply now", the first user edit should treat the doc as the current policy.
    const activePolicy = readLineBreakPolicy()
    if (documentLineBreakPolicy !== activePolicy) {
      documentLineBreakPolicy = activePolicy
    }
    emitUpdate()
    searchController.scheduleRefreshForDocChange()
  }

  const editor = new Editor({
    extensions: buildExtensions({
      autoTcy: {
        isEnabled: () => autoTcyEnabled,
        getDigitRange: () => autoTcyDigitRange,
        getNumbersOnly: () => autoTcyNumbersOnly,
      },
    }),
    content: DEFAULT_EDITOR_CONTENT,
    autofocus: true,
    element: options.element,
    editorProps: {
      handleKeyDown: onEditorPropsKeyDown,
      handlePaste: onEditorPropsPaste,
      clipboardTextSerializer: (slice) => serializeClipboardSliceToPlainText(slice),
      handleDOMEvents: editorClipboardCopyCutDOMHandlers,
    },
    onSelectionUpdate,
    onUpdate,
  })

  const paragraphPlainController = createParagraphPlainModeController({
    editor,
    getLineBreakPolicy: readLineBreakPolicy,
    pushLog,
  })
  const markdownIoController = createMarkdownIoController({
    getLineBreakPolicy: readLineBreakPolicy,
    setParagraphPlainMode: (enabled) => {
      paragraphPlainController.setMode(enabled)
    },
    parseMarkdownToJson: (markdownBody, lineBreakPolicy) =>
      parseMarkdown(editor.schema, markdownBody, lineBreakPolicy, {
        enableRuby: enableRubyFlag,
        preserveEmptyParagraphs: documentMarkdownOptions.preserveEmptyParagraphs,
      }).toJSON(),
    setEditorContent: (content) => {
      editor.commands.setContent(
        content as Parameters<typeof editor.commands.setContent>[0],
      )
    },
    clearEditorHistory: () => {
      const freshState = EditorState.create({
        doc: editor.state.doc,
        plugins: editor.state.plugins,
      })
      editor.view.updateState(freshState)
    },
    serializeCurrentDoc: (lineBreakPolicy) =>
      serializeMarkdown(
        editor.state.doc,
        lineBreakPolicy,
        documentMarkdownOptions,
      ),
    defaultEditorContent: DEFAULT_EDITOR_CONTENT,
    splitLeadingFrontmatter,
    joinWithFrontmatter,
    applyDocumentMarkdownOptionsForLoad: ({
      frontmatterPrefix,
      markdownBody,
      lineBreakPolicy,
    }) => {
      documentMarkdownOptions = resolveEffectiveDocumentMarkdownOptionsForLoad(
        parseFrontmatterFields(frontmatterPrefix),
        markdownBody,
        lineBreakPolicy,
      )
    },
    measureCanonicalDiff,
    shortenForLog,
    maxDiffLogOps: MAX_DIFF_LOG_OPS,
    maxDiffLogLength: MAX_DIFF_LOG_LENGTH,
    pushLog,
    // BETA-SP8: canonical diff/詳細ログは DEV ビルドのみ
    devMode: import.meta.env.DEV,
  })
  const inlineAnnotationController = createInlineAnnotationController({
    editor,
    getIsComposing: () => isComposing || editor.view.composing,
    getLineBreakPolicy: readLineBreakPolicy,
    pushLog,
    tcyValidPattern: TCY_VALID_PATTERN,
    resolveRubyEditContext,
    resolveParagraphNodeContext,
    serializeParagraphNode,
    parseSingleParagraphNode,
    resolveParagraphElement,
    toClientRectSnapshot,
  })

  // --- DOM event handlers (boundary guard & logging) ---
  const {
    onCompositionStart,
    onCompositionUpdate,
    onCompositionEnd,
    onBeforeInput,
    onInput,
    onKeyDown,
  } = createCompositionEventHandlers({
    getState: () => editor.state,
    getView: () => editor.view,
    getIsComposing: () => isComposing || editor.view.composing,
    setIsComposing: (next) => {
      isComposing = next
    },
    clearStoredMarks: () => clearStoredMarksAtBoundary(editor),
    pushLog,
  })

  const onClick = createEditorClickHandler({
    getIsComposing: () => isComposing || editor.view.composing,
    foldToggleClass: FOLD_TOGGLE_CLASS,
    getState: () => editor.state,
    posAtDOM: (node, offset) => editor.view.posAtDOM(node, offset),
    dispatch: (tr) => editor.view.dispatch(tr),
    resolveClickTargetElement,
    resolveFoldToggleHeadingPos,
    selectHorizontalRuleAtEventTarget,
    resolveChecklistClickPos,
    toggleChecklistItemAtDocPos,
    toggleHeadingFold: (headingPos) => editor.commands.toggleHeadingFold(headingPos),
    emitFoldChange,
    openExternalUrl: options.openExternalUrl,
    pushLog,
  })

  // --- Fold ellipsis tooltip ---
  const foldTooltipController = createFoldTooltipController('heading-fold-preview-tooltip')
  const wheelScrollController = createVerticalWheelScrollController(editor.view.dom)

  function onMouseOver(event: MouseEvent) {
    foldTooltipController.onMouseOver(event, FOLD_ELLIPSIS_CLASS)
  }

  function onMouseOut(event: MouseEvent) {
    foldTooltipController.onMouseOut(event, FOLD_ELLIPSIS_CLASS)
  }

  function onWheel(event: WheelEvent): void {
    wheelScrollController.onWheel(event)
  }

  const outlineNavigationController = createOutlineNavigationController({
    editor,
    getIsComposing: () => isComposing || editor.view.composing,
    pushLog,
    emitFoldChange,
  })
  const searchController = createSearchController({
    getIsComposing: () => isComposing || editor.view.composing,
    getLineBreakPolicy: readLineBreakPolicy,
    setSearchQueryCommand: (query, caseSensitive) => {
      editor.commands.setSearchQuery(query, caseSensitive)
    },
    refreshSearchCommand: (anchorPos) => {
      editor.commands.refreshSearch(anchorPos)
    },
    setSearchCurrentIndexCommand: (index) => {
      editor.commands.setSearchCurrentIndex(index)
    },
    closeSearchCommand: () => {
      editor.commands.closeSearch()
    },
    getSearchStateSnapshot,
    getSearchPluginState: () => searchHighlightPluginKey.getState(editor.state) ?? null,
    getEditorState: () => editor.state,
    dispatch: (tr) => editor.view.dispatch(tr),
    replaceMatchInDoc,
    replaceAllMatchesInDoc,
    emitSearchStateChange,
    scrollToPos: (pos) => {
      outlineNavigationController.scrollToPos(pos)
    },
    pushLog,
  })
  const basicCommandsController = createBasicCommandsController({
    editor,
    getIsComposing: () => isComposing || editor.view.composing,
    pushLog,
    clearCheckedChecklistItemsInRange,
    toggleChecklistItemAtSelection,
    toggleChecklistInSelection,
    moveListItemUp,
    moveListItemDown,
  })
  const commandAvailabilityController = createCommandAvailabilityController({
    getState: () => editor.state,
    getIsComposing: () => isComposing || editor.view.composing,
    getEnableRuby: () => enableRubyFlag,
    canMoveListUp: (state) => moveListItemUp(state, undefined),
    canMoveListDown: (state) => moveListItemDown(state, undefined),
    canUndo: () => editor.can().chain().focus().undo().run(),
    canRedo: () => editor.can().chain().focus().redo().run(),
    getActiveMarks: () => ({
      isBold: editor.isActive('bold'),
      isItalic: editor.isActive('italic'),
      isStrike: editor.isActive('strike'),
      isHighlight: editor.isActive('highlight'),
      isInlineCode: editor.isActive('code'),
      isBulletList: editor.isActive('bulletList'),
      isOrderedList: editor.isActive('orderedList'),
      isBlockquote: editor.isActive('blockquote'),
      isCodeBlock: editor.isActive('codeBlock'),
    }),
    buildCommandAvailability,
  })

  // Attach DOM listeners
  const unbindDomEvents = bindEditorDomEvents(editor.view.dom, {
    onCompositionStart,
    onCompositionUpdate,
    onCompositionEnd,
    onBeforeInput,
    onInput,
    onKeyDown,
    onClick,
    onMouseOver,
    onMouseOut,
    onWheel,
    onPointerDown: (event) => recordSpecialInlinePointerSample(event),
    onPointerUp: (event) => recordSpecialInlinePointerSample(event),
  })

  function applyLineBreakPolicyImmediately(
    nextPolicy: LineBreakPolicy,
    nextOptions?: MarkdownDocumentOptions,
  ): boolean {
    paragraphPlainController.setMode(false)
    const sourcePolicy = documentLineBreakPolicy
    const sourceOptions = documentMarkdownOptions
    const targetOptions: MarkdownDocumentOptions = {
      preserveEmptyParagraphs:
        nextOptions?.preserveEmptyParagraphs ?? sourceOptions.preserveEmptyParagraphs,
    }
    const normalizedMarkdown = serializeMarkdown(
      editor.state.doc,
      sourcePolicy,
      sourceOptions,
    )
    const normalizedDoc = parseMarkdown(editor.schema, normalizedMarkdown, nextPolicy, {
      enableRuby: enableRubyFlag,
      preserveEmptyParagraphs: targetOptions.preserveEmptyParagraphs,
    })
    if (editor.state.doc.eq(normalizedDoc)) {
      documentLineBreakPolicy = nextPolicy
      documentMarkdownOptions = targetOptions
      pushLog(
        'lineBreakPolicyApplyNow',
        `source=${sourcePolicy} target=${nextPolicy} preserveEmptyParagraphs=${targetOptions.preserveEmptyParagraphs ? 'true' : 'false'} changed=false`,
      )
      return false
    }
    const tr = editor.state.tr.replaceWith(
      0,
      editor.state.doc.content.size,
      normalizedDoc.content,
    )
    editor.view.dispatch(tr)
    documentLineBreakPolicy = nextPolicy
    documentMarkdownOptions = targetOptions
    pushLog(
      'lineBreakPolicyApplyNow',
      `source=${sourcePolicy} target=${nextPolicy} preserveEmptyParagraphs=${targetOptions.preserveEmptyParagraphs ? 'true' : 'false'} changed=true`,
    )
    return true
  }

  // --- Public API ---

  const handle: EditorCoreHandle = {
    undo(): boolean {
      return basicCommandsController.undo()
    },

    redo(): boolean {
      return basicCommandsController.redo()
    },

    execute(command: 'bold' | 'italic' | 'strike' | 'highlight') {
      basicCommandsController.execute(command)
    },

    toggleInlineCode() {
      basicCommandsController.toggleInlineCode()
    },

    clearFormat() {
      basicCommandsController.clearFormat()
    },

    toggleChecklistChecked() {
      basicCommandsController.toggleChecklistChecked()
    },

    toggleChecklist() {
      basicCommandsController.toggleChecklist()
    },

    toggleBulletList() {
      basicCommandsController.toggleBulletList()
    },

    toggleOrderedList() {
      basicCommandsController.toggleOrderedList()
    },

    toggleBlockquote() {
      basicCommandsController.toggleBlockquote()
    },

    toggleCodeBlock() {
      basicCommandsController.toggleCodeBlock()
    },

    insertHorizontalRule() {
      basicCommandsController.insertHorizontalRule()
    },

    moveListItemUp(): boolean {
      return basicCommandsController.moveListItemUp()
    },

    selectAll() {
      basicCommandsController.selectAll()
    },

    moveListItemDown(): boolean {
      return basicCommandsController.moveListItemDown()
    },

    getLinkHref(): string | undefined {
      return inlineAnnotationController.getLinkHref()
    },

    getSelectedText(): string {
      return inlineAnnotationController.getSelectedText()
    },

    getSelectionRange() {
      return inlineAnnotationController.getSelectionRange()
    },

    getRubyEditContext(): RubyEditContext | null {
      return inlineAnnotationController.getRubyEditContext()
    },

    inspectSpecialInlineAdjacentCaretPm() {
      return inspectPmCollapsedAfterSpecialInline(editor.state)
    },

    getParagraphSourceContext(range?: SelectionRange): ParagraphSourceContext | null {
      return inlineAnnotationController.getParagraphSourceContext(range)
    },

    insertRuby(ruby: string, range?: SelectionRange) {
      inlineAnnotationController.insertRuby(ruby, range)
    },

    replaceParagraphSource(markdown: string, range?: SelectionRange): boolean {
      return inlineAnnotationController.replaceParagraphSource(markdown, range)
    },

    getParagraphClientRect(range?: SelectionRange): ClientRectSnapshot | null {
      return inlineAnnotationController.getParagraphClientRect(range)
    },

    toggleTcy() {
      inlineAnnotationController.toggleTcy()
    },

    insertBouten(emphasisChar: string, range?: { from: number; to: number }) {
      inlineAnnotationController.insertBouten(emphasisChar, range)
    },

    setLink(href: string | null, range?: { from: number; to: number }) {
      inlineAnnotationController.setLink(href, range)
    },

    insertImage(src: string, alt: string, title?: string) {
      inlineAnnotationController.insertImage(src, alt, title)
    },

    loadMarkdown(md: string) {
      resetHomeEndState()
      markdownIoController.loadMarkdown(md)
      documentLineBreakPolicy = readLineBreakPolicy()
      searchController.refreshImmediately()
    },

    setFrontmatterPrefix(prefix: string) {
      markdownIoController.setFrontmatterPrefix(prefix)
    },

    saveMarkdown(): string {
      return markdownIoController.saveMarkdown()
    },

    peekMarkdown(): string {
      return markdownIoController.peekMarkdown()
    },

    reset() {
      resetHomeEndState()
      markdownIoController.reset()
      documentLineBreakPolicy = readLineBreakPolicy()
      searchController.refreshImmediately()
    },

    clearHistory() {
      const freshState = EditorState.create({
        doc: editor.state.doc,
        plugins: editor.state.plugins,
      })
      editor.view.updateState(freshState)
    },

    undoParagraphPlain() {
      paragraphPlainController.undoOverlay()
    },

    redoParagraphPlain() {
      paragraphPlainController.redoOverlay()
    },

    selectAllParagraphPlain() {
      paragraphPlainController.selectAllOverlay()
    },

    setParagraphPlainMode(enabled: boolean): boolean {
      resetHomeEndState()
      return paragraphPlainController.setMode(enabled)
    },

    toggleParagraphPlainMode(): boolean {
      return paragraphPlainController.toggleMode()
    },

    isParagraphPlainModeActive(): boolean {
      return paragraphPlainController.isActive()
    },

    commitParagraphPlainIfActive(): boolean {
      return paragraphPlainController.commitIfActive()
    },

    onParagraphPlainModeChange(listener: ParagraphPlainModeListener): () => void {
      return paragraphPlainController.onModeChange(listener)
    },

    getLineBreakPolicy(): LineBreakPolicy {
      return readLineBreakPolicy()
    },

    setLineBreakPolicy(nextPolicy: LineBreakPolicy): LineBreakPolicy {
      return applyLineBreakPolicy(nextPolicy)
    },

    setDocumentMarkdownOptions(
      nextOptions: MarkdownDocumentOptions,
    ): MarkdownDocumentOptions {
      documentMarkdownOptions = {
        preserveEmptyParagraphs: nextOptions.preserveEmptyParagraphs === true,
      }
      return documentMarkdownOptions
    },

    getDocumentMarkdownOptions(): MarkdownDocumentOptions {
      return documentMarkdownOptions
    },

    applyLineBreakPolicyNow(
      nextPolicy: LineBreakPolicy,
      nextOptions?: MarkdownDocumentOptions,
    ): boolean {
      return applyLineBreakPolicyImmediately(nextPolicy, nextOptions)
    },

    onLineBreakPolicyChange(listener: LineBreakPolicyListener): () => void {
      return listenerSubscriptions.onLineBreakPolicyChange(listener)
    },

    onLog(listener: LogListener) {
      return listenerSubscriptions.onLog(listener)
    },

    onSelectionUpdate(listener: SelectionListener) {
      return listenerSubscriptions.onSelectionUpdate(listener)
    },

    onUpdate(listener: UpdateListener) {
      return listenerSubscriptions.onUpdate(listener)
    },

    getCommandAvailability(): CommandAvailability {
      return commandAvailabilityController.getCommandAvailability()
    },

    toggleHeading(level: number) {
      outlineNavigationController.toggleHeading(level)
    },

    getHeadings(): HeadingInfo[] {
      return outlineNavigationController.getHeadings()
    },

    getHeadingSnapshot(): HeadingUiSnapshot {
      return outlineNavigationController.getHeadingSnapshot()
    },

    getActiveHeadingIndex(): number {
      return outlineNavigationController.getActiveHeadingIndex()
    },

    onFoldChange(listener: UpdateListener): () => void {
      return listenerSubscriptions.onFoldChange(listener)
    },

    toggleHeadingFold(pos: number) {
      outlineNavigationController.toggleHeadingFold(pos)
    },

    getFoldedHeadingPositions(): Set<number> {
      return outlineNavigationController.getFoldedHeadingPositions()
    },

    unfoldAll() {
      outlineNavigationController.unfoldAll()
    },

    scrollToPos(pos: number) {
      outlineNavigationController.scrollToPos(pos)
    },

    captureViewportAnchor() {
      return captureViewportAnchor(editor.view)
    },

    restoreViewportAnchor(anchor) {
      restoreViewportAnchor(editor.view, anchor)
    },

    scrollEditorSurfaceToRatio(ratio: number) {
      scrollEditorSurfaceToRatio(editor.view, ratio)
    },

    scrollEditorSurfaceToTextOffset(textOffset: number): boolean {
      return scrollEditorSurfaceToTextOffset(editor.view, textOffset)
    },

    getHeadingPreview(pos: number): string {
      return outlineNavigationController.getHeadingPreview(pos)
    },

    jumpToPreviousHeading(): boolean {
      return outlineNavigationController.jumpToPreviousHeading()
    },

    jumpToNextHeading(): boolean {
      return outlineNavigationController.jumpToNextHeading()
    },

    toggleCurrentHeadingFold(): boolean {
      return outlineNavigationController.toggleCurrentHeadingFold()
    },

    // --- Search / Replace ---

    setSearchQuery(query: string, caseSensitive: boolean): number {
      return searchController.setSearchQuery(query, caseSensitive)
    },

    searchNext(): number {
      return searchController.searchNext()
    },

    searchPrev(): number {
      return searchController.searchPrev()
    },

    replaceCurrentMatch(replacement: string): number {
      return searchController.replaceCurrentMatch(replacement)
    },

    replaceAllMatches(replacement: string): number {
      return searchController.replaceAllMatches(replacement)
    },

    closeSearch() {
      searchController.closeSearch()
    },

    getSearchState(): SearchState {
      return getSearchStateSnapshot()
    },

    onSearchStateChange(listener: SearchStateListener): () => void {
      return listenerSubscriptions.onSearchStateChange(listener)
    },

    setEnableRuby(enabled: boolean) {
      enableRubyFlag = enabled
    },

    isRubyEnabled(): boolean {
      return enableRubyFlag
    },

    setAutoTcyOptions(options) {
      const nextDigitRange = resolveAutoTcyDigitRange(options)
      const nextNumbersOnly = options.numbersOnly === true
      const changed =
        autoTcyEnabled !== options.enabled ||
        autoTcyNumbersOnly !== nextNumbersOnly ||
        autoTcyDigitRange.minDigits !== nextDigitRange.minDigits ||
        autoTcyDigitRange.maxDigits !== nextDigitRange.maxDigits

      autoTcyEnabled = options.enabled
      autoTcyNumbersOnly = nextNumbersOnly
      autoTcyDigitRange = nextDigitRange

      if (!changed) return

      const tr = editor.state.tr
        .setMeta('nyozeAutoTcyRefresh', {
          enabled: autoTcyEnabled,
          numbersOnly: autoTcyNumbersOnly,
          minDigits: autoTcyDigitRange.minDigits,
          maxDigits: autoTcyDigitRange.maxDigits,
        })
        .setMeta('addToHistory', false)
      editor.view.dispatch(tr)
    },

    focusEditor() {
      editor.commands.focus()
    },

    destroy() {
      searchController.destroy()
      paragraphPlainController.destroy()
      unbindDomEvents()
      wheelScrollController.destroy()
      foldTooltipController.destroy()
      listenerSubscriptions.clearAll()
      editor.destroy()
    },
  }

  return handle
}
