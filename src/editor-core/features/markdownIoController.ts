import type { LineBreakPolicy } from '../types'

type LogPush = (event: string, detail: string) => void

type CanonicalDiffOperation = {
  type: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  preview: string
}

type CanonicalDiffResult = {
  exact: boolean
  changedLines: number
  totalLines: number
  lineRate: number
  insertedLines: number
  deletedLines: number
  replacedLines: number
  movedLinesDetected: number
  operations: CanonicalDiffOperation[]
  moveHints: string[]
}

type SplitFrontmatterResult = {
  frontmatterPrefix: string
  body: string
  hasFrontmatter: boolean
}

type CreateMarkdownIoControllerOptions = {
  getLineBreakPolicy: () => LineBreakPolicy
  setParagraphPlainMode: (enabled: boolean) => void
  parseMarkdownToJson: (markdownBody: string, lineBreakPolicy: LineBreakPolicy) => unknown
  setEditorContent: (content: unknown) => void
  clearEditorHistory: () => void
  serializeCurrentDoc: (lineBreakPolicy: LineBreakPolicy) => string
  defaultEditorContent: unknown
  splitLeadingFrontmatter: (markdown: string) => SplitFrontmatterResult
  joinWithFrontmatter: (frontmatterPrefix: string, body: string) => string
  applyDocumentMarkdownOptionsForLoad?: (args: {
    frontmatterPrefix: string
    markdownBody: string
    lineBreakPolicy: LineBreakPolicy
  }) => void
  measureCanonicalDiff: (source: string, canonical: string) => CanonicalDiffResult
  shortenForLog: (value: string, maxLength: number) => string
  maxDiffLogOps: number
  maxDiffLogLength: number
  pushLog: LogPush
  /** BETA-SP8: DEV 時のみ canonical diff/詳細ログを実行する */
  devMode?: boolean
}

export function createMarkdownIoController({
  getLineBreakPolicy,
  setParagraphPlainMode,
  parseMarkdownToJson,
  setEditorContent,
  clearEditorHistory,
  serializeCurrentDoc,
  defaultEditorContent,
  splitLeadingFrontmatter,
  joinWithFrontmatter,
  applyDocumentMarkdownOptionsForLoad,
  measureCanonicalDiff,
  shortenForLog,
  maxDiffLogOps,
  maxDiffLogLength,
  pushLog,
  devMode = false,
}: CreateMarkdownIoControllerOptions): {
  loadMarkdown: (markdown: string) => void
  setFrontmatterPrefix: (nextFrontmatterPrefix: string) => void
  saveMarkdown: () => string
  peekMarkdown: () => string
  reset: () => void
} {
  let frontmatterPrefix = ''

  function loadMarkdown(markdown: string): void {
    setParagraphPlainMode(false)
    const split = splitLeadingFrontmatter(markdown)
    frontmatterPrefix = split.frontmatterPrefix

    const currentPolicy = getLineBreakPolicy()
    applyDocumentMarkdownOptionsForLoad?.({
      frontmatterPrefix,
      markdownBody: split.body,
      lineBreakPolicy: currentPolicy,
    })
    const content = parseMarkdownToJson(split.body, currentPolicy)
    setEditorContent(content)

    if (split.hasFrontmatter) {
      pushLog('frontmatter', 'detected:hidden-in-normal-view')
    }

    // BETA-SP8: canonical serialize + diff + 詳細ログは DEV 時のみ実行する。
    // production では軽量な要約ログだけ出す。
    if (devMode) {
      const canonicalBody = serializeCurrentDoc(currentPolicy)
      const canonical = joinWithFrontmatter(frontmatterPrefix, canonicalBody)
      const diff = measureCanonicalDiff(markdown, canonical)
      const sourceLineCount = markdown === '' ? 0 : markdown.split('\n').length
      const canonicalLineCount = canonical === '' ? 0 : canonical.split('\n').length
      pushLog(
        'canonicalInput',
        `source chars=${markdown.length} lines=${sourceLineCount} canonical chars=${canonical.length} lines=${canonicalLineCount}`,
      )

      const summary =
        `policy=${currentPolicy} exact=${diff.exact ? 'true' : 'false'} ` +
        `changed=${diff.changedLines}/${diff.totalLines} (${(diff.lineRate * 100).toFixed(1)}%) ` +
        `ins=${diff.insertedLines} del=${diff.deletedLines} rep=${diff.replacedLines} move~=${diff.movedLinesDetected}`
      pushLog('canonicalDiff', summary)

      if (diff.operations.length > 0) {
        const detail = diff.operations
          .slice(0, maxDiffLogOps)
          .map((op) => {
            const oldRange = `${op.oldStart}-${op.oldStart + Math.max(0, op.oldCount - 1)}`
            const newRange = `${op.newStart}-${op.newStart + Math.max(0, op.newCount - 1)}`
            return `${op.type} old:${oldRange} new:${newRange} ${op.preview}`
          })
          .join(' | ')
        pushLog('canonicalDiffOps', shortenForLog(detail, maxDiffLogLength))
      }

      if (diff.moveHints.length > 0) {
        pushLog('canonicalDiffMove', shortenForLog(diff.moveHints.join(' | '), maxDiffLogLength))
      }
    } else {
      pushLog('canonicalInput', `source chars=${markdown.length} policy=${currentPolicy}`)
    }

    pushLog('io', 'loadMarkdown')
  }

  function peekMarkdown(): string {
    const body = serializeCurrentDoc(getLineBreakPolicy())
    return joinWithFrontmatter(frontmatterPrefix, body)
  }

  function setFrontmatterPrefix(nextFrontmatterPrefix: string): void {
    if (frontmatterPrefix === nextFrontmatterPrefix) return
    frontmatterPrefix = nextFrontmatterPrefix
    pushLog(
      'frontmatter',
      nextFrontmatterPrefix ? 'updated:prefix-only' : 'cleared:prefix-only',
    )
  }

  function saveMarkdown(): string {
    const markdown = peekMarkdown()
    // BETA-SP10: production では save ログを抑制する。
    // 実ファイル書き込み成否は上位 (saveDocument) で管理されるため、
    // この serialize 完了ログは dev 診断用で十分。
    if (devMode) {
      pushLog('io', 'saveMarkdown')
    }
    return markdown
  }

  function reset(): void {
    setParagraphPlainMode(false)
    frontmatterPrefix = ''
    setEditorContent(defaultEditorContent)
    clearEditorHistory()
    pushLog('io', 'reset')
  }

  return {
    loadMarkdown,
    setFrontmatterPrefix,
    saveMarkdown,
    peekMarkdown,
    reset,
  }
}
