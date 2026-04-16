type ParsedVersionIdentifier = number | string

type ParsedVersion = {
  release: number[]
  prerelease: ParsedVersionIdentifier[] | null
}

const VERSION_PATTERN = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/

function parseVersionIdentifier(raw: string): ParsedVersionIdentifier | null {
  if (!raw) return null
  if (/^\d+$/.test(raw)) {
    return Number(raw)
  }
  if (/^[0-9A-Za-z-]+$/.test(raw)) {
    return raw.toLowerCase()
  }
  return null
}

function parseVersion(value: string): ParsedVersion | null {
  const normalized = value.trim()
  const match = normalized.match(VERSION_PATTERN)
  if (!match) return null

  const release = match[1]
    .split('.')
    .map((part) => Number(part))

  if (release.some((part) => !Number.isInteger(part) || part < 0)) {
    return null
  }

  const prereleaseRaw = match[2]
  if (!prereleaseRaw) {
    return { release, prerelease: null }
  }

  const prerelease = prereleaseRaw.split('.').map(parseVersionIdentifier)
  if (prerelease.some((part) => part === null)) {
    return null
  }

  return { release, prerelease: prerelease as ParsedVersionIdentifier[] }
}

function compareNumberLists(left: number[], right: number[]): number {
  const maxLength = Math.max(left.length, right.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left[index] ?? 0
    const rightPart = right[index] ?? 0
    if (leftPart > rightPart) return 1
    if (leftPart < rightPart) return -1
  }
  return 0
}

function comparePrereleaseIdentifiers(
  left: ParsedVersionIdentifier[],
  right: ParsedVersionIdentifier[],
): number {
  const maxLength = Math.max(left.length, right.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left[index]
    const rightPart = right[index]

    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1

    if (typeof leftPart === "number" && typeof rightPart === "number") {
      if (leftPart > rightPart) return 1
      if (leftPart < rightPart) return -1
      continue
    }

    if (typeof leftPart === "number") return -1
    if (typeof rightPart === "number") return 1

    const order = leftPart.localeCompare(rightPart)
    if (order !== 0) return order > 0 ? 1 : -1
  }
  return 0
}

export function compareUpdateVersions(left: string, right: string): number | null {
  const parsedLeft = parseVersion(left)
  const parsedRight = parseVersion(right)
  if (!parsedLeft || !parsedRight) return null

  const releaseOrder = compareNumberLists(parsedLeft.release, parsedRight.release)
  if (releaseOrder !== 0) return releaseOrder

  if (parsedLeft.prerelease === null && parsedRight.prerelease === null) return 0
  if (parsedLeft.prerelease === null) return 1
  if (parsedRight.prerelease === null) return -1

  return comparePrereleaseIdentifiers(parsedLeft.prerelease, parsedRight.prerelease)
}

export function hasAvailableUpdate(
  currentVersion: string,
  latestVersion: string,
): boolean {
  const order = compareUpdateVersions(latestVersion, currentVersion)
  return order !== null && order > 0
}
