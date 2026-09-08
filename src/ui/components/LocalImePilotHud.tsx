/** Author-only Local Window diagnostic HUD. */

import { useState } from 'react'
import type { LocalImePilotHudStatus } from '../../editor-core/features/localImePilotState'
import type { LocalImePilotView } from '../hooks/useLocalImePilot'

type LocalImePilotHudProps = { pilot: LocalImePilotView | null }

const STATUS_LABEL: Record<LocalImePilotHudStatus, string> = {
  unavailable: 'UNAVAILABLE',
  off: 'OFF',
  armed: 'ARMED',
  composing: 'COMPOSING',
  processing: 'PROCESSING',
  suspended: 'SUSPENDED',
  recovery: 'RECOVERY',
  disabled: 'DISABLED / CIRCUIT BREAKER',
}

function keepLocalWindowFocus(event: { preventDefault: () => void }) {
  event.preventDefault()
}

export function LocalImePilotHud({ pilot }: LocalImePilotHudProps) {
  const [discardPending, setDiscardPending] = useState(false)
  if (!pilot) return null
  const { hud, localWindowRecovery } = pilot
  const retained = typeof hud.retainedPayloadLength === 'number' && hud.retainedPayloadLength > 0

  return (
    <section
      className="local-ime-pilot-hud"
      data-pilot-status={hud.status}
      data-testid="local-ime-pilot-hud"
      role="status"
      aria-live="polite"
      aria-label="Local Window pilot HUD"
    >
      <div className="local-ime-pilot-hud-title">Local Window pilot (dev only)</div>
      <div className="local-ime-pilot-hud-row"><span>Status</span><strong data-testid="local-ime-pilot-status">{STATUS_LABEL[hud.status]}</strong></div>
      <div className="local-ime-pilot-hud-row"><span>Session</span><strong data-testid="local-ime-pilot-session-mode">{hud.sessionMode ?? '—'}</strong></div>
      <div className="local-ime-pilot-hud-row"><span>Stops</span><strong data-testid="local-ime-pilot-stop-count">{hud.stopCount}</strong></div>
      <div className="local-ime-pilot-hud-row"><span>Last reason</span><strong data-testid="local-ime-pilot-stop-reason">{hud.lastStopReason ?? '—'}</strong></div>
      <div className="local-ime-pilot-hud-row"><span>Retained len</span><strong data-testid="local-ime-pilot-retained-length">{hud.retainedPayloadLength ?? '—'}</strong></div>
      {hud.lastArmRejectReason ? <div className="local-ime-pilot-hud-row"><span>Start reject</span><strong data-testid="local-ime-pilot-arm-reject">{hud.lastArmRejectReason}</strong></div> : null}
      {hud.showSuspendedNote ? <p className="local-ime-pilot-hud-note" data-testid="local-ime-pilot-suspended-note">Local Windowを停止しました。この操作は適用されていません。host editorで再実行してください。</p> : null}
      {hud.status === 'recovery' ? <p className="local-ime-pilot-hud-note" data-testid="local-ime-pilot-recovery-note">{retained ? '下書きを保持しています。解決するまで文書操作は停止します。' : '未確定入力は保持していません。状態を明示的に解決してください。'}</p> : null}
      <div className="local-ime-pilot-hud-actions">
        <button type="button" data-testid="local-ime-pilot-start" onMouseDown={keepLocalWindowFocus} onClick={pilot.onStart} disabled={!hud.canStart}>Start</button>
        <button type="button" data-testid="local-ime-pilot-resume" onMouseDown={keepLocalWindowFocus} onClick={pilot.onResume} disabled={!hud.canResume}>Resume</button>
        <button type="button" data-testid="local-ime-pilot-stop" onMouseDown={keepLocalWindowFocus} onClick={pilot.onStop} disabled={!hud.canStop}>Stop</button>
        <button type="button" data-testid="local-ime-pilot-kill" onMouseDown={keepLocalWindowFocus} onClick={pilot.onKill} disabled={!hud.canKill}>Kill</button>
      </div>
      {hud.forceResetPending ? (
        <div className="local-ime-pilot-hud-actions" data-testid="local-ime-pilot-force-reset-confirm-row">
          <button type="button" data-testid="local-ime-pilot-force-reset-confirm" onMouseDown={keepLocalWindowFocus} onClick={pilot.onConfirmForceReset}>{retained ? 'Discard' : 'Reset state'}</button>
          <button type="button" data-testid="local-ime-pilot-force-reset-cancel" onMouseDown={keepLocalWindowFocus} onClick={pilot.onCancelForceReset}>Cancel</button>
        </div>
      ) : (
        <div className="local-ime-pilot-hud-actions"><button type="button" data-testid="local-ime-pilot-force-reset" onMouseDown={keepLocalWindowFocus} onClick={pilot.onRequestForceReset} disabled={!hud.canForceReset}>Force reset…</button></div>
      )}
      {localWindowRecovery ? (
        <div className="local-ime-pilot-hud-local-window-recovery" data-testid="local-ime-local-window-recovery" data-runtime-state={localWindowRecovery.runtimeState} data-epoch={localWindowRecovery.epoch}>
          <div className="local-ime-pilot-hud-row"><span>Runtime</span><strong data-testid="local-ime-local-window-runtime-state">{localWindowRecovery.runtimeState}</strong></div>
          <div className="local-ime-pilot-hud-row"><span>Epoch / draft len</span><strong data-testid="local-ime-local-window-epoch">{localWindowRecovery.epoch} / {localWindowRecovery.draftLength ?? '—'}</strong></div>
          {localWindowRecovery.recoveryRuntimeAlive ? (
            <div className="local-ime-pilot-hud-actions">
              <button type="button" data-testid="local-ime-local-window-retry-to-off" onMouseDown={keepLocalWindowFocus} onClick={pilot.onLocalWindowRetryToOff} disabled={!localWindowRecovery.retryable}>Retry → OFF</button>
              <button type="button" data-testid="local-ime-local-window-copy-draft" onMouseDown={keepLocalWindowFocus} onClick={pilot.onLocalWindowCopyDraft} disabled={!localWindowRecovery.draftRetained}>Copy draft Markdown</button>
              {discardPending ? <><button type="button" data-testid="local-ime-local-window-discard-confirm" onMouseDown={keepLocalWindowFocus} onClick={() => { setDiscardPending(false); pilot.onLocalWindowDiscardDraft() }}>下書きを破棄して停止</button><button type="button" data-testid="local-ime-local-window-discard-cancel" onMouseDown={keepLocalWindowFocus} onClick={() => setDiscardPending(false)}>Cancel</button></> : <button type="button" data-testid="local-ime-local-window-discard-request" onMouseDown={keepLocalWindowFocus} onClick={() => setDiscardPending(true)}>下書きを破棄して停止…</button>}
            </div>
          ) : <div className="local-ime-pilot-hud-actions"><button type="button" data-testid="local-ime-local-window-restart" onMouseDown={keepLocalWindowFocus} onClick={pilot.onLocalWindowRestart}>Restart runtime (new epoch)</button></div>}
        </div>
      ) : null}
    </section>
  )
}
