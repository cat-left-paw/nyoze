/** Book 全体 Outline の v3 表示 model と pure assembly helper。 */

import {
  normalizeHeadingText,
  type OutlineExtraction,
  type OutlineHeading,
} from '../editor-core/io/markdownHeadings'

export type { OutlineHeading }

export type BookDisplayMeta = {
  book: string
  bookId: string
  displayName: string
  title: string
  source: 'manifest' | 'synthetic'
}

export type BookFullOutlineComputation =
  | { kind: 'no-current-book' }
  | {
      kind: 'ready'
      currentBook: string
      book: BookDisplayMeta
      chapters: BookOutlineChapter[]
    }

export type BookOutlineHeading = {
  level: number
  text: string
  headingIndex: number
  occurrenceIndex: number
  preview: string
}

export type BookOutlineChapter = {
  relativePath: string
  absolutePath: string
  title: string
  isCurrent: boolean
  headings: BookOutlineHeading[]
  preview: string
  missing?: boolean
}

export function buildBookOutlineChapter(
  chapter: {
    relativePath: string
    absolutePath: string
    title: string
    isCurrent: boolean
    missing?: boolean
  },
  extraction: OutlineExtraction,
): BookOutlineChapter {
  return {
    relativePath: chapter.relativePath,
    absolutePath: chapter.absolutePath,
    title: chapter.title,
    isCurrent: chapter.isCurrent,
    headings: withHeadingTargets(extraction.headings, extraction.headingPreviews),
    preview: extraction.intro,
    ...(chapter.missing ? { missing: true } : {}),
  }
}

function withHeadingTargets(
  raw: readonly OutlineHeading[],
  headingPreviews: readonly string[],
): BookOutlineHeading[] {
  const seen = new Map<string, number>()
  return raw.map((heading, headingIndex) => {
    const key = `${heading.level}\u0000${normalizeHeadingText(heading.text)}`
    const occurrenceIndex = seen.get(key) ?? 0
    seen.set(key, occurrenceIndex + 1)
    return {
      level: heading.level,
      text: heading.text,
      headingIndex,
      occurrenceIndex,
      preview: headingPreviews[headingIndex] ?? '',
    }
  })
}
