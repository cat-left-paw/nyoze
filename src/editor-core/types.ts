import type { SpecialInlineAdjacentPmInspection } from './features/specialInlineBoundaryDiagnostics'
import type { NoteColorId } from '../project/noteColor'
import type { DirectiveDescriptor } from './io/customBlockDirective'
import type { AozoraTextExportResult, AozoraTextExportOptions } from './export/aozoraTextExport'
import type { LeMEMarkdownExportResult, LeMEMarkdownExportOptions } from './export/lemeMarkdownExport'
import type { DendenMarkdownExportResult, DendenMarkdownExportOptions } from './export/dendenMarkdownExport'
import type { WebBookExportOptions, WebBookExportResult } from './export/webBookExport'

export type { SpecialInlineAdjacentPmInspection }

/** Custom block directive descriptor (Nyoze 独自ブロック装飾) */
export type CustomBlockDirectiveDescriptor = DirectiveDescriptor

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

/** Per-document Markdown serialization / parse options. */
export type MarkdownDocumentOptions = {
  preserveEmptyParagraphs: boolean
}

export type SelectionRange = { from: number; to: number }

export type RubyEditContext = {
  from: number
  to: number
  text: string
  ruby: string
  overlapsExistingRuby: boolean
  hasDelimiter: boolean
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

/**
 * Layout-independent anchor into the current document, used to restore the
 * editor surface near the same content position after writing-mode toggle or
 * Source Mode round-trip. Both fields are optional hints; callers pick the
 * best available axis.
 */
export type ViewportAnchor = {
  /** PM doc position nearest the viewport center. Clamped to doc bounds. */
  pmPos: number
  /**
   * Accumulated `textBetween(0, pmPos, '\n')` length up to `pmPos`. Useful for
   * approximate line-number mapping with plain-text editors (Source Mode).
   */
  textOffset: number
  /** Total PM doc text length at capture time (for ratio fallback). */
  textTotal: number
}

/** Callback for safely opening an already validated external URL. */
export type OpenExternalUrl = (url: string) => Promise<boolean>

/** Snapshot of which context-menu commands can run right now */
export type CommandAvailability = {
  hasSelection: boolean
  /**
   * 非空だが、付箋マーカー自身への NodeSelection だけの場合は false になる。
   * context menu が「実際の非空テキスト選択」かどうかを判定する用途専用。
   * 通常の書式コマンド可否判定には `hasSelection` を使うこと。
   */
  hasNonAnchorTextSelection: boolean
  canBold: boolean
  canItalic: boolean
  canStrike: boolean
  canHighlight: boolean
  canUnderline: boolean
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
  isUnderline: boolean
  isInlineCode: boolean
  isBulletList: boolean
  isOrderedList: boolean
  isChecklist: boolean
  isBlockquote: boolean
  isCodeBlock: boolean
  /** 現在の selection に対して独自ブロック装飾を適用 / 解除できるか */
  canBlockDirective: boolean
  /** 現在 selection が属する directive の正規 token (例: 'align-center')。なければ null。 */
  blockDirectiveToken: string | null
  /** 現在 selection が改ページ marker (`nyozePageBreak`) を NodeSelection として選択しているか */
  canDeletePageBreak: boolean
  noteAnchorContextId: string | null
  touchesNoteAnchor: boolean
  canShowNoteInPanel: boolean
  canDeleteNoteAnchor: boolean
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
  execute(command: 'bold' | 'italic' | 'strike' | 'highlight' | 'underline'): void

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

  /**
   * Apply (or replace) a Nyoze custom block directive on the current block /
   * selected top-level blocks. `token` is a canonical directive token such as
   * 'align-center' / 'align-end' / 'indent-3' / 'style-letter'. Returns true if
   * the document changed.
   */
  applyCustomBlockDirective(token: string): boolean

  /** Remove the enclosing custom block directive wrapper, keeping its content. */
  removeCustomBlockDirective(): boolean

  /** Canonical token of the directive enclosing the current selection, or null. */
  getCustomBlockDirectiveToken(): string | null

  /**
   * Insert a Nyoze page-break marker (`nyozePageBreak`) after the current
   * top-level block. Does not delete existing selection content. Returns true
   * if the document changed.
   */
  insertPageBreak(): boolean

  /**
   * Delete the page-break marker (`nyozePageBreak`) currently selected as a
   * NodeSelection. No-op (returns false) if the selection is not a page-break
   * node. Returns true if the document changed.
   */
  deletePageBreak(): boolean

  /**
   * Insert a Nyoze blank-page marker (`nyozeBlankPage`) after the current
   * top-level block. Does not delete existing selection content. Returns true
   * if the document changed. `count` is optional and defaults to 1 (backward
   * compatible with the previous count=1-only behavior); out-of-range or
   * non-numeric values are clamped/normalized to 1-20.
   */
  insertBlankPage(count?: number): boolean

  /** Export the current PM document as Aozora-style plain text (does not serialize Markdown). */
  exportAozoraText(options?: AozoraTextExportOptions): AozoraTextExportResult

  /** Export the current PM document as LeME-compatible Markdown (does not serialize Markdown). */
  exportLeMEMarkdown(options?: LeMEMarkdownExportOptions): LeMEMarkdownExportResult

  /** Export the current PM document as Denden-compatible Markdown (does not serialize Markdown). */
  exportDendenMarkdown(options?: DendenMarkdownExportOptions): DendenMarkdownExportResult

  /** Export the current PM document as a standalone Web Book HTML reader. */
  exportWebBook(options?: WebBookExportOptions): WebBookExportResult

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

  /**
   * E2E / 調査: 折りたたみ選択が `aozoraRuby` / `aozoraTcy` の直上・直後か。
   */
  inspectSpecialInlineAdjacentCaretPm(): SpecialInlineAdjacentPmInspection

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

  /** True when Paragraph Plain overlay text differs from the original block markdown. */
  hasParagraphPlainPendingOverlayChanges(): boolean

  /** Subscribe paragraph plain mode state changes */
  onParagraphPlainModeChange(listener: ParagraphPlainModeListener): () => void

  /** Returns current markdown line break policy */
  getLineBreakPolicy(): LineBreakPolicy

  /** Set markdown line break policy */
  setLineBreakPolicy(policy: LineBreakPolicy): LineBreakPolicy

  /** Update per-document Markdown options without reparsing the current document. */
  setDocumentMarkdownOptions(options: MarkdownDocumentOptions): MarkdownDocumentOptions

  /** Read the effective per-document Markdown options currently used by the core. */
  getDocumentMarkdownOptions(): MarkdownDocumentOptions

  /** Apply line-break / document-option normalization to current document immediately. */
  applyLineBreakPolicyNow(
    policy: LineBreakPolicy,
    options?: MarkdownDocumentOptions,
  ): boolean

  /** Subscribe line break policy changes */
  onLineBreakPolicyChange(listener: LineBreakPolicyListener): () => void

  /** Toggle tate-chu-yoko on selected text (1-4 chars, [A-Za-z0-9!?]) */
  toggleTcy(): void

  /** Insert bouten (emphasis dots) on each character of the selection */
  insertBouten(emphasisChar: string, range?: SelectionRange): void

  /** Set or unset a link. Reads current href internally. */
  setLink(href: string | null, range?: SelectionRange): void

  /** Insert an inline image node at the cursor */
  insertImage(src: string, alt: string, title?: string): void

  /**
   * 付箋アンカー (noteAnchor) を挿入する (Task 3A-3)。
   * collapsed selection はキャレット位置、non-collapsed は選択末尾へ挿入する。
   * 挿入できない場合 (invalid id / schema 不在 / 非 textblock) は false。
   */
  insertNoteAnchor(id: string, range?: SelectionRange): boolean

  /**
   * noteAnchor marker の hover preview (data-note-anchor-preview) を DOM へ反映する。
   * editor-only 表示更新であり、PM doc / dirty state は変更しない。
   */
  setNoteAnchorPreviews(previews: Record<string, string>): void
  setNoteAnchorColors(colors: Record<string, NoteColorId>): void

  /**
   * 右ペイン等から対応 noteAnchor marker へスクロール / selection を移動する。
   * 見つからない、または editor surface が未接続のときは false。
   * PM doc / Markdown は変更しない。
   */
  scrollToNoteAnchor(id: string): boolean

  /** 本文から noteAnchor node を専用削除する。filterTransaction meta 付き。 */
  removeNoteAnchor(id: string): boolean

  /**
   * 右クリックした DOM marker に対応する noteAnchor を優先削除する。
   * 解決できない場合は id 一致の最初の 1 個へ fallback する。
   */
  removeNoteAnchorAtDomMarker(markerElement: Element | null, id: string): boolean

  /** 現 PM doc 内の noteAnchor id 一覧。 */
  getNoteAnchorIdsInDoc(): string[]

  /** noteAnchor marker クリック時のコールバック。PM selection は変更しない。 */
  setOnNoteAnchorReveal(listener: ((id: string) => void) | null): void

  /** Get the current link href at cursor, or undefined */
  getLinkHref(): string | undefined

  /** Load Markdown into the editor, replacing current content */
  loadMarkdown(md: string): void

  /** Disable editing (built-in read-only help tabs). Does not remove extensions. */
  setReadOnly(readOnly: boolean): void

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

  /**
   * Snapshot a layout-independent viewport anchor near the visible center of
   * the PM editor surface. Returns null when the surface is hidden / detached.
   */
  captureViewportAnchor(): ViewportAnchor | null

  /**
   * Scroll the PM editor surface so the given anchor's PM position is near the
   * viewport center, without moving the cursor or stealing focus. rAF timing
   * is managed by the caller.
   */
  restoreViewportAnchor(anchor: ViewportAnchor): void

  /**
   * Scroll the PM editor surface so a doc position roughly at the given ratio
   * (0..1) is near the viewport center. Approximate fallback when exact PM
   * pos mapping is unavailable (Source Mode round-trip).
   */
  scrollEditorSurfaceToRatio(ratio: number): void

  /**
   * Scroll the PM editor surface so a position near the given PM text offset
   * (`doc.textBetween` axis) is centered. Returns false when the surface is
   * hidden / detached or the offset cannot be resolved.
   */
  scrollEditorSurfaceToTextOffset(textOffset: number): boolean

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

  /**
   * Read-only: whether the editor is currently in an IME composition.
   * Returns the existing internal `isComposing` flag OR `editor.view.composing`.
   * Does not start/stop composition, add listeners, or change PM/DOM state.
   */
  isComposing(): boolean

  /** Update display-only auto TCY runtime options. */
  setAutoTcyOptions(options: {
    enabled: boolean
    numbersOnly: boolean
    minDigits: number
    maxDigits: number
  }): void

  /** Focus the editor (BETA-A11Y1) */
  focusEditor(): void

  /**
   * Re-evaluate Typewriter scroll past end spacer vs settings / Source Mode.
   * Safe no-op when Typewriter controller is unavailable.
   */
  syncTypewriterRuntimeState(): void

  /** Force ProseMirror decoration pass (e.g. Visual Focus toggle without doc change). */
  nudgeDecorationsRefresh(): void

  /** Recompute Visual Focus current-line overlay (settings / mode / layout). */
  scheduleVisualFocusCurrentLineUpdate(): void

  /** Recompute pseudo caret overlay (settings / mode / layout). */
  schedulePseudoCaretUpdate(): void

  /** Clean up resources */
  destroy(): void
}
