import type { InputRestrictionNotice } from '../../editor-core/features/inputSurface/inputRestrictionNotice'
import type { UiTextKey } from '../i18n/uiText'

/**
 * PIS-INPUT-BLOCK-WARN1: 打つ前に分かった入力の拒否ごとの警告の文言のkey（作者が承認した文）。
 * 直接入力は止めた文、変換は開始で知らせる文（確定した文字は入力欄に残る）。
 *
 * `block-atom`（blockのatomの直後に段落を置けない。B15）は、本番のschemaでは到達できないので、文を持たず
 * `null`（何も表示しない）。到達できるようになったら、`tests/pis-input-block-warn1.test.ts`の列挙が落ちる。
 */
const KEYS = {
  tcy: { direct: 'editor.inputRestriction.tcy.direct', composition: 'editor.inputRestriction.tcy.composition' },
  'note-anchor': { direct: 'editor.inputRestriction.noteAnchor.direct', composition: 'editor.inputRestriction.noteAnchor.composition' },
  'block-atom': null,
} as const satisfies Record<InputRestrictionNotice['restriction'], Record<InputRestrictionNotice['via'], UiTextKey> | null>

export function resolveInputRestrictionNoticeKey(notice: InputRestrictionNotice): UiTextKey | null {
  return KEYS[notice.restriction]?.[notice.via] ?? null
}
