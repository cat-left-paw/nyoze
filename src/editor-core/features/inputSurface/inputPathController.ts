import type { Editor } from '@tiptap/core'
import type { InputPath } from '../inputPathDecision'
import { hasPendingSpecialInlineBoundaryInput } from '../../extensions/specialInlineBoundarySentinel'
import {
  commitInputPath, getInputPath, noteDeferredInputSurfaceCreationFailed, noteInputPathDiagnostic, registerInputPathController,
  type InputPathChangeOutcome, type InputPathChangeReason, type InputPathController, type InputSurfaceCompositionState,
} from './inputPathRuntime'
import { isInputSurfaceCapable, isInputSurfacePathActive } from './inputSurfaceGate'
import { describeInputSurfaceCreateFailure } from './inputSurfaceCreation'

type SwitchableSurface = {
  hasPayloadBearingState(): boolean
  isSurfaceComposing(): boolean
  surfaceCompositionState(): InputSurfaceCompositionState | null
  isSurfaceFocused(): boolean
  discardComposition(): boolean
  pathChanged(): void
}

type ControllerOptions = {
  editor: Editor
  getSurface(): SwitchableSurface | null
  /** 入力面を、この起動で最初に必要になったときに作る。 */
  ensureSurface(): SwitchableSurface | null
  isHostComposing(): boolean
  /** Hostに保留の入力（sentinelの変換中の記録、保持している確定文字）が残っている。 */
  hasHostPendingInput(): boolean
  /** いま入力面を作ると壊れるものがある（Paragraph Plainのoverlay）。作るのを後へ回す。 */
  isSurfaceCreationUnsafe(): boolean
  record?(kind: string, detail: Record<string, unknown>): void
}

/**
 * 入力の方式の切り替えの境界（PIS-S10-ENTRY1b）。
 *
 * 判定は同期の事実だけ。止めたら方式を変えず、待たない・自動で再試行しない。
 * 切り替えそのものは本文のtransactionを出さない。
 *
 * | 場面 | 従来の入力 → PIS | PIS → 従来の入力 |
 * | --- | --- | --- |
 * | Hostで変換中 | 止める | 止める（I7・`host-keyboard`の変換） |
 * | Hostに保留の入力（sentinel） | 止める（pluginの登録が帳簿を消すため。入力面がすでにあっても同じ規則） | 通す |
 * | 入力面で変換中・保持文字あり | — | 止める。保持文字のない変換中だけ、利用者の確認つきの破棄（E4）で通す |
 * | 範囲・NodeSelection・AllSelectionを選択中 | 通す（入力面へfocus、`surface-range`とHighlight） | 通す（Highlightを消し、Hostへfocus。PMがDOMの選択へ書く） |
 * | pointerの貸し出し中・`host-keyboard` | — | 通す（貸し出しを取り消す。focusは動かさない） |
 * | modal・検索欄がfocus、Source Mode、read-only | 方式だけを変える | 方式だけを変える |
 * | Paragraph Plain | 方式だけを変える。入力面がまだなければ、出たときに作る | 方式だけを変える |
 * | 入力面の生成・最初のfocusの失敗 | 方式を戻して止める | — |
 */
export function createInputPathController(options: ControllerOptions): InputPathController & { modeChanged(): void } {
  /** 入力面を作る。作れなければnullを返し、理由（typed）を診断とrecordへ残す（方式は呼ぶ側が従来の入力のままにする）。 */
  const createSurface = (): SwitchableSurface | null => {
    try { return options.ensureSurface() } catch (error) {
      const reason = describeInputSurfaceCreateFailure(error)
      noteInputPathDiagnostic({ kind: 'create-failure', reason })
      options.record?.('input-surface-create-failed', { reason })
      return null
    }
  }
  const blocked = (reason: InputPathChangeReason, next: InputPath): InputPathChangeOutcome => {
    noteInputPathDiagnostic({ kind: 'blocked', reason })
    options.record?.('input-path-switch-blocked', { reason, next })
    return { ok: false, path: getInputPath(), reason }
  }
  /** 従来の入力へ戻した直後: Hostがfocusを持つなら、DOMの選択とPMのselectionの一致を確かめる（記録だけ）。 */
  const verifyHostDomSelection = () => {
    const view = options.editor.view
    const doc = view.dom.ownerDocument
    if (doc.activeElement !== view.dom) return
    const dom = doc.getSelection()
    const pm = view.state.selection
    try {
      if (!dom || !dom.anchorNode || !dom.focusNode) throw Error('no-dom-selection')
      const anchor = view.posAtDOM(dom.anchorNode, dom.anchorOffset), head = view.posAtDOM(dom.focusNode, dom.focusOffset)
      if (Math.min(anchor, head) === pm.from && Math.max(anchor, head) === pm.to) return
    } catch { /* 下で記録する */ }
    noteInputPathDiagnostic({ kind: 'dom-selection-mismatch' })
    options.record?.('input-path-dom-selection-mismatch', { from: pm.from, to: pm.to })
  }
  return {
    surfaceComposition: () => options.getSurface()?.surfaceCompositionState() ?? null,
    switchTo(next, change) {
      if (!isInputSurfaceCapable()) return blocked('not-capable', next)
      if (getInputPath() === next) return { ok: true, path: next }
      if (options.isHostComposing()) return blocked('host-composing', next)
      const existing = options.getSurface()
      if (next === 'input-surface') {
        if (options.hasHostPendingInput()) return blocked('host-pending-input', next)
        if (!existing && options.isSurfaceCreationUnsafe()) {
          // 方式だけを変える。入力面は、安全になった時点（Paragraph Plainを出たとき）で作る。
          commitInputPath(next)
          noteInputPathDiagnostic({ kind: 'deferred-creation' })
          noteInputPathDiagnostic({ kind: 'switched' })
          options.record?.('input-path-switched', { next, deferredCreation: true })
          return { ok: true, path: next }
        }
        const surface = createSurface()
        if (!surface) return blocked('create-failed', next)
        const view = options.editor.view
        const hostFocused = view.dom.ownerDocument.activeElement === view.dom
        commitInputPath(next)
        surface.pathChanged()
        // Hostがfocusを持っていたのに入力面へ入れなければ、方式を戻す（表示と実際を食い違わせない）。
        if (hostFocused && view.editable && view.dom.ownerDocument.activeElement === view.dom && !surface.isSurfaceFocused()) {
          commitInputPath('host')
          surface.pathChanged()
          return blocked('focus-failed', next)
        }
      } else {
        if (existing?.isSurfaceComposing() && change?.discardComposition) {
          if (existing.discardComposition()) {
            noteInputPathDiagnostic({ kind: 'composition-discarded' })
            options.record?.('input-path-composition-discarded', {})
          }
        }
        if (existing?.hasPayloadBearingState()) return blocked('surface-payload', next)
        commitInputPath(next)
        existing?.pathChanged()
        verifyHostDomSelection()
      }
      noteInputPathDiagnostic({ kind: 'switched' })
      options.record?.('input-path-switched', { next })
      return { ok: true, path: next }
    },
    /** modeの明示通知（Paragraph Plainの出入り）。後へ回した入力面の生成を、安全になった時点で行う。 */
    modeChanged() {
      if (!isInputSurfacePathActive() || options.getSurface() || options.isSurfaceCreationUnsafe()) return
      const surface = createSurface()
      if (!surface) {
        // 作れなければ、従来の入力へ戻す（入口のhookが、1回だけ読める通知で設定を合わせる）。
        noteDeferredInputSurfaceCreationFailed()
        commitInputPath('host')
        blocked('create-failed', 'input-surface')
        return
      }
      surface.pathChanged()
    },
  }
}

/**
 * 入力面を、その起動で最初にPISが必要になったときに作り、editorの破棄まで壊さない（P3）。
 * 生成時にすでにPISなら、その場で作る。capabilityがなければ`create()`がnullを返し、何も作らない。
 */
export function connectLazyInputSurface<T extends SwitchableSurface & { destroy(): void }>(options: {
  editor: Editor
  create(): T | null
  onChange(surface: T | null): void
  isHostComposing(): boolean
  isParagraphPlainActive(): boolean
  onParagraphPlainModeChange(listener: () => void): () => void
  record?(kind: string, detail: Record<string, unknown>): void
}): { destroy(): void } {
  let surface: T | null = null
  const ensure = () => {
    if (!surface) {
      surface = options.create()
      if (surface) noteInputPathDiagnostic({ kind: 'surface-created' })
      options.onChange(surface)
    }
    return surface
  }
  if (isInputSurfacePathActive()) {
    // editorの生成時に、すでにPISのとき（保存済みのON、開発用の強制ON）。作れなければ、editorの生成を壊さず、
    // 従来の入力のままにする（入口のhookが、1回だけ読める通知で設定を合わせる。強制ONは方式を変えられない）。
    try { ensure() } catch (error) {
      noteInputPathDiagnostic({ kind: 'create-failure', reason: describeInputSurfaceCreateFailure(error) })
      options.record?.('input-surface-create-failed', { reason: describeInputSurfaceCreateFailure(error) })
      noteDeferredInputSurfaceCreationFailed()
      commitInputPath('host')
      noteInputPathDiagnostic({ kind: 'blocked', reason: 'create-failed' })
      options.record?.('input-path-switch-blocked', { reason: 'create-failed', next: 'input-surface' })
    }
  }
  const controller = createInputPathController({
    editor: options.editor, getSurface: () => surface, ensureSurface: ensure,
    isHostComposing: options.isHostComposing,
    // Hostの述語をそのまま使う（Paragraph Plainへ入るときのguardと同じ述語）。
    hasHostPendingInput: () => hasPendingSpecialInlineBoundaryInput(options.editor.view),
    isSurfaceCreationUnsafe: options.isParagraphPlainActive, record: options.record,
  })
  const unregister = registerInputPathController(controller)
  const unsubscribe = isInputSurfaceCapable() ? options.onParagraphPlainModeChange(controller.modeChanged) : () => {}
  return { destroy() { unsubscribe(); unregister(); surface?.destroy() } }
}
