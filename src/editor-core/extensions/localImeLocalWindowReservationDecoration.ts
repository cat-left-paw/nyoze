import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

export const LOCAL_IME_LOCAL_WINDOW_SOURCE_CLASS = 'nyoze-local-window-source'
export const LOCAL_IME_LOCAL_WINDOW_RESERVATION_CLASS = 'nyoze-local-window-reservation-anchor'

type Target = { positions: readonly number[]; nodes: readonly ProseMirrorNode[] } | null

/**
 * LOCAL-WINDOW-RESERVATION-PLUGIN-LIFETIME1:
 * host EditorView 生存中ずっと同じ参照を保つ mutable holder。plugin state field として
 * 持ち、`apply` は同じ holder を返すだけにする。target 変更で state / plugin 構成を
 * 作り替えないため、Local Window の Start / Stop で host の plugin view は再生成されない。
 */
export type LocalImeLocalWindowReservationTargetHolder = { target: Target }

export const localImeLocalWindowReservationPluginKey =
  new PluginKey<LocalImeLocalWindowReservationTargetHolder>(
    'nyozeLocalImeLocalWindowReservation',
  )

export type LocalImeLocalWindowReservationOwner = {
  setTarget: (target: Exclude<Target, null>) => void
  clear: () => void
  hasTarget: () => boolean
}

/**
 * 全 captured source を隠し、最後の source だけを delta owner にする表示専用 plugin。
 * host Editor の初期 plugin 構成へ 1 個だけ入れる（動的 install / 削除はしない）。
 */
export function createLocalImeLocalWindowReservationPlugin(): Plugin<
  LocalImeLocalWindowReservationTargetHolder
> {
  return new Plugin<LocalImeLocalWindowReservationTargetHolder>({
    key: localImeLocalWindowReservationPluginKey,
    state: {
      init: () => ({ target: null }),
      apply: (_transaction, holder) => holder,
    },
    props: {
      decorations(state) {
        const current = localImeLocalWindowReservationPluginKey.getState(state)?.target ?? null
        if (
          !current || current.positions.length === 0 ||
          current.positions.length !== current.nodes.length
        ) {
          return DecorationSet.empty
        }
        const decorations: Decoration[] = []
        for (let index = 0; index < current.positions.length; index += 1) {
          const pos = current.positions[index]
          const node = state.doc.nodeAt(pos)
          if (node !== current.nodes[index] || node?.type.name !== 'paragraph') {
            return DecorationSet.empty
          }
          decorations.push(Decoration.node(pos, pos + node.nodeSize, {
            class: index === current.positions.length - 1
              ? `${LOCAL_IME_LOCAL_WINDOW_SOURCE_CLASS} ${LOCAL_IME_LOCAL_WINDOW_RESERVATION_CLASS}`
              : LOCAL_IME_LOCAL_WINDOW_SOURCE_CLASS,
            'data-nyoze-local-window-source': 'true',
            ...(index === current.positions.length - 1
              ? { 'data-nyoze-local-window-reservation-anchor': 'true' }
              : {}),
          }))
        }
        return DecorationSet.create(state.doc, decorations)
      },
    },
  })
}

/** host の初期 extension 構成へ入れる登録口。plugin instance は editor ごとに 1 個。 */
export const LocalImeLocalWindowReservation = Extension.create({
  name: 'localImeLocalWindowReservation',

  addProseMirrorPlugins() {
    return [createLocalImeLocalWindowReservationPlugin()]
  },
})

/**
 * host view ごとの owner。plugin state は毎回 `view.state` から読み直すので、
 * document load 等で state が作り直されても stale holder を掴まない。
 * plugin が構成に無い view では `null`（Local Window は Start しない）。
 */
export function resolveLocalImeLocalWindowReservationOwner(
  view: EditorView,
): LocalImeLocalWindowReservationOwner | null {
  const readHolder = (): LocalImeLocalWindowReservationTargetHolder | null =>
    localImeLocalWindowReservationPluginKey.getState(view.state) ?? null
  if (!readHolder()) return null
  // 同じ state・同じ plugins 配列のまま Decoration だけ再評価する。
  const refresh = () => {
    if (!view.dom.isConnected) return
    try { view.updateState(view.state) } catch { /* teardown race */ }
  }
  return {
    setTarget(next) {
      const holder = readHolder()
      if (!holder) return
      holder.target = next
      refresh()
    },
    clear() {
      const holder = readHolder()
      if (!holder || holder.target === null) return
      holder.target = null
      refresh()
    },
    hasTarget: () => readHolder()?.target != null,
  }
}
