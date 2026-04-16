/** Log entry emitted by EditorCore */
export type LogEntry = {
  id: number
  event: string
  detail: string
  at: string
}

/** Callback for log events */
export type LogListener = (entry: LogEntry) => void

/** Callback for selection state changes */
export type SelectionListener = (snapshot: string) => void

/** Callback for paragraph plain mode state changes */
export type ParagraphPlainModeListener = (active: boolean) => void

/** Markdown line break policy */
export type LineBreakPolicy = 'obsidian-paragraph' | 'commonmark-strict'

/** Callback for line break policy changes */
export type LineBreakPolicyListener = (policy: LineBreakPolicy) => void

export type SelectionRange = { from: number; to: number }

export type RubyEditContext = {
  from: number
  to: number
  text: string
  ruby: string
  overlapsExistingRuby: boolean
}

export type ParagraphSourceContext = {
  from: number
  to: number
  markdown: string
}

export type ClientRectSnapshot = {
  top: number
  left: number
  width: number
  height: number
}

/** Heading info extracted from the document for outline display */
export type HeadingInfo = {
  level: number
  text: string
  pos: number
}

export type HeadingUiSnapshot = {
  headings: HeadingInfo[]
  activeHeadingIndex: number
  foldedHeadingPositions: Set<number>
}

/** Callback for content update events (for dirty tracking) */
export type UpdateListener = () => void

/** Callback for safely opening an already validated external URL. */
export type OpenExternalUrl = (url: string) => Promise<boolean>

/** Snapshot of which context-menu commands can run right now */
export type CommandAvailability = {
  hasSelection: boolean
  canBold: boolean
  canItalic: boolean
  canStrike: boolean
  canHighlight: boolean
  canInlineCode: boolean
  canClearFormat: boolean
  canBlockTransforms: boolean
  canUndo: boolean
  canRedo: boolean
  canInsertRuby: boolean
  canParagraphPlain: boolean
  canToggleTcy: boolean
  canCopy: boolean
  canCut: boolean
  canPaste: boolean
  canSelectAll: boolean
  canMoveListUp: boolean
  canMoveListDown: boolean
  isHeading: false | number
  isBold: boolean
  isItalic: boolean
  isStrike: boolean
  isHighlight: boolean
  isInlineCode: boolean
  isBulletList: boolean
  isOrderedList: boolean
  isChecklist: boolean
  isBlockquote: boolean
  isCodeBlock: boolean
}

/** Search state snapshot (for UI) */
export type SearchState = {
  query: string
  caseSensitive: boolean
  matchCount: number
  currentIndex: number // 0-based, -1 if no match
}

/** Callback for search state changes */
export type SearchStateListener = (state: SearchState) => void

/** Public API surface that App.tsx may use */
export interface EditorCoreHandle {
  /** Undo the previous transaction */
  undo(): boolean

  /** Redo the previously undone transaction */
  redo(): boolean

  /** Execute a formatting command */
  execute(command: 'bold' | 'italic' | 'strike' | 'highlight'): void

  /** Toggle inline code mark */
  toggleInlineCode(): void

  /** Remove all inline marks from the selection */
  clearFormat(): void

  /** Toggle checked/unchecked state of current checklist item */
  toggleChecklistChecked(): void

  /** Toggle checklist mode on selected list items */
  toggleChecklist(): void

  /** Toggle bullet list */
  toggleBulletList(): void

  /** Toggle ordered list */
  toggleOrderedList(): void

  /** Toggle blockquote */
  toggleBlockquote(): void

  /** Toggle code block */
  toggleCodeBlock(): void

  /** Insert a horizontal rule */
  insertHorizontalRule(): void

  /** Select the full document */
  selectAll(): void

  /** Move the current list item up (toward document start). Returns true if moved. */
  moveListItemUp(): boolean

  /** Move the current list item down (toward document end). Returns true if moved. */
  moveListItemDown(): boolean

  /** Get currently selected text */
  getSelectedText(): string

  /** Get current selection range (from/to positions) */
  getSelectionRange(): SelectionRange

  /** Resolve ruby editing target from current selection */
  getRubyEditContext(): RubyEditContext | null

  /** Insert ruby annotation on the currently selected text */
  insertRuby(ruby: string, range?: SelectionRange): void

  /** Resolve paragraph source edit target from current selection */
  getParagraphSourceContext(range?: SelectionRange): ParagraphSourceContext | null

  /** Replace selected paragraph with markdown source (single paragraph only) */
  replaceParagraphSource(markdown: string, range?: SelectionRange): boolean

  /** Get client rect of selected paragraph for same-view plain overlay */
  getParagraphClientRect(range?: SelectionRange): ClientRectSnapshot | null

  /** Execute native undo on the paragraph plain overlay textarea (BETA-C1) */
  undoParagraphPlain(): void

  /** Execute native redo on the paragraph plain overlay textarea (BETA-C1) */
  redoParagraphPlain(): void

  /** Select all text in the paragraph plain overlay textarea. */
  selectAllParagraphPlain(): void

  /** Enable or disable paragraph plain mode (ID16) */
  setParagraphPlainMode(enabled: boolean): boolean

  /** Toggle paragraph plain mode (ID16) */
  toggleParagraphPlainMode(): boolean

  /** Returns whether paragraph plain mode is active */
  isParagraphPlainModeActive(): boolean

  /** Commit Paragraph Plain overlay edits into PM Doc if the mode is active. */
  commitParagraphPlainIfActive(): boolean

  /** Subscribe paragraph plain mode state changes */
  onParagraphPlainModeChange(listener: ParagraphPlainModeListener): () => void

  /** Returns current markdown line break policy */
  getLineBreakPolicy(): LineBreakPolicy

  /** Set markdown line break policy */
  setLineBreakPolicy(policy: LineBreakPolicy): LineBreakPolicy

  /** Apply line-break normalization to current document immediately using given policy */
  applyLineBreakPolicyNow(policy: LineBreakPolicy): boolean

  /** Subscribe line break policy changes */
  onLineBreakPolicyChange(listener: LineBreakPolicyListener): () => void

  /** Toggle tate-chu-yoko on selected text (2-4 chars, [A-Za-z0-9!?]) */
  toggleTcy(): void

  /** Insert bouten (emphasis dots) on each character of the selection */
  insertBouten(emphasisChar: string, range?: SelectionRange): void

  /** Set or unset a link. Reads current href internally. */
  setLink(href: string | null, range?: SelectionRange): void

  /** Insert an inline image node at the cursor */
  insertImage(src: string, alt: string, title?: string): void

  /** Get the current link href at cursor, or undefined */
  getLinkHref(): string | undefined

  /** Load Markdown into the editor, replacing current content */
  loadMarkdown(md: string): void

  /** Replace only the hidden frontmatter prefix without reparsing the body or clearing history */
  setFrontmatterPrefix(prefix: string): void

  /** Serialize current editor content to Markdown */
  saveMarkdown(): string

  /** Read current editor content as Markdown without emitting save logs */
  peekMarkdown(): string

  /** Reset editor to default content */
  reset(): void

  /** Clear undo/redo history. Call at document-load boundaries only. */
  clearHistory(): void

  /** Subscribe to log events; returns unsubscribe function */
  onLog(listener: LogListener): () => void

  /** Subscribe to selection state changes; returns unsubscribe function */
  onSelectionUpdate(listener: SelectionListener): () => void

  /** Subscribe to content update events (for dirty tracking) */
  onUpdate(listener: UpdateListener): () => void

  /** Snapshot of which commands can run for context-menu disabled state */
  getCommandAvailability(): CommandAvailability

  /** Toggle heading level (1-6). level=0 always converts to paragraph. */
  toggleHeading(level: number): void

  /** Extract heading list from current document (for outline) */
  getHeadings(): HeadingInfo[]

  /** Collect heading-related UI state in one pass for outline refreshes. */
  getHeadingSnapshot(): HeadingUiSnapshot

  /** Return the index of the heading that "owns" the current cursor position.
   *  Returns -1 if the cursor is before the first heading. */
  getActiveHeadingIndex(): number

  /** Subscribe to fold state changes (display-only, not doc edits); returns unsubscribe */
  onFoldChange(listener: UpdateListener): () => void

  /** Toggle fold state for the heading at the given document position */
  toggleHeadingFold(pos: number): void

  /** Return the set of currently folded heading positions */
  getFoldedHeadingPositions(): Set<number>

  /** Unfold all headings */
  unfoldAll(): void

  /** Scroll editor to the given document position (auto-unfolds ancestors) */
  scrollToPos(pos: number): void

  /** Return a short preview text for the heading body at the given position */
  getHeadingPreview(pos: number): string

  /** Jump to the previous heading (move cursor). Returns true if jump occurred. */
  jumpToPreviousHeading(): boolean

  /** Jump to the next heading (move cursor). Returns true if jump occurred. */
  jumpToNextHeading(): boolean

  /** Toggle fold state of the heading that owns the current cursor position. Returns true if toggled. */
  toggleCurrentHeadingFold(): boolean

  // --- Search / Replace ---

  /** Set search query and update highlights. Returns match count. */
  setSearchQuery(query: string, caseSensitive: boolean): number

  /** Move to the next search match. Returns new current index. */
  searchNext(): number

  /** Move to the previous search match. Returns new current index. */
  searchPrev(): number

  /** Replace the current match with replacement text. Returns new match count. */
  replaceCurrentMatch(replacement: string): number

  /** Replace all matches with replacement text. Returns replaced count. */
  replaceAllMatches(replacement: string): number

  /** Close search (clear highlights and state) */
  closeSearch(): void

  /** Get current search state snapshot */
  getSearchState(): SearchState

  /** Subscribe to search state changes; returns unsubscribe */
  onSearchStateChange(listener: SearchStateListener): () => void

  /** Set whether ruby parsing is enabled (hard ruby OFF when false) */
  setEnableRuby(enabled: boolean): void

  /** Returns whether ruby parsing is currently enabled */
  isRubyEnabled(): boolean

  /** Update display-only auto TCY runtime options. */
  setAutoTcyOptions(options: {
    enabled: boolean
    numbersOnly: boolean
    minDigits: number
    maxDigits: number
  }): void

  /** Focus the editor (BETA-A11Y1) */
  focusEditor(): void

  /** Clean up resources */
  destroy(): void
}
