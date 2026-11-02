/** 読み取り専用のE2E観測。製品の制御・通知経路には使わない。 */
export type TypewriterSuppressionSnapshot = {
  canFollow: boolean
  manualScrollSuppressed: boolean
  jumpNavigationSuppressed: boolean
  programmaticScrollEventsToIgnore: number
}
declare global {
  interface Window {
    __NYOZE_TYPEWRITER_DIAGNOSTICS__?: (root: HTMLElement) => TypewriterSuppressionSnapshot | null
  }
}
const readers = new WeakMap<HTMLElement, () => TypewriterSuppressionSnapshot>()
export function registerTypewriterDiagnostics(root: HTMLElement, read: () => TypewriterSuppressionSnapshot): () => void {
  const win = root.ownerDocument?.defaultView
  if (!win?.nyozeBridge?.e2e) return () => {}
  readers.set(root, read)
  win.__NYOZE_TYPEWRITER_DIAGNOSTICS__ = root => readers.get(root)?.() ?? null
  return () => { readers.delete(root) }
}
