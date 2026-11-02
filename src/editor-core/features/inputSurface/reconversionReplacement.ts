import type { OwnerInsertionSnapshot } from './editOwner'
import { sameMirrorRange, type SelectionMirror } from './selectionMirror'

const boundary = (text: string, at: number) => !(at > 0 && at < text.length
  && text.charCodeAt(at - 1) >= 0xd800 && text.charCodeAt(at - 1) <= 0xdbff
  && text.charCodeAt(at) >= 0xdc00 && text.charCodeAt(at) <= 0xdfff)
/** IMEが変えたDだけの位置を証明する。P/Sをpayloadとして書き戻さない。 */
export function resolveReconversionReplacement(copy: SelectionMirror, snapshot: OwnerInsertionSnapshot | null, raw: string, data: string, continuation = false) {
  if (!snapshot || !sameMirrorRange(copy, snapshot) || !data) return null
  if (raw === data) return { snapshot, original: copy }
  if (continuation) return null
  for (let prefix = 0; prefix <= copy.text.length; prefix++) {
    if (raw.slice(prefix, prefix + data.length) !== data) continue
    const p = raw.slice(0, prefix), s = raw.slice(prefix + data.length)
    if (!copy.text.startsWith(p) || !copy.text.endsWith(s) || p.length + s.length > copy.text.length) continue
    if (![boundary(copy.text, p.length), boundary(copy.text, copy.text.length - s.length), boundary(raw, p.length), boundary(raw, p.length + data.length)].every(Boolean)) continue
    const target = { ...snapshot, from: snapshot.from + p.length, to: snapshot.to - s.length }
    return { snapshot: target, original: { ...target, text: copy.text.slice(p.length, copy.text.length - s.length) } }
  }
  return null
}
