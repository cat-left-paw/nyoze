import MarkdownIt from 'markdown-it'

let previewMarkdownIt: MarkdownIt | null = null

function getPreviewMarkdownIt(): MarkdownIt {
  if (!previewMarkdownIt) {
    previewMarkdownIt = new MarkdownIt({
      html: false,
      linkify: false,
      typographer: false,
      breaks: true,
    })
    // 初期スコープでは Markdown link もリンク化しない。
    previewMarkdownIt.disable(['link'])
  }
  return previewMarkdownIt
}

/**
 * 付箋本文向けの軽量 Markdown → safe HTML。
 * 本文 editor の parse/serialize とは独立。raw HTML は無効化する。
 */
export function renderNoteMarkdownPreview(markdown: string): string {
  return getPreviewMarkdownIt().render(markdown ?? '')
}
