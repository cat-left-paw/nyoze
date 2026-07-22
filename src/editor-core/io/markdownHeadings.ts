/**
 * Book全体Outline（第3期B / Outline 拡張）用の、Markdown ATX 見出し抽出 pure helper。
 *
 * - filesystem / Electron / PM doc に依存しない純粋関数。read-only。
 * - 入力は frontmatter を除いた本文 Markdown を想定する（呼び出し側で
 *   {@link splitLeadingFrontmatter} の body を渡す）。YAML コメント行 `# ...` を
 *   見出しと誤検出しないため、frontmatter は事前に剥がしておくこと。
 * - 対象は ATX 見出し（`#`〜`######` + 空白 + テキスト）のみ。Setext 見出し
 *   （`===` / `---` 下線）は初期スコープ外。
 * - fenced code block（``` / ~~~）内の `#` 行は見出しにしない。
 */

export type OutlineHeading = {
  /** 1〜6。`#` の数。 */
  level: number;
  /** 見出しテキスト（前後空白と ATX closing `#` を除去済み）。 */
  text: string;
}

/**
 * 見出しと、本文プレビュー用 excerpt をまとめた抽出結果。
 *
 * - `headings`: {@link extractMarkdownHeadings} と同じ ATX 見出し列。
 * - `intro`: 章ファイル本文冒頭の短い excerpt（章 root preview 用）。
 * - `headingPreviews`: `headings` と同順の、各見出し直後の本文 excerpt（見出し preview 用）。
 *
 * preview は表示専用で Markdown を書き換えない。fenced code の fence 行 / frontmatter は
 * preview から除外する（呼び出し側で frontmatter は剥がして渡す前提）。
 */
export type OutlineExtraction = {
  headings: OutlineHeading[];
  intro: string;
  headingPreviews: string[];
}

/** 暴走防止の上限。極端に大きいファイルでも見出し配列を抑える。 */
const MAX_HEADINGS = 2000

/** preview excerpt の最大ブロック数（単文書 Outline preview と揃える）。 */
const PREVIEW_MAX_LINES = 3
/** preview excerpt 1 ブロックの最大文字数（単文書 Outline preview と揃える）。 */
const PREVIEW_MAX_CHARS = 50

/**
 * 行頭の軽量な Markdown マーカー（引用 `>` / 箇条書き `- * +` / 番号 `1.` `1)`）を
 * 表示用に取り除く。inline 記法は破壊しない（best-effort な可読性向上のみ）。
 */
function cleanPreviewLine(line: string): string {
  return line.replace(/^\s{0,3}(?:>\s?|[-*+]\s+|\d{1,9}[.)]\s+)+/, '').trim()
}

/** ブロック列から PREVIEW_MAX_LINES / PREVIEW_MAX_CHARS で丸めた excerpt を作る。 */
function buildExcerpt(blocks: readonly string[]): string {
  const out: string[] = []
  for (const block of blocks) {
    if (out.length >= PREVIEW_MAX_LINES) break
    const text = block.trim()
    if (!text) continue
    out.push(text.length > PREVIEW_MAX_CHARS ? text.slice(0, PREVIEW_MAX_CHARS) + '\u2026' : text)
  }
  return out.join('\n')
}

/**
 * 本文 Markdown から ATX 見出しと、preview 用 excerpt を 1 パスで抽出する。
 *
 * - 見出し判定は {@link extractMarkdownHeadings} と同一仕様。
 * - intro は本文冒頭から最大 PREVIEW_MAX_LINES ブロック（見出し行は飛ばし、本文ブロックを
 *   章全体の先頭から拾う）。
 * - 各見出し preview は、その見出し直後〜次見出し直前の本文ブロック。
 * - fenced code は fence 行を除外し、中身は本文ブロックとして扱う。read-only で
 *   Markdown を書き換えない。
 */
export function extractMarkdownOutline(body: string): OutlineExtraction {
  const lines = body.split(/\r\n|\r|\n/)
  const headings: OutlineHeading[] = []
  const headingPreviews: string[] = []
  const introBlocks: string[] = []

  let inFence = false
  let fenceChar = ''
  let fenceLength = 0

  let currentBlock: string[] = []
  let sectionBlocks: string[] = []
  // -1: まだ最初の見出し前（intro のみ）。0 以上: その見出しの preview を蓄積中。
  let target = -1
  // intro は「章冒頭の本文セクション」だけを拾う。最初の本文セクション以降は足さない
  // （先頭が見出しの章でも、その直後の本文を冒頭 excerpt として拾えるようにするため
  //  最初の本文が出るまでは閉じない）。
  let introClosed = false

  const finalizeBlock = () => {
    if (currentBlock.length === 0) return
    const block = currentBlock.join(' ').trim()
    currentBlock = []
    if (!block) return
    if (!introClosed && introBlocks.length < PREVIEW_MAX_LINES) introBlocks.push(block)
    if (target >= 0 && sectionBlocks.length < PREVIEW_MAX_LINES) sectionBlocks.push(block)
  }

  const flushHeadingPreview = () => {
    finalizeBlock()
    if (target >= 0) headingPreviews[target] = buildExcerpt(sectionBlocks)
    sectionBlocks = []
  }

  for (const line of lines) {
    // fenced code block の開始 / 終了を追う（先頭最大 3 空白までインデント許容）。
    // fence 境界では preview ブロックを区切り、code block を独立ブロックとして扱う。
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (fence) {
      const marker = fence[1]
      const char = marker[0]
      if (!inFence) {
        finalizeBlock()
        inFence = true
        fenceChar = char
        fenceLength = marker.length
      } else if (char === fenceChar && marker.length >= fenceLength && fence[2].trim() === '') {
        inFence = false
        fenceChar = ''
        fenceLength = 0
        finalizeBlock()
      }
      continue
    }
    if (inFence) {
      const codeText = line.trim()
      if (codeText) currentBlock.push(codeText)
      continue
    }

    // ATX 見出し: 先頭最大 3 空白 + `#`×1〜6 +（空白 + テキスト）省略可 + 行末。
    // `#foo`（`#` 直後にテキスト）は CommonMark 上見出しではないので除外される。
    const m = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/)
    if (m) {
      flushHeadingPreview()
      // 章冒頭の本文セクションを 1 つ拾い終えたら、以降は intro へ足さない。
      if (introBlocks.length > 0) introClosed = true
      if (headings.length >= MAX_HEADINGS) break
      const level = m[1].length
      // ATX closing sequence（末尾の ` ###`）を取り除く。
      const text = (m[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim()
      headings.push({ level, text })
      target = headingPreviews.length
      headingPreviews.push('')
      continue
    }

    // 本文行。空行はブロック区切り。
    if (line.trim() === '') {
      finalizeBlock()
      continue
    }
    currentBlock.push(cleanPreviewLine(line))
  }

  flushHeadingPreview()

  return { headings, intro: buildExcerpt(introBlocks), headingPreviews }
}

/**
 * 本文 Markdown から ATX 見出しを順番どおりに抽出する。
 *
 * preview を伴わない既存呼び出し向けの薄い委譲。詳細仕様は {@link extractMarkdownOutline}。
 */
export function extractMarkdownHeadings(body: string): OutlineHeading[] {
  return extractMarkdownOutline(body).headings
}

/**
 * 見出しテキストの比較用正規化。前後空白除去 + 連続空白の単一化。
 *
 * Book全体Outline の見出しジャンプで、Markdown 由来テキストと PM doc の
 * `textContent` を best-effort 照合するときに、抽出側と解決側で同じ正規化を使う。
 * インライン記法（強調・リンク等）の差は吸収しない（その場合は occurrence /
 * index fallback で best-effort に解決する）。
 */
export function normalizeHeadingText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}
