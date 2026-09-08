/**
 * LOCAL-WINDOW-FOLD-HANDOFF1 — 見出し fold の既存 document-action barrier 入口。
 *
 * `prepareLocalImeForDocumentAction` を 1 回だけ再利用する。
 * continuation / 第二 barrier / fold 専用 controller は持たない。
 * compositionend 後の fold replay もしない。
 */

import type { Node as PMNode } from '@tiptap/pm/model'
import { prepareLocalImeForDocumentAction } from './localImeDocumentActionBarrier'
import type { LocalImeDocumentActionPreparation } from './localImeInputSessionState'
import {
  captureHeadingFoldTarget,
  resolveHeadingFoldTarget,
} from './localImeHeadingFoldTarget'

export const LOCAL_IME_HEADING_FOLD_HANDOFF_REASON = 'outline-fold-toggle' as const

export type LocalImeHeadingFoldHandoffOptions = {
  /** host PM の実 IME composition。local session active とは区別する。 */
  readonly hostImeComposing?: boolean
}

export type LocalImeHeadingFoldHandoffResult = {
  readonly preparation: LocalImeDocumentActionPreparation
  readonly resolvedPos: number | null
}

export function runLocalImeHeadingFoldHandoff(
  getDoc: () => PMNode,
  headingPos: number,
  options?: LocalImeHeadingFoldHandoffOptions,
): LocalImeHeadingFoldHandoffResult {
  if (options?.hostImeComposing === true) {
    return { preparation: { status: 'wait-for-composition' }, resolvedPos: null }
  }
  const captured = captureHeadingFoldTarget(getDoc(), headingPos)
  if (!captured) {
    return { preparation: { status: 'ready' }, resolvedPos: null }
  }
  const preparation = prepareLocalImeForDocumentAction(
    LOCAL_IME_HEADING_FOLD_HANDOFF_REASON,
  )
  if (preparation.status !== 'ready') {
    return { preparation, resolvedPos: null }
  }
  return {
    preparation,
    resolvedPos: resolveHeadingFoldTarget(getDoc(), captured),
  }
}
