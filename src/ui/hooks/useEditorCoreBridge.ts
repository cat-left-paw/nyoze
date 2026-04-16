import { useEffect, useRef } from 'react'
import { createEditorCore } from '../../editor-core/EditorCore'
import type {
  EditorCoreHandle,
  LineBreakPolicy,
  LogEntry,
  OpenExternalUrl,
} from '../../editor-core/types'

type UseEditorCoreBridgeOptions = {
  coreRef?: { current: EditorCoreHandle | null }
  editorDivRef: { current: HTMLDivElement | null }
  initialLineBreakPolicy: LineBreakPolicy
  onLog: (entry: LogEntry) => void
  onSelectionUpdate: (snapshot: string) => void
  onParagraphPlainModeChange: (active: boolean) => void
  onLineBreakPolicyChange: (policy: LineBreakPolicy) => void
  onUpdate: () => void
  onFoldChange: () => void
  openExternalUrl?: OpenExternalUrl
  onReady?: (core: EditorCoreHandle) => void
}

type BridgeCallbacks = {
  onLog: (entry: LogEntry) => void
  onSelectionUpdate: (snapshot: string) => void
  onParagraphPlainModeChange: (active: boolean) => void
  onLineBreakPolicyChange: (policy: LineBreakPolicy) => void
  onUpdate: () => void
  onFoldChange: () => void
  openExternalUrl?: OpenExternalUrl
  onReady?: (core: EditorCoreHandle) => void
}

type ConnectEditorCoreBridgeOptions = {
  coreRef: { current: EditorCoreHandle | null }
  element: HTMLElement
  lineBreakPolicy: LineBreakPolicy
  callbacks: BridgeCallbacks
  createCore?: (options: {
    element: HTMLElement
    lineBreakPolicy?: LineBreakPolicy
    openExternalUrl?: OpenExternalUrl
  }) => EditorCoreHandle
}

export function connectEditorCoreBridge(options: ConnectEditorCoreBridgeOptions): () => void {
  const {
    coreRef,
    element,
    lineBreakPolicy,
    callbacks,
    createCore = createEditorCore,
  } = options
  const {
    onLog,
    onSelectionUpdate,
    onParagraphPlainModeChange,
    onLineBreakPolicyChange,
    onUpdate,
    onFoldChange,
    openExternalUrl,
    onReady,
  } = callbacks

  const core = createCore({
    element,
    lineBreakPolicy,
    openExternalUrl,
  })
  coreRef.current = core
  onParagraphPlainModeChange(core.isParagraphPlainModeActive())
  onLineBreakPolicyChange(core.getLineBreakPolicy())
  onReady?.(core)

  const unsubLog = core.onLog((entry) => {
    onLog(entry)
  })

  const unsubSel = core.onSelectionUpdate((snapshot) => {
    onSelectionUpdate(snapshot)
    onParagraphPlainModeChange(core.isParagraphPlainModeActive())
  })

  const unsubParagraphPlain = core.onParagraphPlainModeChange((active) => {
    onParagraphPlainModeChange(active)
  })

  const unsubLineBreakPolicy = core.onLineBreakPolicyChange((policy) => {
    onLineBreakPolicyChange(policy)
  })

  const unsubUpdate = core.onUpdate(() => {
    onUpdate()
  })

  const unsubFoldChange = core.onFoldChange(() => {
    onFoldChange()
  })

  return () => {
    unsubLog()
    unsubSel()
    unsubParagraphPlain()
    unsubLineBreakPolicy()
    unsubUpdate()
    unsubFoldChange()
    core.destroy()
    coreRef.current = null
  }
}

export function useEditorCoreBridge({
  coreRef: sharedCoreRef,
  editorDivRef,
  initialLineBreakPolicy,
  onLog,
  onSelectionUpdate,
  onParagraphPlainModeChange,
  onLineBreakPolicyChange,
  onUpdate,
  onFoldChange,
  openExternalUrl,
  onReady,
}: UseEditorCoreBridgeOptions) {
  const internalCoreRef = useRef<EditorCoreHandle | null>(null)
  const coreRef = sharedCoreRef ?? internalCoreRef

  // Store callbacks in refs so that identity changes never trigger editor recreation.
  // The editor is expensive to destroy/recreate; only structural changes (element, policy)
  // should cause re-initialization.
  const callbacksRef = useRef<BridgeCallbacks>({
    onLog,
    onSelectionUpdate,
    onParagraphPlainModeChange,
    onLineBreakPolicyChange,
    onUpdate,
    onFoldChange,
    openExternalUrl,
    onReady,
  })
  callbacksRef.current = {
    onLog,
    onSelectionUpdate,
    onParagraphPlainModeChange,
    onLineBreakPolicyChange,
    onUpdate,
    onFoldChange,
    openExternalUrl,
    onReady,
  }

  useEffect(() => {
    const el = editorDivRef.current
    if (!el) return

    return connectEditorCoreBridge({
      coreRef,
      element: el,
      lineBreakPolicy: initialLineBreakPolicy,
      callbacks: {
        onLog: (entry) => callbacksRef.current.onLog(entry),
        onSelectionUpdate: (snapshot) => callbacksRef.current.onSelectionUpdate(snapshot),
        onParagraphPlainModeChange: (active) => callbacksRef.current.onParagraphPlainModeChange(active),
        onLineBreakPolicyChange: (policy) => callbacksRef.current.onLineBreakPolicyChange(policy),
        onUpdate: () => callbacksRef.current.onUpdate(),
        onFoldChange: () => callbacksRef.current.onFoldChange(),
        openExternalUrl: (url) => callbacksRef.current.openExternalUrl?.(url) ?? Promise.resolve(false),
        onReady: (core) => callbacksRef.current.onReady?.(core),
      },
    })
  }, [coreRef, editorDivRef, initialLineBreakPolicy])

  return coreRef
}
