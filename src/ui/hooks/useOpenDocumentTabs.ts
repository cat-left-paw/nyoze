import { useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { EditorTab } from './useAppUiState'
import { createOpenDocumentTabState } from './openDocumentTabState'

/** Shared tab state boundary: every path change is acknowledged by main before the setter returns. */
export function useOpenDocumentTabs(initial: EditorTab[]): [EditorTab[], Dispatch<SetStateAction<EditorTab[]>>, () => EditorTab[]] {
  const [tabs, publish] = useState(initial)
  const state = useRef<ReturnType<typeof createOpenDocumentTabState<EditorTab>> | null>(null)
  if (state.current === null) {
    state.current = createOpenDocumentTabState(initial, paths => {
      window.nyozeBridge?.document?.setOpenDocumentPaths(paths)
    }, publish)
  }
  useLayoutEffect(() => { state.current!.reportCurrent() }, [])
  // Window close drops pins in main. No StrictMode effect cleanup may revoke live tabs.
  return [tabs, state.current.set, state.current.read]
}
