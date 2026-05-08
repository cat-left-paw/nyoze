export type ParagraphPlainLayoutReuseRect = {
  top: number
  left: number
  width: number
  height: number
}

export type ParagraphPlainLayoutReuseSnapshot = {
  activeBlockKey: string
  hostIdentity: unknown
  hostViewportSignature: string
  blockLayoutSignature: string
  writingMode: string
  layoutEpoch: number
  baseRect: ParagraphPlainLayoutReuseRect
  measuredWidth: number | null
  measuredHeight: number | null
  reservedSize: number | null
  blockLayoutLastObservedRect: ParagraphPlainLayoutReuseRect | null
  text: string
}

export function selectReusableParagraphPlainLayoutSnapshot(params: {
  snapshot: ParagraphPlainLayoutReuseSnapshot | null
  activeBlockKey: string | null
  hostIdentity: unknown
  hostViewportSignature: string
  blockLayoutSignature: string
  writingMode: string
  text: string
  layoutEpoch: number
}): ParagraphPlainLayoutReuseSnapshot | null {
  const { snapshot } = params
  if (!snapshot) return null
  if (params.activeBlockKey == null) return null
  if (snapshot.activeBlockKey !== params.activeBlockKey) return null
  if (snapshot.hostIdentity !== params.hostIdentity) return null
  if (snapshot.hostViewportSignature !== params.hostViewportSignature) return null
  if (snapshot.blockLayoutSignature !== params.blockLayoutSignature) return null
  if (snapshot.writingMode !== params.writingMode) return null
  if (snapshot.text !== params.text) return null
  if (snapshot.layoutEpoch !== params.layoutEpoch) return null
  return snapshot
}
