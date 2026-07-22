import { Editor } from '@tiptap/core'
import { EditorState, type Transaction } from '@tiptap/pm/state'
import { parseMarkdown } from './io/parseMarkdown'
import { exportAozoraTextFromDoc, type AozoraTextExportOptions } from './export/aozoraTextExport'
import { exportLeMECompatibleMarkdownFromDoc, type LeMEMarkdownExportOptions } from './export/lemeMarkdownExport'
import { exportDendenCompatibleMarkdownFromDoc, type DendenMarkdownExportOptions } from './export/dendenMarkdownExport'
import { exportWebBookFromDoc } from './export/webBookExport'
import type { WebBookExportOptions } from './export/webBookExport'
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
import { createCustomBlockDirectiveController } from './commands/customBlockDirectiveCommands'
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
  createNoteAnchorPreviewController,
  createNoteAnchorJumpController,
  findNoteAnchorPosition,
  buildRemoveNoteAnchorTransaction,
  buildRemoveNoteAnchorTransactionAtDom,
  collectNoteAnchorIdsInDoc,
  NOTE_ANCHOR_DOCUMENT_LOAD_META_KEY,
  createEditorSurfaceWheelController,
  createInlineAnnotationController,
  createLineBreakPolicyController,
  createListenerSubscriptions,
  createMarkdownIoController,
  createOutlineNavigationController,
  createParagraphPlainModeController,
  createPseudoCaretController,
  createSearchController,
  createTypewriterModeController,
  createVisualFocusCurrentLineController,
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
  maybeScheduleMacosArrowScrollClamp,
  readSinceLastInteractionMs,
  registerMacosArrowScrollClampHostInteractions,
  isMacOsRenderer,
} from './features'
import {
  FOLD_TOGGLE_CLASS,
  FOLD_ELLIPSIS_CLASS,
} from './extensions/headingFold'
import { searchHighlightPluginKey } from './extensions/searchHighlight'
import { replaceMatchInDoc, replaceAllMatchesInDoc } from './features'
import { serializeClipboardSliceToPlainText } from './io/clipboardSlicePlainText'

const TCY_VALID_PATTERN = /^[A-Za-z0-9!?]{1,4}$/

export interface CreateEditorCoreOptions {
  /** Required: the DOM element to mount the editor into */
  element: HTMLElement
  /** Optional: markdown line break policy */
  lineBreakPolicy?: LineBreakPolicy
  /** Optional: safely open a validated https URL outside the editor. */
  openExternalUrl?: OpenExternalUrl
  /** App-wide Typewriter scroll: live getters (ref-backed from UI). */
  getTypewriterModeEnabled?: () => boolean
  getTypewriterOffsetRatio?: () => number
  getTypewriterFollowBandRatio?: () => number
  /** Source Mode active — suppresses Typewriter scroll / scroll past end. */
  getIsSourceModeActive?: () => boolean
  /** Hidden settings.json: macOS Arrow scroll clamp (default true). */
  getMacosArrowScrollClampEnabled?: () => boolean
  /** Visual Focus Phase 1: block highlight in WYSIWYG (not Typewriter scroll). */
  getVisualFocusBlockHighlightEnabled?: () => boolean
  /** Visual Focus Phase 2: dim non-focused textblocks (not Typewriter scroll). */
  getVisualFocusDimNonFocusedBlocksEnabled?: () => boolean
  /** Visual Focus Phase 5: current visual line overlay (WYSIWYG; not Typewriter scroll). */
  getVisualFocusCurrentLineHighlightEnabled?: () => boolean
  /** Pseudo caret (Task 2-2): display-only caret overlay (WYSIWYG; collapsed selection). */
  getPseudoCaretEnabled?: () => boolean
  /** Pseudo caret (Task 2-4): caret short-axis thickness in px (already sanitized in the UI). */
  getPseudoCaretThickness?: () => number
  /** Pseudo caret blink: overlay opacity animation ON/OFF (default true when unset). */
  getPseudoCaretBlinkEnabled?: () => boolean
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
  let visualFocusCurrentLineController: ReturnType<typeof createVisualFocusCurrentLineController> | null = null
  let pseudoCaretController: ReturnType<typeof createPseudoCaretController> | null = null
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

  type ParagraphPlainControllerHandle = ReturnType<typeof createParagraphPlainModeController>
  const paragraphPlainControllerRef: { current: ParagraphPlainControllerHandle | null } = {
    current: null,
  }

  /** Set immediately after `Editor` construction so extension getters can read `view.composing`. */
  const editorHolder: { current: Editor | null } = { current: null }

  const onEditorPropsKeyDown = createEditorPropsKeyDownHandler({
    getIsComposing: (viewComposing) => isComposing || viewComposing,
    onBareArrowNavigationKeydown: (view, event) => {
      const host = view.dom.closest('.editor-surface') as HTMLElement | null
      if (!host) return
      const { sinceLastWheelMs, sinceLastPointerDragMs } = readSinceLastInteractionMs(host)
      maybeScheduleMacosArrowScrollClamp(host, event, {
        clampSettingEnabled: options.getMacosArrowScrollClampEnabled?.() ?? true,
        isMacOS: isMacOsRenderer(),
        typewriterEnabled: options.getTypewriterModeEnabled?.() ?? false,
        wysiwygSuppressForSourceMode: options.getIsSourceModeActive?.() ?? false,
        paragraphPlainActive: paragraphPlainControllerRef.current?.isActive() ?? false,
        composing: isComposing || view.composing,
        selectionCollapsed: view.state.selection.empty,
        defaultPrevented: event.defaultPrevented,
        sinceLastWheelMs,
        sinceLastPointerDragMs,
      })
    },
    noteTypewriterKeyboardNavigationIntent: (event) => {
      typewriterModeController?.noteKeyboardNavigationIntent(event)
    },
    noteTypewriterJumpNavigationSuppress: (source) => {
      typewriterModeController?.noteJumpNavigationSuppress(source)
    },
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
    typewriterModeController?.handleSelectionUpdate()
    visualFocusCurrentLineController?.scheduleUpdate()
    pseudoCaretController?.scheduleUpdate()
  }
  let typewriterModeController: ReturnType<typeof createTypewriterModeController> | null = null
  let noteAnchorPreviewController: ReturnType<typeof createNoteAnchorPreviewController> | null = null
  let noteAnchorJumpController: ReturnType<typeof createNoteAnchorJumpController> | null = null
  let onNoteAnchorReveal: ((id: string) => void) | null = null
  const onUpdate = ({ transaction }: { transaction: Transaction }) => {
    // If policy changed without "apply now", the first user edit should treat the doc as the current policy.
    const activePolicy = readLineBreakPolicy()
    if (documentLineBreakPolicy !== activePolicy) {
      documentLineBreakPolicy = activePolicy
    }
    const isDocumentLoad = Boolean(transaction.getMeta(NOTE_ANCHOR_DOCUMENT_LOAD_META_KEY))
    if (!isDocumentLoad) {
      emitUpdate()
      searchController.scheduleRefreshForDocChange()
    }
    typewriterModeController?.handleEditorUpdate({
      docChanged: transaction.docChanged,
    })
    visualFocusCurrentLineController?.scheduleUpdate()
    pseudoCaretController?.scheduleUpdate()
    if (transaction.docChanged) {
      noteAnchorPreviewController?.scheduleApply()
    }
  }

  const editor = new Editor({
    extensions: buildExtensions({
      autoTcy: {
        isEnabled: () => autoTcyEnabled,
        getDigitRange: () => autoTcyDigitRange,
        getNumbersOnly: () => autoTcyNumbersOnly,
      },
      visualFocus: {
        getBlockHighlightEnabled: () => options.getVisualFocusBlockHighlightEnabled?.() ?? false,
        getDimNonFocusedBlocksEnabled: () =>
          options.getVisualFocusDimNonFocusedBlocksEnabled?.() ?? false,
        getSourceModeActive: () => options.getIsSourceModeActive?.() ?? false,
        getParagraphPlainActive: () => paragraphPlainControllerRef.current?.isActive() ?? false,
        getComposing: () => isComposing || editorHolder.current?.view.composing === true,
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

  editorHolder.current = editor

  paragraphPlainControllerRef.current = createParagraphPlainModeController({
    editor,
    getLineBreakPolicy: readLineBreakPolicy,
    pushLog,
  })
  typewriterModeController = createTypewriterModeController({
    view: editor.view,
    getIsEnabled: options.getTypewriterModeEnabled ?? (() => false),
    getIsComposing: () => isComposing || editor.view.composing,
    getIsParagraphPlainActive: () => paragraphPlainControllerRef.current!.isActive(),
    getIsSourceModeActive: options.getIsSourceModeActive ?? (() => false),
    getOffsetRatio: options.getTypewriterOffsetRatio ?? (() => 0),
    getFollowBandRatio: options.getTypewriterFollowBandRatio ?? (() => 0.16),
  })
  const unsubscribeTypewriterParagraphPlainMode = paragraphPlainControllerRef.current.onModeChange(() => {
    typewriterModeController?.syncRuntimeState()
  })
  const markdownIoController = createMarkdownIoController({
    getLineBreakPolicy: readLineBreakPolicy,
    setParagraphPlainMode: (enabled) => {
      paragraphPlainControllerRef.current!.setMode(enabled)
    },
    parseMarkdownToJson: (markdownBody, lineBreakPolicy) =>
      parseMarkdown(editor.schema, markdownBody, lineBreakPolicy, {
        enableRuby: enableRubyFlag,
        preserveEmptyParagraphs: documentMarkdownOptions.preserveEmptyParagraphs,
      }).toJSON(),
    setEditorContent: (content) => {
      const nextDoc = editor.schema.nodeFromJSON(content)
      const tr = editor.state.tr
        .replaceWith(0, editor.state.doc.content.size, nextDoc.content)
        .setMeta(NOTE_ANCHOR_DOCUMENT_LOAD_META_KEY, true)
      editor.view.dispatch(tr)
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
      visualFocusCurrentLineController?.scheduleUpdate()
      pseudoCaretController?.scheduleUpdate()
    },
    noteTypewriterBeforeInput: (event) => {
      typewriterModeController?.noteBeforeInput(event)
    },
    scheduleVisualFocusCurrentLineUpdate: () => {
      visualFocusCurrentLineController?.scheduleUpdate()
      pseudoCaretController?.scheduleUpdate()
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
    onHeadingFoldToggled: () => {
      typewriterModeController?.noteJumpNavigationSuppress('fold-toggle')
    },
    onNoteAnchorReveal: (id) => {
      onNoteAnchorReveal?.(id)
      pushLog('command', `noteAnchorReveal id=${id}`)
    },
    pushLog,
  })

  // --- Fold ellipsis tooltip ---
  const foldTooltipController = createFoldTooltipController('heading-fold-preview-tooltip')
  noteAnchorPreviewController = createNoteAnchorPreviewController(editor.view)
  noteAnchorJumpController = createNoteAnchorJumpController(editor.view)
  const editorSurface = editor.view.dom.closest('.editor-surface') as HTMLElement | null
  const wheelScrollController = editorSurface
    ? createEditorSurfaceWheelController(editor.view.dom, editorSurface)
    : null
  let unregisterMacosArrowScrollClampHost: (() => void) | null = null
  if (editorSurface) {
    unregisterMacosArrowScrollClampHost = registerMacosArrowScrollClampHostInteractions(editorSurface)
  }

  visualFocusCurrentLineController = createVisualFocusCurrentLineController({
    view: editor.view,
    editorSurface,
    getEnabled: () => options.getVisualFocusCurrentLineHighlightEnabled?.() ?? false,
    getIsSourceModeActive: () => options.getIsSourceModeActive?.() ?? false,
    getIsParagraphPlainActive: () => paragraphPlainControllerRef.current?.isActive() ?? false,
    getIsComposing: () => isComposing || editor.view.composing,
  })
  visualFocusCurrentLineController.scheduleUpdate()

  pseudoCaretController = createPseudoCaretController({
    view: editor.view,
    editorSurface,
    getEnabled: () => options.getPseudoCaretEnabled?.() ?? false,
    getThickness: () => options.getPseudoCaretThickness?.(),
    getBlinkEnabled: () => options.getPseudoCaretBlinkEnabled?.() ?? true,
    getIsSourceModeActive: () => options.getIsSourceModeActive?.() ?? false,
    getIsParagraphPlainActive: () => paragraphPlainControllerRef.current?.isActive() ?? false,
    getIsComposing: () => isComposing || editor.view.composing,
  })
  pseudoCaretController.scheduleUpdate()

  function onMouseOver(event: MouseEvent) {
    foldTooltipController.onMouseOver(event, FOLD_ELLIPSIS_CLASS)
  }

  function onMouseOut(event: MouseEvent) {
    foldTooltipController.onMouseOut(event, FOLD_ELLIPSIS_CLASS)
  }

  const outlineNavigationController = createOutlineNavigationController({
    editor,
    getIsComposing: () => isComposing || editor.view.composing,
    pushLog,
    emitFoldChange,
    noteTypewriterProgrammaticJump: () => {
      typewriterModeController?.noteJumpNavigationSuppress('outline-search-scroll')
    },
    noteTypewriterFoldToggleJump: () => {
      typewriterModeController?.noteJumpNavigationSuppress('fold-toggle')
    },
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
    getLineBreakPolicy: readLineBreakPolicy,
    pushLog,
    clearCheckedChecklistItemsInRange,
    toggleChecklistItemAtSelection,
    toggleChecklistInSelection,
    moveListItemUp,
    moveListItemDown,
  })
  const customBlockDirectiveController = createCustomBlockDirectiveController({
    editor,
    getIsComposing: () => isComposing || editor.view.composing,
    pushLog,
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
      isUnderline: editor.isActive('underline'),
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
    onPointerDown: (event) => recordSpecialInlinePointerSample(event),
    onPointerUp: (event) => recordSpecialInlinePointerSample(event),
  })
  if (editorSurface && wheelScrollController) {
    editorSurface.addEventListener('wheel', wheelScrollController.onWheel, {
      passive: false,
    })
  }

  function applyLineBreakPolicyImmediately(
    nextPolicy: LineBreakPolicy,
    nextOptions?: MarkdownDocumentOptions,
  ): boolean {
    paragraphPlainControllerRef.current!.setMode(false)
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

  /**
   * HTML / Web Book export 専用の一時変換（実機報告、2026-07）。`commonmark-strict` の
   * 記事・文書系文書は、段落間隔を横書き前提の CSS margin/line-height で
   * 表現する commonmark 流の段落構造（長い hardBreak 連結や 0.86em 相当の
   * margin）のまま縦書き HTML へ出すと、列間隔が過大に見える。段落間隔を
   * 詰めて表示する `obsidian-paragraph`（小説・本文既定）相当の段落構造へ
   * 出力直前だけ変換することで、CSS 側を書字方向ごとに調整しなくても
   * Web Book の縦書き表示を小説・本文と同等の詰まった見た目にできる。
   *
   * `applyLineBreakPolicyImmediately` と同じ「現在の doc を現在の policy で
   * serialize → 目的の policy で再 parse」の変換経路を再利用するが、
   * editor state（`editor.view.dispatch`）・`documentLineBreakPolicy` /
   * `documentMarkdownOptions`・frontmatter・保存ファイルのいずれも一切
   * 書き換えない。variable を返すだけの純粋な一時変換で、呼び出し元は
   * この一時 doc を `exportWebBookFromDoc` へ渡すだけに使う。
   * - frontmatter の `documentType` は書き換えない（この変換と無関係）。
   * - `obsidian-paragraph` の文書はそのまま `editor.state.doc` を使う
   *   （変換不要、変換前後で内容が変わらないため）。
   * - page-break / blank-page / ruby / TCY / underline / noteAnchor /
   *   custom block directive は、通常の保存・読み込みと同じ
   *   `serializeMarkdown` / `parseMarkdown` を経由するため round-trip する。
   */
  function resolveHtmlExportDoc() {
    const activePolicy = readLineBreakPolicy()
    if (activePolicy !== 'commonmark-strict') {
      return editor.state.doc
    }
    const markdownForExport = serializeMarkdown(
      editor.state.doc,
      activePolicy,
      documentMarkdownOptions,
    )
    return parseMarkdown(editor.schema, markdownForExport, 'obsidian-paragraph', {
      enableRuby: enableRubyFlag,
    })
  }

  // --- Public API ---

  const handle: EditorCoreHandle = {
    undo(): boolean {
      return basicCommandsController.undo()
    },

    redo(): boolean {
      return basicCommandsController.redo()
    },

    execute(command: 'bold' | 'italic' | 'strike' | 'highlight' | 'underline') {
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

    applyCustomBlockDirective(token: string): boolean {
      return customBlockDirectiveController.applyToken(token)
    },

    removeCustomBlockDirective(): boolean {
      return customBlockDirectiveController.remove()
    },

    getCustomBlockDirectiveToken(): string | null {
      return customBlockDirectiveController.getToken()
    },

    insertPageBreak(): boolean {
      return customBlockDirectiveController.insertPageBreak()
    },

    deletePageBreak(): boolean {
      return customBlockDirectiveController.deletePageBreak()
    },

    insertBlankPage(count?: number): boolean {
      return customBlockDirectiveController.insertBlankPage(count)
    },

    exportAozoraText(options?: AozoraTextExportOptions) {
      return exportAozoraTextFromDoc(editor.state.doc, options)
    },

    exportLeMEMarkdown(options?: LeMEMarkdownExportOptions) {
      return exportLeMECompatibleMarkdownFromDoc(editor.state.doc, options)
    },

    exportDendenMarkdown(options?: DendenMarkdownExportOptions) {
      return exportDendenCompatibleMarkdownFromDoc(editor.state.doc, options)
    },

    exportWebBook(options?: WebBookExportOptions) {
      return exportWebBookFromDoc(resolveHtmlExportDoc(), options)
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

    insertNoteAnchor(id: string, range?: { from: number; to: number }) {
      return inlineAnnotationController.insertNoteAnchor(id, range)
    },

    setNoteAnchorPreviews(previews: Record<string, string>) {
      noteAnchorPreviewController?.setNoteAnchorPreviews(previews)
    },

    setNoteAnchorColors(colors: Record<string, import('../project/noteColor').NoteColorId>) {
      noteAnchorPreviewController?.setNoteAnchorColors(colors)
    },

    scrollToNoteAnchor(id: string): boolean {
      const pos = findNoteAnchorPosition(editor.state.doc, id)
      if (pos === null) return false
      if (!editor.view.dom.isConnected) return false
      outlineNavigationController.scrollToPos(pos)
      noteAnchorJumpController?.scheduleHighlightNoteAnchor(id)
      pushLog('command', `scrollToNoteAnchor id=${id}`)
      return true
    },

    removeNoteAnchor(id: string): boolean {
      const tr = buildRemoveNoteAnchorTransaction(editor.state, id)
      if (!tr) return false
      editor.view.dispatch(tr)
      pushLog('command', `removeNoteAnchor id=${id}`)
      return true
    },

    removeNoteAnchorAtDomMarker(markerElement: Element | null, id: string): boolean {
      if (markerElement) {
        const tr = buildRemoveNoteAnchorTransactionAtDom(
          editor.state,
          editor.view,
          markerElement,
          id,
        )
        if (tr) {
          editor.view.dispatch(tr)
          pushLog('command', `removeNoteAnchorAtDomMarker id=${id}`)
          return true
        }
      }
      return this.removeNoteAnchor(id)
    },

    getNoteAnchorIdsInDoc(): string[] {
      return collectNoteAnchorIdsInDoc(editor.state.doc)
    },

    setOnNoteAnchorReveal(listener: ((id: string) => void) | null) {
      onNoteAnchorReveal = listener
    },

    loadMarkdown(md: string) {
      resetHomeEndState()
      markdownIoController.loadMarkdown(md)
      documentLineBreakPolicy = readLineBreakPolicy()
      searchController.refreshImmediately()
    },

    setReadOnly(readOnly: boolean) {
      editor.setEditable(!readOnly)
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
      paragraphPlainControllerRef.current!.undoOverlay()
    },

    redoParagraphPlain() {
      paragraphPlainControllerRef.current!.redoOverlay()
    },

    selectAllParagraphPlain() {
      paragraphPlainControllerRef.current!.selectAllOverlay()
    },

    setParagraphPlainMode(enabled: boolean): boolean {
      resetHomeEndState()
      return paragraphPlainControllerRef.current!.setMode(enabled)
    },

    toggleParagraphPlainMode(): boolean {
      return paragraphPlainControllerRef.current!.toggleMode()
    },

    isParagraphPlainModeActive(): boolean {
      return paragraphPlainControllerRef.current!.isActive()
    },
    commitParagraphPlainIfActive(): boolean {
      return paragraphPlainControllerRef.current!.commitIfActive()
    },
    hasParagraphPlainPendingOverlayChanges(): boolean {
      return paragraphPlainControllerRef.current!.hasPendingOverlayChanges()
    },
    onParagraphPlainModeChange(listener: ParagraphPlainModeListener): () => void {
      return paragraphPlainControllerRef.current!.onModeChange(listener)
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
      typewriterModeController?.noteJumpNavigationSuppress('viewport-restore')
      restoreViewportAnchor(editor.view, anchor)
    },

    scrollEditorSurfaceToRatio(ratio: number) {
      typewriterModeController?.noteJumpNavigationSuppress('programmatic-scroll')
      scrollEditorSurfaceToRatio(editor.view, ratio)
    },

    scrollEditorSurfaceToTextOffset(textOffset: number): boolean {
      typewriterModeController?.noteJumpNavigationSuppress('programmatic-scroll')
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
    isComposing(): boolean { return isComposing || editor.view.composing },

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

    syncTypewriterRuntimeState() {
      typewriterModeController?.syncRuntimeState()
    },

    nudgeDecorationsRefresh() {
      const tr = editor.state.tr.setMeta('addToHistory', false)
      editor.view.dispatch(tr)
    },

    scheduleVisualFocusCurrentLineUpdate() {
      visualFocusCurrentLineController?.scheduleUpdate()
    },

    schedulePseudoCaretUpdate() {
      pseudoCaretController?.scheduleUpdate()
    },

    destroy() {
      unsubscribeTypewriterParagraphPlainMode()
      visualFocusCurrentLineController?.destroy()
      visualFocusCurrentLineController = null
      pseudoCaretController?.destroy()
      pseudoCaretController = null
      typewriterModeController?.destroy()
      searchController.destroy()
      paragraphPlainControllerRef.current!.destroy()
      unregisterMacosArrowScrollClampHost?.()
      unregisterMacosArrowScrollClampHost = null
      unbindDomEvents()
      if (editorSurface && wheelScrollController) {
        editorSurface.removeEventListener('wheel', wheelScrollController.onWheel)
      }
      wheelScrollController?.destroy()
      foldTooltipController.destroy()
      noteAnchorPreviewController?.destroy()
      noteAnchorPreviewController = null
      noteAnchorJumpController?.destroy()
      noteAnchorJumpController = null
      listenerSubscriptions.clearAll()
      editor.destroy()
    },
  }

  return handle
}
