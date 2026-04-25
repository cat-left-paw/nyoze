import type Token from 'markdown-it/lib/token.mjs'

type SyntheticToken = {
  type: string
  tag: string
  nesting: -1 | 1
}

type OrphanDelimiterSpec = {
  delimiter: string
  openTokens: SyntheticToken[]
  closeTokens: SyntheticToken[]
}

type RescueMatch = {
  closeIndex: number
  leadingText: string
  spec: OrphanDelimiterSpec
  trailingText: string
}

const EMPHASIS_OPEN_TYPES = new Set(['strong_open', 'em_open', 's_open'])

const ORPHAN_DELIMITER_SPECS: OrphanDelimiterSpec[] = [
  {
    delimiter: '***',
    openTokens: [
      { type: 'strong_open', tag: 'strong', nesting: 1 },
      { type: 'em_open', tag: 'em', nesting: 1 },
    ],
    closeTokens: [
      { type: 'em_close', tag: 'em', nesting: -1 },
      { type: 'strong_close', tag: 'strong', nesting: -1 },
    ],
  },
  {
    delimiter: '**',
    openTokens: [{ type: 'strong_open', tag: 'strong', nesting: 1 }],
    closeTokens: [{ type: 'strong_close', tag: 'strong', nesting: -1 }],
  },
  {
    delimiter: '~~',
    openTokens: [{ type: 's_open', tag: 's', nesting: 1 }],
    closeTokens: [{ type: 's_close', tag: 's', nesting: -1 }],
  },
  {
    delimiter: '*',
    openTokens: [{ type: 'em_open', tag: 'em', nesting: 1 }],
    closeTokens: [{ type: 'em_close', tag: 'em', nesting: -1 }],
  },
]

/**
 * Rescue compound emphasis patterns that markdown-it partially parsed.
 *
 * Two shapes are handled:
 *
 *   (1) DIFFERENT-DELIMITER ORPHAN (pre-existing behaviour)
 *       text("これは***") s_open text("X") s_close text("***です。")
 *       -> synthesize outer open/close around the already-parsed inner s_*
 *
 *   (2) SAME-DELIMITER ADJACENT PAIRS (new)
 *       Two Japanese-text shapes produced by markdown-it for `**A**や**B**`:
 *
 *       (a) NESTED shape:
 *           strong_open text(A) strong_open text(B) strong_close text(C) strong_close
 *           markdown-it matched all four `**` runs but treated them as a
 *           single nested bold instead of two adjacent pairs.
 *
 *       (b) TWO-SIDED ORPHAN shape:
 *           text("... **A") strong_open text(B) strong_close text("C** ...")
 *           markdown-it recognised only the middle pair and left the outer
 *           two delimiter runs as literal text on each side.
 *
 *       For both (a) and (b), we collapse the pattern back to a single text
 *       token that still contains the literal `**A**B**C**` markup and let
 *       the fallback emphasis regex in addTextWithAozora re-interpret it as
 *       two adjacent same-delimiter pairs. This reuses the fallback regex's
 *       literal-text safety guards (no-leading/trailing-space, no-delimiter
 *       char inside, etc.) and avoids duplicating that logic here.
 */
export function rescueOrphanDelimiters(tokens: Token[]): Token[] {
  let current = collapseSameDelimiterAdjacentPairs(tokens)
  let changed = true

  while (changed) {
    changed = false
    const next: Token[] = []

    for (let index = 0; index < current.length;) {
      const match = findRescueMatch(current, index)
      if (!match) {
        next.push(current[index])
        index++
        continue
      }

      changed = true
      const openText = current[index]
      const closeText = current[match.closeIndex + 1]

      if (match.leadingText.length > 0) {
        next.push(cloneTextToken(openText, match.leadingText))
      }

      for (const tokenSpec of match.spec.openTokens) {
        next.push(createSyntheticToken(openText, tokenSpec, match.spec.delimiter))
      }

      for (let innerIndex = index + 1; innerIndex <= match.closeIndex; innerIndex++) {
        next.push(current[innerIndex])
      }

      for (const tokenSpec of match.spec.closeTokens) {
        next.push(createSyntheticToken(closeText, tokenSpec, match.spec.delimiter))
      }

      if (match.trailingText.length > 0) {
        next.push(cloneTextToken(closeText, match.trailingText))
      }

      index = match.closeIndex + 2
    }

    if (changed) {
      current = collapseSameDelimiterAdjacentPairs(next)
    }
  }

  return current
}

/**
 * Collapse same-delimiter adjacent-pair shapes back into a single text token
 * so the fallback emphasis regex in parseMarkdown can re-interpret them.
 *
 * Target shapes (delimiter D in {**, *, ~~}; inner/outer token type matches):
 *
 *   NESTED:
 *     X_open text(A) X_open text(B) X_close text(C) X_close
 *     -> text("DADBDCD")
 *
 *   TWO-SIDED ORPHAN:
 *     text("...DA") X_open text(B) X_close text("CD...")
 *     -> text("...DADBDCD...")
 *
 * Constraints (applied to each of A, B, C):
 *   - Non-empty
 *   - Does not contain the delimiter character (avoids re-introducing an
 *     ambiguous rescue candidate after collapse)
 *   - Does not contain a newline
 *   - A and C additionally must not start or end with a space, mirroring the
 *     fallback emphasis regex's literal-text guard so the collapsed text is
 *     guaranteed to match as two adjacent pairs rather than literal `**`.
 */
function collapseSameDelimiterAdjacentPairs(tokens: Token[]): Token[] {
  const specs = ORPHAN_DELIMITER_SPECS.filter((spec) => spec.openTokens.length === 1)
  if (specs.length === 0) return tokens

  let current = tokens
  let changed = true
  while (changed) {
    changed = false
    const next: Token[] = []
    let index = 0

    while (index < current.length) {
      const nestedMatch = matchNestedSameDelimiter(current, index, specs)
      if (nestedMatch) {
        next.push(cloneTextToken(current[index], nestedMatch.collapsedText))
        index = nestedMatch.endIndexExclusive
        changed = true
        continue
      }

      const orphanMatch = matchTwoSidedOrphan(current, index, specs)
      if (orphanMatch) {
        next.push(cloneTextToken(current[index], orphanMatch.collapsedText))
        index = orphanMatch.endIndexExclusive
        changed = true
        continue
      }

      next.push(current[index])
      index++
    }

    current = next
  }

  return current
}

type CollapseMatch = {
  collapsedText: string
  endIndexExclusive: number
}

function matchNestedSameDelimiter(
  tokens: Token[],
  index: number,
  specs: OrphanDelimiterSpec[],
): CollapseMatch | null {
  const outerOpen = tokens[index]
  if (!outerOpen || !EMPHASIS_OPEN_TYPES.has(outerOpen.type)) return null

  const spec = specs.find((candidate) =>
    candidate.openTokens.some((tokenSpec) => tokenSpec.type === outerOpen.type),
  )
  if (!spec) return null

  const textA = tokens[index + 1]
  const innerOpen = tokens[index + 2]
  const textB = tokens[index + 3]
  const innerClose = tokens[index + 4]
  const textC = tokens[index + 5]
  const outerClose = tokens[index + 6]

  if (!textA || textA.type !== 'text') return null
  if (!innerOpen || innerOpen.type !== outerOpen.type) return null
  if (!textB || textB.type !== 'text') return null
  if (!innerClose || innerClose.type !== outerOpen.type.replace(/_open$/, '_close')) return null
  if (!textC || textC.type !== 'text') return null
  if (!outerClose || outerClose.type !== outerOpen.type.replace(/_open$/, '_close')) return null

  if (!isSafeSideBody(textA.content, spec.delimiter)) return null
  if (!isSafeMiddleBody(textB.content, spec.delimiter)) return null
  if (!isSafeSideBody(textC.content, spec.delimiter)) return null

  const collapsedText =
    spec.delimiter + textA.content + spec.delimiter +
    textB.content +
    spec.delimiter + textC.content + spec.delimiter

  return { collapsedText, endIndexExclusive: index + 7 }
}

function matchTwoSidedOrphan(
  tokens: Token[],
  index: number,
  specs: OrphanDelimiterSpec[],
): CollapseMatch | null {
  const leadingText = tokens[index]
  if (!leadingText || leadingText.type !== 'text' || leadingText.content.length === 0) {
    return null
  }

  const innerOpen = tokens[index + 1]
  const textB = tokens[index + 2]
  const innerClose = tokens[index + 3]
  const trailingText = tokens[index + 4]

  if (!innerOpen || !EMPHASIS_OPEN_TYPES.has(innerOpen.type)) return null

  const spec = specs.find((candidate) =>
    candidate.openTokens.some((tokenSpec) => tokenSpec.type === innerOpen.type),
  )
  if (!spec) return null

  if (!textB || textB.type !== 'text') return null
  if (!innerClose || innerClose.type !== innerOpen.type.replace(/_open$/, '_close')) return null
  if (!trailingText || trailingText.type !== 'text') return null

  // The orphan `**` (or `*` / `~~`) may be anywhere inside the leading text,
  // not just at its very end. We look for the single occurrence and split
  // there; the part after the delimiter becomes the rescue body, the part
  // before stays plain. The same logic runs in reverse for trailingText.
  const leftSplit = findTrailingOrphanDelimiter(leadingText.content, spec.delimiter)
  if (!leftSplit) return null
  const rightSplit = findLeadingOrphanDelimiter(trailingText.content, spec.delimiter)
  if (!rightSplit) return null

  if (!isSafeSideBody(leftSplit.body, spec.delimiter)) return null
  if (!isSafeMiddleBody(textB.content, spec.delimiter)) return null
  if (!isSafeSideBody(rightSplit.body, spec.delimiter)) return null

  // Reassemble the literal run so the fallback regex sees it as a single
  // text token containing `**A**B**C**`. Any prefix / suffix that was not
  // part of the adjacent-pair shape stays attached as plain text.
  const collapsedText =
    leftSplit.prefix +
    spec.delimiter + leftSplit.body + spec.delimiter +
    textB.content +
    spec.delimiter + rightSplit.body + spec.delimiter +
    rightSplit.suffix

  return { collapsedText, endIndexExclusive: index + 5 }
}

/**
 * Locate an orphan delimiter run in a leading text token and split into
 * { prefix, body }. Returns null if the delimiter does not occur exactly
 * once or if the body would be empty.
 */
function findTrailingOrphanDelimiter(
  text: string,
  delimiter: string,
): { prefix: string; body: string } | null {
  if (text.length === 0) return null
  const firstIndex = text.indexOf(delimiter)
  if (firstIndex < 0) return null
  const lastIndex = text.lastIndexOf(delimiter)
  if (firstIndex !== lastIndex) return null

  const prefix = text.slice(0, lastIndex)
  const body = text.slice(lastIndex + delimiter.length)
  if (body.length === 0) return null
  return { prefix, body }
}

function findLeadingOrphanDelimiter(
  text: string,
  delimiter: string,
): { body: string; suffix: string } | null {
  if (text.length === 0) return null
  const firstIndex = text.indexOf(delimiter)
  if (firstIndex < 0) return null
  const lastIndex = text.lastIndexOf(delimiter)
  if (firstIndex !== lastIndex) return null

  const body = text.slice(0, firstIndex)
  const suffix = text.slice(firstIndex + delimiter.length)
  if (body.length === 0) return null
  return { body, suffix }
}

function isSafeSideBody(text: string, delimiter: string): boolean {
  if (text.length === 0) return false
  if (text.includes('\n')) return false
  if (text.includes(delimiter[0])) return false
  if (text.startsWith(' ') || text.endsWith(' ')) return false
  return true
}

function isSafeMiddleBody(text: string, delimiter: string): boolean {
  if (text.length === 0) return false
  if (text.includes('\n')) return false
  if (text.includes(delimiter[0])) return false
  return true
}

function findRescueMatch(tokens: Token[], index: number): RescueMatch | null {
  const openText = tokens[index]
  if (openText?.type !== 'text' || openText.content.length === 0) return null

  const spec = findTrailingDelimiterSpec(openText.content)
  if (!spec) return null

  const innerOpen = tokens[index + 1]
  if (!innerOpen || !EMPHASIS_OPEN_TYPES.has(innerOpen.type)) return null

  // Only rescue when markdown-it clearly parsed a different inner mark and left
  // the outer delimiter as text.
  if (spec.openTokens.some((tokenSpec) => tokenSpec.type === innerOpen.type)) {
    return null
  }

  const closeIndex = findMatchingCloseIndex(tokens, index + 1)
  if (closeIndex < 0 || closeIndex + 1 >= tokens.length) return null

  const closeText = tokens[closeIndex + 1]
  if (closeText.type !== 'text' || !closeText.content.startsWith(spec.delimiter)) {
    return null
  }

  return {
    closeIndex,
    leadingText: openText.content.slice(0, -spec.delimiter.length),
    spec,
    trailingText: closeText.content.slice(spec.delimiter.length),
  }
}

function findTrailingDelimiterSpec(content: string): OrphanDelimiterSpec | null {
  for (const spec of ORPHAN_DELIMITER_SPECS) {
    if (content.endsWith(spec.delimiter)) {
      return spec
    }
  }
  return null
}

function findMatchingCloseIndex(tokens: Token[], openIndex: number): number {
  const openType = tokens[openIndex]?.type
  if (!openType || !openType.endsWith('_open')) return -1

  const closeType = openType.replace(/_open$/, '_close')
  let depth = 1
  for (let index = openIndex + 1; index < tokens.length; index++) {
    if (tokens[index].type === openType) {
      depth++
    } else if (tokens[index].type === closeType) {
      depth--
      if (depth === 0) {
        return index
      }
    }
  }
  return -1
}

function cloneTextToken(base: Token, content: string): Token {
  const token = createTokenLike(base, 'text', '', 0)
  token.content = content
  return token
}

function createSyntheticToken(base: Token, spec: SyntheticToken, markup: string): Token {
  const token = createTokenLike(base, spec.type, spec.tag, spec.nesting)
  token.markup = markup
  return token
}

function createTokenLike(base: Token, type: string, tag: string, nesting: number): Token {
  const TokenCtor = base.constructor as new (type: string, tag: string, nesting: number) => Token
  const token = new TokenCtor(type, tag, nesting)
  token.level = base.level
  token.block = false
  return token
}
