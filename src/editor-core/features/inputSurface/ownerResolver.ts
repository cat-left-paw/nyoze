import type { EditOwner } from './editOwner'

/** S2のownerはHostのみ。入力面にはowner種別の条件を置かない（P8）。 */
export function createOwnerResolver(host: EditOwner): { current(): EditOwner } {
  return { current: () => host }
}
