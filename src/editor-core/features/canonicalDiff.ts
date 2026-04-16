export type CanonicalDiffSnapshot = {
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

type CanonicalDiffOperationType = 'insert' | 'delete' | 'replace'

export type CanonicalDiffOperation = {
  type: CanonicalDiffOperationType
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  preview: string
}

type LineDiffStep = {
  type: 'equal' | 'insert' | 'delete' | 'replace'
  oldLine?: string
  newLine?: string
}

const MAX_CANONICAL_DIFF_CELLS = 1_500_000
export const MAX_DIFF_LOG_OPS = 5
export const MAX_DIFF_LOG_LENGTH = 360

export function shortenForLog(input: string, maxLength = 44): string {
  const compact = input.replace(/\t/g, '  ')
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(1, maxLength - 1))}…`
}

function bumpCounter(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function addLinesToCounter(map: Map<string, number>, lines: string[]): void {
  for (const line of lines) {
    if (line.length === 0) continue
    bumpCounter(map, line)
  }
}

function formatDiffPreview(
  type: CanonicalDiffOperationType,
  oldLines: string[],
  newLines: string[],
): string {
  const oldPreview = oldLines.length > 0 ? shortenForLog(oldLines.join('\\n')) : ''
  const newPreview = newLines.length > 0 ? shortenForLog(newLines.join('\\n')) : ''
  if (type === 'insert') return `+ ${newPreview}`
  if (type === 'delete') return `- ${oldPreview}`
  return `~ ${oldPreview} -> ${newPreview}`
}

function diffLinesExact(
  oldLines: string[],
  newLines: string[],
): { exact: boolean; steps: LineDiffStep[] } {
  const n = oldLines.length
  const m = newLines.length
  const cellCount = (n + 1) * (m + 1)
  if (cellCount > MAX_CANONICAL_DIFF_CELLS) {
    return { exact: false, steps: diffLinesGreedy(oldLines, newLines) }
  }

  const width = m + 1
  const dp = new Uint32Array((n + 1) * width)
  const at = (i: number, j: number) => (i * width) + j

  for (let i = 1; i <= n; i++) {
    dp[at(i, 0)] = i
  }
  for (let j = 1; j <= m; j++) {
    dp[at(0, j)] = j
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[at(i, j)] = dp[at(i - 1, j - 1)]
      } else {
        const del = dp[at(i - 1, j)] + 1
        const ins = dp[at(i, j - 1)] + 1
        const rep = dp[at(i - 1, j - 1)] + 1
        dp[at(i, j)] = Math.min(del, ins, rep)
      }
    }
  }

  const steps: LineDiffStep[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      steps.push({ type: 'equal', oldLine: oldLines[i - 1], newLine: newLines[j - 1] })
      i--
      j--
      continue
    }

    const repCost = (i > 0 && j > 0) ? (dp[at(i - 1, j - 1)] + 1) : Number.POSITIVE_INFINITY
    const delCost = (i > 0) ? (dp[at(i - 1, j)] + 1) : Number.POSITIVE_INFINITY
    const insCost = (j > 0) ? (dp[at(i, j - 1)] + 1) : Number.POSITIVE_INFINITY
    const best = Math.min(repCost, delCost, insCost)

    if (repCost === best && i > 0 && j > 0) {
      steps.push({ type: 'replace', oldLine: oldLines[i - 1], newLine: newLines[j - 1] })
      i--
      j--
      continue
    }
    if (delCost === best && i > 0) {
      steps.push({ type: 'delete', oldLine: oldLines[i - 1] })
      i--
      continue
    }
    steps.push({ type: 'insert', newLine: newLines[j - 1] })
    j--
  }

  steps.reverse()
  return { exact: true, steps }
}

function diffLinesGreedy(oldLines: string[], newLines: string[]): LineDiffStep[] {
  const steps: LineDiffStep[] = []
  let i = 0
  let j = 0
  while (i < oldLines.length || j < newLines.length) {
    const a = oldLines[i]
    const b = newLines[j]
    if (i < oldLines.length && j < newLines.length && a === b) {
      steps.push({ type: 'equal', oldLine: a, newLine: b })
      i++
      j++
      continue
    }
    if (i + 1 < oldLines.length && oldLines[i + 1] === b) {
      steps.push({ type: 'delete', oldLine: a })
      i++
      continue
    }
    if (j + 1 < newLines.length && a === newLines[j + 1]) {
      steps.push({ type: 'insert', newLine: b })
      j++
      continue
    }
    if (i < oldLines.length && j < newLines.length) {
      steps.push({ type: 'replace', oldLine: a, newLine: b })
      i++
      j++
      continue
    }
    if (i < oldLines.length) {
      steps.push({ type: 'delete', oldLine: a })
      i++
      continue
    }
    steps.push({ type: 'insert', newLine: b })
    j++
  }
  return steps
}

function normalizeMarkdownForDiff(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function measureCanonicalDiff(source: string, canonical: string): CanonicalDiffSnapshot {
  const originalLines = normalizeMarkdownForDiff(source).split('\n')
  const canonicalLines = normalizeMarkdownForDiff(canonical).split('\n')

  const { exact, steps } = diffLinesExact(originalLines, canonicalLines)
  const operations: CanonicalDiffOperation[] = []
  let insertedLines = 0
  let deletedLines = 0
  let replacedLines = 0

  let oldLineNo = 1
  let newLineNo = 1
  let i = 0
  while (i < steps.length) {
    const step = steps[i]
    if (!step || step.type === 'equal') {
      oldLineNo++
      newLineNo++
      i++
      continue
    }

    const oldStart = oldLineNo
    const newStart = newLineNo
    const oldChunk: string[] = []
    const newChunk: string[] = []

    while (i < steps.length && steps[i]?.type !== 'equal') {
      const current = steps[i]
      if (!current) break
      if (current.type === 'delete' || current.type === 'replace') {
        oldChunk.push(current.oldLine ?? '')
        oldLineNo++
      }
      if (current.type === 'insert' || current.type === 'replace') {
        newChunk.push(current.newLine ?? '')
        newLineNo++
      }
      i++
    }

    const type: CanonicalDiffOperationType =
      oldChunk.length === 0 ? 'insert' : newChunk.length === 0 ? 'delete' : 'replace'

    if (type === 'insert') insertedLines += newChunk.length
    else if (type === 'delete') deletedLines += oldChunk.length
    else replacedLines += Math.max(oldChunk.length, newChunk.length)

    operations.push({
      type,
      oldStart,
      oldCount: oldChunk.length,
      newStart,
      newCount: newChunk.length,
      preview: formatDiffPreview(type, oldChunk, newChunk),
    })
  }

  const originalCounter = new Map<string, number>()
  const canonicalCounter = new Map<string, number>()
  addLinesToCounter(originalCounter, originalLines)
  addLinesToCounter(canonicalCounter, canonicalLines)

  let movedLinesDetected = 0
  const moveHints: string[] = []
  for (const [line, oldCount] of originalCounter.entries()) {
    const newCount = canonicalCounter.get(line) ?? 0
    const shared = Math.min(oldCount, newCount)
    movedLinesDetected += shared
    if (shared > 0 && line.length > 0) {
      moveHints.push(`${shortenForLog(line, 38)} (${shared})`)
    }
  }

  const changedLines = insertedLines + deletedLines + replacedLines
  const totalLines = Math.max(originalLines.length, canonicalLines.length, 1)

  return {
    exact,
    changedLines,
    totalLines,
    lineRate: changedLines / totalLines,
    insertedLines,
    deletedLines,
    replacedLines,
    movedLinesDetected,
    operations,
    moveHints: moveHints.slice(0, 5),
  }
}
