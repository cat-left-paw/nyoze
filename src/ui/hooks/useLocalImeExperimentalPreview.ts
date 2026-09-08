/**
 * LOCAL-WINDOW-PUBLIC-ENTRY1 — product toggle wiring for the existing Local
 * Window controller, AUTOARM scheduler, document-action barrier and recovery
 * runtime. No E2E bridge or renderer platform detection participates.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clearLocalImeLocalWindowExplicitEnableActivation,
  configureLocalImePilot,
  consumeLocalImeLocalWindowExplicitEnableActivation,
  copyLocalImeLocalWindowRecoveryMarkdown,
  discardLocalImeLocalWindowRecoveryDraft,
  getLocalImePilotHudState,
  requestLocalImeLocalWindowExplicitEnableActivation,
  restartLocalImeLocalWindowRuntime,
  retryLocalImeLocalWindowRecoveryToOff,
  subscribeLocalImePilot,
  type LocalImePilotHudSnapshot,
} from '../../editor-core/features/localImePilotRuntime'
import { requestLocalImeDocumentAction } from '../../editor-core/features/localImeDocumentActionBarrier'
import { getLocalImeLocalWindowRecoveryPort } from '../../editor-core/features/localImeLocalWindowRecoveryRuntime'
import type { LocalImeLocalWindowProductRuntimeState } from '../../editor-core/features/localImeLocalWindowRuntimeState'
import {
  resolveLocalImeExperimentalPreviewDecision,
  resolveLocalImeExperimentalPreviewDisableOutcome,
  type LocalImeExperimentalPreviewControls,
  type LocalImeExperimentalPreviewProductStatus,
} from '../../editor-core/features/localImeExperimentalPreviewState'

export const LOCAL_IME_EXPERIMENTAL_PREVIEW_DISABLE_REASON =
  'experimental-local-ime-preview-disable'

export type LocalImeExperimentalPreviewNoticeKind =
  | 'attention'
  | 'awaiting-composition'
  | 'busy'

type TransientNotice = Exclude<LocalImeExperimentalPreviewNoticeKind, 'attention'>

export type LocalImeExperimentalPreviewView = {
  settingVisible: boolean
  settingInteractive: boolean
  preferenceEnabled: boolean
  effectiveEnabled: boolean
  runtimeState: LocalImeLocalWindowProductRuntimeState
  /** recovery-suspended is deliberately false even while the runtime retains draft. */
  toggleOn: boolean
  productStatus: LocalImeExperimentalPreviewProductStatus
  controls: LocalImeExperimentalPreviewControls
  forceResetPending: boolean
  recoveryDraftCopyAvailable: boolean
  notice: LocalImeExperimentalPreviewNoticeKind | null
  onChangeEnabled: (next: boolean) => void
  onStopSession: () => void
  onRetryRecovery: () => void
  onCopyRecoveryDraft: () => void
  onRequestForceReset: () => void
  onConfirmForceReset: () => void
  onCancelForceReset: () => void
  onDismissNotice: () => void
}

function readCapabilityGranted(): boolean {
  if (typeof window === 'undefined') return false
  return window.nyozeBridge?.localImeExperimentalPreview?.capable === true
}

function readAuthorPilotAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return window.nyozeBridge?.localImePilot?.available === true
}

function toProductStatus(
  runtimeState: LocalImeLocalWindowProductRuntimeState,
): LocalImeExperimentalPreviewProductStatus {
  if (runtimeState === 'enabled-active') return 'active'
  if (runtimeState === 'recovery-suspended') return 'attention'
  return 'inactive'
}

export function useLocalImeExperimentalPreview(options: {
  preferenceEnabled: boolean
  setPreferenceEnabled: (next: boolean) => void
}): LocalImeExperimentalPreviewView {
  const { preferenceEnabled, setPreferenceEnabled } = options
  const [capabilityGranted] = useState(readCapabilityGranted)
  const [authorPilotAvailable] = useState(readAuthorPilotAvailable)
  const [hud, setHud] = useState<LocalImePilotHudSnapshot | null>(null)
  const [transientNotice, setTransientNotice] = useState<TransientNotice | null>(null)
  const [discardConfirmPending, setDiscardConfirmPending] = useState(false)
  const pendingDisableRef = useRef(false)
  const restartOnNextEnableRef = useRef(false)

  const decision = useMemo(
    () => resolveLocalImeExperimentalPreviewDecision({
      capabilityGranted,
      authorPilotAvailable,
      preferenceEnabled,
    }),
    [authorPilotAvailable, capabilityGranted, preferenceEnabled],
  )
  const effectiveEnabled = decision.effectiveEnabled

  useEffect(() => {
    if (!effectiveEnabled) {
      // LOCAL-WINDOW-EXPLICIT-ENABLE-ARM1: 無効状態へ**収束**したら pending な明示 ON
      // intent も破棄する。明示 OFF handler を経由しない収束（設定読込 / capability 変更
      // など、hook が mount 中の effective state 変更）で intent が残ると、その後の保存済み ON =
      // configuration-sync の late attach が古い intent を `explicit-user-toggle` として
      // 消費し、initial-load Start 0 契約を破ってしまう。
      clearLocalImeLocalWindowExplicitEnableActivation()
      return
    }
    // Product ON selects the sole Experimental strategy: Local Window.
    configureLocalImePilot({
      entry: 'experimental-preview',
      available: true,
    })
    setHud(getLocalImePilotHudState())
    const unsubscribe = subscribeLocalImePilot(setHud)
    if (restartOnNextEnableRef.current) {
      restartOnNextEnableRef.current = false
      // restart 経路では pending な明示 ON intent を破棄する（epoch が変わるため）。
      clearLocalImeLocalWindowExplicitEnableActivation()
      const outcome = restartLocalImeLocalWindowRuntime()
      if (!outcome.ok && outcome.runtimeState === 'disabled') {
        setPreferenceEnabled(false)
      }
    } else {
      // LOCAL-WINDOW-EXPLICIT-ENABLE-ARM1: Port がまだ未登録なら intent を消費しない。
      // React 設定と EditorView attach はどちらが先でもよいので、Port が実際に受理する
      // ところ（ここ、または integration の late attach）でだけ exact-one に消費する。
      const port = getLocalImeLocalWindowRecoveryPort()
      if (port) {
        const explicit = consumeLocalImeLocalWindowExplicitEnableActivation()
        const outcome = port.requestEnabled({
          enabled: true,
          activation: explicit ? 'explicit-user-toggle' : 'configuration-sync',
        })
        if (!outcome.ok && outcome.runtimeState === 'disabled') {
          setPreferenceEnabled(false)
        }
      }
    }
    setHud(getLocalImePilotHudState())
    return () => {
      unsubscribe()
      configureLocalImePilot({ entry: 'experimental-preview', available: false })
      setHud(null)
      pendingDisableRef.current = false
      setTransientNotice(null)
      setDiscardConfirmPending(false)
    }
  }, [effectiveEnabled, setPreferenceEnabled])

  const diagnostics = effectiveEnabled
    ? getLocalImeLocalWindowRecoveryPort()?.diagnostics() ?? null
    : null
  const runtimeState: LocalImeLocalWindowProductRuntimeState =
    diagnostics?.runtimeState ?? (effectiveEnabled ? 'enabled-waiting' : 'disabled')
  const productStatus = toProductStatus(runtimeState)
  const recovery = runtimeState === 'recovery-suspended'
  const controls: LocalImeExperimentalPreviewControls = {
    showStop: false,
    showRetry: recovery && diagnostics?.retryable === true,
    showForceReset: recovery,
    showAttentionNotice: recovery,
    recoveryHasRetainedPayload: recovery && diagnostics?.draftRetained === true,
    showHaltedNotice: false,
  }

  const finishDisable = useCallback((): boolean => {
    const outcome = getLocalImeLocalWindowRecoveryPort()
      ?.requestEnabled({ enabled: false }) ?? null
    if (!outcome?.ok || outcome.runtimeState === 'recovery-suspended') return false
    pendingDisableRef.current = false
    setTransientNotice(null)
    setPreferenceEnabled(false)
    return true
  }, [setPreferenceEnabled])

  useEffect(() => {
    if (!hud || !pendingDisableRef.current) return
    if (hud.sessionMode !== null && hud.sessionMode !== 'off') return
    const preparation = requestLocalImeDocumentAction(
      LOCAL_IME_EXPERIMENTAL_PREVIEW_DISABLE_REASON,
    )
    if (resolveLocalImeExperimentalPreviewDisableOutcome({
      barrierStatus: preparation.status,
    }).applyPreferenceOff) finishDisable()
  }, [finishDisable, hud])

  const onChangeEnabled = useCallback((next: boolean) => {
    if (!decision.settingInteractive) return
    if (next) {
      // An unresolved recovery is visually OFF but retains its draft runtime.
      if (getLocalImeLocalWindowRecoveryPort()?.getRuntimeState() === 'recovery-suspended') {
        return
      }
      pendingDisableRef.current = false
      setTransientNotice(null)
      // 明示 ON。Port が実際に受理するまで typed な exact-one pending intent として
      // 保持する（enable effect と late attach のどちらが先でも 1 回だけ適用される）。
      requestLocalImeLocalWindowExplicitEnableActivation()
      setPreferenceEnabled(true)
      return
    }
    if (getLocalImeLocalWindowRecoveryPort()?.getRuntimeState() === 'recovery-suspended') {
      return
    }
    // 明示 OFF は pending な明示 ON intent を破棄する。
    clearLocalImeLocalWindowExplicitEnableActivation()
    if (pendingDisableRef.current) return
    const preparation = requestLocalImeDocumentAction(
      LOCAL_IME_EXPERIMENTAL_PREVIEW_DISABLE_REASON,
      () => { finishDisable() },
    )
    const outcome = resolveLocalImeExperimentalPreviewDisableOutcome({
      barrierStatus: preparation.status,
    })
    if (outcome.applyPreferenceOff) {
      finishDisable()
      return
    }
    pendingDisableRef.current = true
    setTransientNotice(
      outcome.notice === 'awaiting-composition'
        ? 'awaiting-composition'
        : outcome.notice === 'busy'
          ? 'busy'
          : null,
    )
  }, [decision.settingInteractive, finishDisable, setPreferenceEnabled])

  const onRetryRecovery = useCallback(() => {
    pendingDisableRef.current = false
    const outcome = retryLocalImeLocalWindowRecoveryToOff()
    if (!outcome.ok) return
    restartOnNextEnableRef.current = true
    setDiscardConfirmPending(false)
    setPreferenceEnabled(false)
  }, [setPreferenceEnabled])

  const onCopyRecoveryDraft = useCallback(() => {
    void copyLocalImeLocalWindowRecoveryMarkdown(async (markdown) => {
      if (typeof navigator === 'undefined' || !navigator.clipboard) return false
      await navigator.clipboard.writeText(markdown)
      return true
    })
  }, [])

  const onConfirmForceReset = useCallback(() => {
    const outcome = discardLocalImeLocalWindowRecoveryDraft(true)
    if (!outcome.ok) return
    restartOnNextEnableRef.current = true
    setDiscardConfirmPending(false)
    setPreferenceEnabled(false)
  }, [setPreferenceEnabled])

  const notice: LocalImeExperimentalPreviewNoticeKind | null = recovery
    ? 'attention'
    : effectiveEnabled
      ? transientNotice
      : null

  return {
    settingVisible: decision.settingVisible,
    settingInteractive: decision.settingInteractive,
    preferenceEnabled,
    effectiveEnabled,
    runtimeState,
    toggleOn: diagnostics?.toggleOn ?? false,
    productStatus,
    controls,
    forceResetPending: discardConfirmPending,
    recoveryDraftCopyAvailable: recovery && diagnostics?.draftRetained === true,
    notice,
    onChangeEnabled,
    onStopSession: () => undefined,
    onRetryRecovery,
    onCopyRecoveryDraft,
    onRequestForceReset: () => setDiscardConfirmPending(true),
    onConfirmForceReset,
    onCancelForceReset: () => setDiscardConfirmPending(false),
    onDismissNotice: () => setTransientNotice(null),
  }
}
