import { useEffect } from 'react'

/** Preview text belongs to its heading snapshot, and expires on a Doc edit. */
export function useOutlinePreviewInvalidation(
  open: boolean,
  snapshot: unknown,
  watch: (close: () => void) => () => void,
  close: () => void,
) {
  useEffect(() => { close() }, [snapshot, close])
  useEffect(() => {
    if (!open) return
    return watch(close)
  }, [open, watch, close])
}
