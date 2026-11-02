import { isPathInDocumentBoundary, validatePathArg } from './ipcSecurity'

/** Renderer tab limit. Kept independent of React; checked against MAX_OPEN_TABS in tests. */
export const MAX_OPEN_DOCUMENT_PATHS = 12
export type OpenDocumentPinsByWindow = ReadonlyMap<number, ReadonlySet<string>>
export type OpenDocumentPinBoundary = {
  workspaceRoot: string | null
  allowedDocumentPaths: ReadonlySet<string>
}

/** SEC-2: reject the entire malformed report before doing any filesystem work. */
export function validateOpenDocumentPaths(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_OPEN_DOCUMENT_PATHS) return null
  const paths: string[] = []
  for (const input of raw) {
    const valid = validatePathArg(input)
    if (valid === null) return null
    paths.push(valid)
  }
  return paths
}

/** Pure decision with injected filesystem. Resolver returns existing regular-file realpaths only. */
export function rebuildOpenDocumentPins(
  raw: unknown,
  boundary: OpenDocumentPinBoundary,
  previous: ReadonlySet<string>,
  resolveExistingFile: (input: string) => string | null,
): Set<string> | null {
  const paths = validateOpenDocumentPaths(raw)
  if (paths === null) return null
  const next = new Set<string>()
  for (const input of paths) {
    const real = resolveExistingFile(input)
    if (real !== null && isPathInDocumentBoundary(
      real, boundary.workspaceRoot, boundary.allowedDocumentPaths, previous,
    )) next.add(real)
  }
  return next
}

/** A window may retain only its own previous pins. Other windows cannot grant new pins. */
export function reportOpenDocumentPins(
  windows: OpenDocumentPinsByWindow,
  owner: number,
  raw: unknown,
  boundary: OpenDocumentPinBoundary,
  resolveExistingFile: (input: string) => string | null,
): OpenDocumentPinsByWindow {
  const next = rebuildOpenDocumentPins(raw, boundary, windows.get(owner) ?? new Set(), resolveExistingFile)
  if (next === null) return windows
  const result = new Map(windows)
  result.set(owner, next)
  return result
}

export function collectOpenDocumentPins(windows: OpenDocumentPinsByWindow): Set<string> {
  return new Set([...windows.values()].flatMap(pins => [...pins]))
}
