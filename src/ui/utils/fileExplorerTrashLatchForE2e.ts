/**
 * NYOZE_E2E-only latch for the File Explorer delete race.
 *
 * `trashItem()` の完了待ちの間にユーザーがタブ切替 / 編集を行う競合を、E2E から
 * 決定的に注入するためだけの hold。arm するのは E2E だけで、production は常に
 * 「armed でない = 即 resolve」になる。timer / polling / quiet period は持たない。
 *
 * hold は「操作 lease 取得後・trashItem 呼び出し前」で待つ。lease が効いていること
 * （タブ切替が拒否されること）と、lease で止められない編集が起きたときの収束
 * （削除済み path のタブを残さない）を、同じ窓で観測できる。
 */

export type ExplorerTrashHoldSnapshot = {
  readonly armed: boolean
  readonly waiting: boolean
}

let armed = false
let waiting = false
let releaseWait: (() => void) | null = null
let waitPromise: Promise<void> | null = null

export function snapshotExplorerTrashHoldForE2e(): ExplorerTrashHoldSnapshot {
  return { armed, waiting }
}

export function armExplorerTrashHoldForE2e(): boolean {
  if (armed) return false
  armed = true
  waiting = false
  waitPromise = new Promise<void>((resolve) => {
    releaseWait = resolve
  })
  return true
}

/** armed でなければ即座に解決する（production 経路）。 */
export async function awaitExplorerTrashHoldForE2e(): Promise<void> {
  if (!armed || !waitPromise) return
  waiting = true
  await waitPromise
}

export function releaseExplorerTrashHoldForE2e(): boolean {
  if (!armed) return false
  releaseWait?.()
  armed = false
  waiting = false
  releaseWait = null
  waitPromise = null
  return true
}
