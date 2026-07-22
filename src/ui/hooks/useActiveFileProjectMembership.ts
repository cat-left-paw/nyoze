import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectResolveResult } from '../../project/projectIpcTypes'

/**
 * 現在の active file が Project（祖先に valid な `.nyoze/project.json`）へ所属するかを
 * 解決する hook。frontmatter display の文脈対応（Project 内では既定で本文中に出さない）
 * のために使う。
 *
 * 境界:
 * - projectRoot を renderer から渡さない。main 側 `project:resolveForFile` に active file
 *   path だけを渡し、返った `project` の有無だけを見る（noteEditController 等と同方針）。
 * - 現在ファイルの IPC 結果は request key とセットで保持する。key 不一致は render 時点で
 *   `pending: true` とし、単独 frontmatter を同期的に出さない。
 * - internal doc / path なし / bridge なしは即 `{ inProject: false, pending: false }`。
 */
type ProjectBridge = {
  resolveForFile: (filePath: string) => Promise<ProjectResolveResult>
}

function getProjectBridge(): ProjectBridge | null {
  return window.nyozeBridge?.project ?? null
}

type UseActiveFileProjectMembershipOptions = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
}

export type ActiveFileProjectMembership = {
  inProject: boolean
  pending: boolean
}

type ProjectMembershipSlot = {
  requestKey: string
  inProject: boolean
}

/** active file と membership 結果を対応づける key（render 時の stale / pending 判定用）。 */
export function buildActiveFileProjectMembershipRequestKey(input: {
  activeFilePath: string | null
  internalDoc: boolean
}): string {
  if (input.internalDoc || !input.activeFilePath) return 'inactive'
  return input.activeFilePath
}

export function resolveEffectiveProjectMembership(
  slot: ProjectMembershipSlot | null,
  requestKey: string,
): ActiveFileProjectMembership {
  if (requestKey === 'inactive') {
    return { inProject: false, pending: false }
  }
  if (!slot || slot.requestKey !== requestKey) {
    return { inProject: false, pending: true }
  }
  return { inProject: slot.inProject, pending: false }
}

export function useActiveFileProjectMembership({
  getActiveFilePath,
  isInternalDoc,
}: UseActiveFileProjectMembershipOptions): ActiveFileProjectMembership {
  const getActiveFilePathRef = useRef(getActiveFilePath)
  const isInternalDocRef = useRef(isInternalDoc)
  const generationRef = useRef(0)
  getActiveFilePathRef.current = getActiveFilePath
  isInternalDocRef.current = isInternalDoc

  const [membershipSlot, setMembershipSlot] = useState<ProjectMembershipSlot | null>(
    null,
  )

  const activeFilePath = getActiveFilePath()
  const internalDoc = isInternalDoc()
  const membershipRequestKey = buildActiveFileProjectMembershipRequestKey({
    activeFilePath,
    internalDoc,
  })

  const membership = useMemo(
    () => resolveEffectiveProjectMembership(membershipSlot, membershipRequestKey),
    [membershipSlot, membershipRequestKey],
  )

  const refresh = useCallback(async () => {
    const generation = ++generationRef.current

    if (isInternalDocRef.current()) {
      return
    }
    const activeFilePath = getActiveFilePathRef.current()
    if (!activeFilePath) {
      return
    }
    const requestKey = buildActiveFileProjectMembershipRequestKey({
      activeFilePath,
      internalDoc: false,
    })
    const bridge = getProjectBridge()
    if (!bridge) {
      if (
        generation !== generationRef.current ||
        getActiveFilePathRef.current() !== activeFilePath ||
        isInternalDocRef.current()
      ) {
        return
      }
      setMembershipSlot({ requestKey, inProject: false })
      return
    }

    const resolved = await bridge.resolveForFile(activeFilePath).catch(() => null)
    if (
      generation !== generationRef.current ||
      getActiveFilePathRef.current() !== activeFilePath ||
      isInternalDocRef.current()
    ) {
      return
    }
    setMembershipSlot({
      requestKey,
      inProject: Boolean(resolved?.ok && resolved.project !== null),
    })
  }, [])

  useEffect(() => {
    void refresh()
  }, [activeFilePath, internalDoc, refresh])

  return membership
}
