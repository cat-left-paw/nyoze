/**
 * EDITOR-TAB-REORDER1: タブ列の drag を DOM の pointer event へつなぐ controller。
 *
 * - 判定は `tabDragGesture.ts`（純粋な状態機械）、挿入位置の計算と並べ替えは `tabReorder.ts`。
 *   ここは「pointer event を状態機械へ渡し、返った副作用を実行する」だけで、タブ列の DOM
 *   （`.editor-tab-list` の直下の `.editor-tab` の矩形）以外は読まない。editor の DOM・選択・
 *   focus には触れない。
 * - window の listener は、primary の pointerdown が drag の候補になった間だけ付ける。
 *   timer・rAF・polling は使わない（状態は pointer event だけで進む）。
 * - pointerdown の既定の動き（focus など）は変えない。`preventDefault()` も `focus()` も呼ばない。
 * - pointer capture は drag が始まってから（しきい値を超えてから）だけ。pointerdown の時点で掴むと、
 *   `×` の click の target が tab のボタンへ変わり、閉じる操作が壊れる。
 * - drag が終わった後の click（pointerup の直後に同じ gesture の click が届く）は、window の capture
 *   phase で 1 回だけ止める。次の pointerdown / keydown / 最初の click で必ず外す。
 */
import {
  computeInsertionGap,
  resolveDropTarget,
  type TabDropTarget,
  type TabReorderRequest,
} from './tabReorder'
import {
  INITIAL_TAB_DRAG_STATE,
  stepTabDrag,
  type TabDragEvent,
  type TabDragState,
} from './tabDragGesture'

const TAB_SELECTOR = ':scope > .editor-tab'
const CLOSE_SELECTOR = '.editor-tab-close'

export type TabDragView = {
  /** drag が始まっている tab の id。 */
  readonly draggingTabId: string | null
  /** 落とすと動く場合の挿入位置。動かない位置では null（挿入位置を示さない）。 */
  readonly target: TabDropTarget | null
}

export const IDLE_TAB_DRAG_VIEW: TabDragView = { draggingTabId: null, target: null }

export type TabDragControllerDeps = {
  readonly getList: () => HTMLElement | null
  readonly onView: (view: TabDragView) => void
  readonly onCommit: (request: TabReorderRequest) => void
}

export type TabDragController = {
  /** tab のボタンの pointerdown。`tab` はそのボタン、`event` は native の PointerEvent。 */
  readonly onTabPointerDown: (event: PointerEvent, tab: HTMLElement, tabId: string) => void
  /** 進行中の gesture と click の抑止を捨てる。unmount 用（再利用してもよい）。 */
  readonly destroy: () => void
}

type Session = {
  readonly tab: HTMLElement
  readonly tabId: string
  readonly orderAtStart: readonly string[]
  target: TabDropTarget | null
}

function sameView(a: TabDragView, b: TabDragView): boolean {
  return a.draggingTabId === b.draggingTabId && a.target?.gap === b.target?.gap
}

function readStrip(list: HTMLElement): { elements: HTMLElement[]; ids: string[] } {
  const elements = Array.from(list.querySelectorAll<HTMLElement>(TAB_SELECTOR))
  return { elements, ids: elements.map((element) => element.dataset.tabId ?? '') }
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function createTabDragController(
  deps: TabDragControllerDeps,
  win: Window = window,
): TabDragController {
  let state: TabDragState = INITIAL_TAB_DRAG_STATE
  let session: Session | null = null
  let view: TabDragView = IDLE_TAB_DRAG_VIEW
  let detachGesture: (() => void) | null = null
  let disarmClick: (() => void) | null = null

  const emit = (next: TabDragView) => {
    if (sameView(view, next)) return
    view = next
    deps.onView(next)
  }

  const endGesture = () => {
    detachGesture?.()
    detachGesture = null
    session = null
    state = INITIAL_TAB_DRAG_STATE
    emit(IDLE_TAB_DRAG_VIEW)
  }

  const armClickSuppression = () => {
    disarmClick?.()
    const disarm = () => {
      win.removeEventListener('click', onClick, true)
      win.removeEventListener('pointerdown', disarm, true)
      win.removeEventListener('keydown', disarm, true)
      if (disarmClick === disarm) disarmClick = null
    }
    const onClick = (event: Event) => {
      disarm()
      event.stopPropagation()
      event.preventDefault()
    }
    win.addEventListener('click', onClick, true)
    win.addEventListener('pointerdown', disarm, true)
    win.addEventListener('keydown', disarm, true)
    disarmClick = disarm
  }

  /** 挿入位置を、いま画面に出ているタブ列の矩形と pointer の x から計算し直す。 */
  const updateTarget = (x: number) => {
    const list = deps.getList()
    if (list === null || session === null) return
    const strip = readStrip(list)
    // drag の間にタブ列が変わった（別の経路で tab が増減・移動した）。古い位置では確定しない。
    if (!sameOrder(strip.ids, session.orderAtStart)) {
      run({ type: 'escape' })
      return
    }
    const centers = strip.elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return rect.left + rect.width / 2
    })
    const fromIndex = strip.ids.indexOf(session.tabId)
    const target = resolveDropTarget(fromIndex, computeInsertionGap(centers, x), strip.ids.length)
    session.target = target
    emit({ draggingTabId: session.tabId, target })
  }

  const run = (event: TabDragEvent) => {
    const step = stepTabDrag(state, event)
    state = step.state
    const current = session
    switch (step.effect) {
      case 'none':
        if (state.phase === 'idle' && current !== null) endGesture()
        return
      case 'drag-started': {
        if (current === null || event.type !== 'move') return
        try {
          current.tab.setPointerCapture(event.pointerId)
        } catch {
          // capture できなくても window の listener で追える。
        }
        updateTarget(event.x)
        return
      }
      case 'drag-moved':
        if (event.type === 'move') updateTarget(event.x)
        return
      case 'commit': {
        const request: TabReorderRequest | null =
          current !== null && current.target !== null
            ? { tabId: current.tabId, gap: current.target.gap, orderAtStart: current.orderAtStart }
            : null
        endGesture()
        armClickSuppression()
        if (request !== null) deps.onCommit(request)
        return
      }
      case 'suppress-click':
        endGesture()
        armClickSuppression()
        return
      case 'aborted':
        emit(IDLE_TAB_DRAG_VIEW)
        if (state.phase === 'idle') endGesture()
        return
    }
  }

  const attach = () => {
    const onMove = (event: PointerEvent) =>
      run({
        type: 'move',
        pointerId: event.pointerId,
        x: event.clientX,
        primaryDown: (event.buttons & 1) === 1,
      })
    const onUp = (event: PointerEvent) => run({ type: 'up', pointerId: event.pointerId })
    const onCancel = (event: PointerEvent) => run({ type: 'cancel', pointerId: event.pointerId })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || state.phase !== 'dragging') return
      // drag を取り消す Esc は drag が使い切る（ほかの Esc の処理へ渡さない）。
      event.preventDefault()
      event.stopPropagation()
      run({ type: 'escape' })
    }
    const onBlur = (event: Event) => {
      if (event.target === win) run({ type: 'blur' })
    }
    win.addEventListener('pointermove', onMove)
    win.addEventListener('pointerup', onUp)
    win.addEventListener('pointercancel', onCancel)
    win.addEventListener('lostpointercapture', onCancel as EventListener, true)
    win.addEventListener('keydown', onKeyDown, true)
    win.addEventListener('blur', onBlur)
    detachGesture = () => {
      win.removeEventListener('pointermove', onMove)
      win.removeEventListener('pointerup', onUp)
      win.removeEventListener('pointercancel', onCancel)
      win.removeEventListener('lostpointercapture', onCancel as EventListener, true)
      win.removeEventListener('keydown', onKeyDown, true)
      win.removeEventListener('blur', onBlur)
    }
  }

  return {
    onTabPointerDown(event, tab, tabId) {
      // 新しい pointerdown は、前の gesture の取り残し（pointerup の取り逃し）を必ず捨てて始め直す。
      disarmClick?.()
      endGesture()
      const list = deps.getList()
      if (list === null) return
      const strip = readStrip(list)
      const target = event.target as Element | null
      const step = stepTabDrag(state, {
        type: 'down',
        tabId,
        pointerId: event.pointerId,
        x: event.clientX,
        button: event.button,
        isPrimary: event.isPrimary,
        onClose: target?.closest?.(CLOSE_SELECTOR) != null,
        tabCount: strip.ids.length,
      })
      state = step.state
      if (state.phase !== 'pending') return
      session = { tab, tabId, orderAtStart: strip.ids, target: null }
      attach()
    },
    destroy() {
      disarmClick?.()
      endGesture()
    },
  }
}
