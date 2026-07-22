/**
 * Outline 拡張（第3期B）: Book全体Outline の見出し / preview 読み取り I/O（main process 側）。
 *
 * 章ファイル本文から Markdown 見出しと、章 root / 見出し用の preview excerpt を抽出する。
 * frontmatter は剥がしてから {@link extractMarkdownOutline} に渡す。read-only で、
 * 対象ファイルを書き換えない。
 *
 * - 1 ファイルあたり bounded read（巨大ファイルでも outline 計算を軽量に保つ）。
 *   preview excerpt も同じ bounded buffer の範囲内で抽出し、追加のファイル読み取りはしない。
 * - 読めないファイルは空の outline（scan 全体は壊さない）。
 * - renderer からは何も受け取らない。呼び出し側（electron/projectIpc.ts）が
 *   active file path から解決した章 absolutePath を渡す。
 */

import fs from 'node:fs'
import { splitLeadingFrontmatter } from '../src/editor-core/io/frontmatter'
import { extractMarkdownOutline } from '../src/editor-core/io/markdownHeadings'
import type { OutlineExtraction } from '../src/editor-core/io/markdownHeadings'

/** 1 章ファイルから見出し / preview 抽出のために読む最大バイト数（read-only outline MVP）。 */
const MAX_HEADING_SCAN_BYTES = 1024 * 1024

const EMPTY_OUTLINE: OutlineExtraction = { headings: [], intro: '', headingPreviews: [] }

/** 章ファイル本文の Markdown 見出し + preview excerpt を抽出する。読めなければ空 outline。 */
export function readChapterOutline(absolutePath: string): OutlineExtraction {
  let content: string
  let fd: number | null = null
  try {
    fd = fs.openSync(absolutePath, 'r')
    const buffer = Buffer.alloc(MAX_HEADING_SCAN_BYTES)
    const bytesRead = fs.readSync(fd, buffer, 0, MAX_HEADING_SCAN_BYTES, 0)
    content = buffer.subarray(0, bytesRead).toString('utf-8')
  } catch {
    return EMPTY_OUTLINE
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        /* close 失敗は無視 */
      }
    }
  }

  const body = splitLeadingFrontmatter(content).body
  return extractMarkdownOutline(body)
}
