/**
 * 付箋タグ（sticky note tags）の pure helper。
 *
 * タグ定義は project root の `.nyoze/notes.json` の `stickyNoteTags` に保存し、
 * 付箋ごとの参照は `note.tags`（tag id 配列）に保持する。
 * Markdown 本文 / frontmatter には書き込まない。
 */

import type { NyozeNotesStore } from './noteStore'

export const STICKY_NOTE_TAG_SLOT_COUNT = 6
export const STICKY_NOTE_TAG_LABEL_MAX_LENGTH = 32

export type StickyNoteTagDefinition = {
  id: string
  label: string
}

/** serialize / normalize 上の空スロット表現。 */
export type StickyNoteTagSlotEntry = StickyNoteTagDefinition | null

/** UI スロット編集用。id は pad 済みスロットから引き継ぐ。 */
export type StickyNoteTagSlotDraft = {
  id: string
  label: string
}

export type StickyNoteTagSlotView = StickyNoteTagSlotDraft & {
  placeholder: string
}

const TAG_SLOT_PLACEHOLDERS = [
  '要確認',
  '加筆',
  '削除候補',
  '伏線',
  '人物',
  '文体',
] as const

export function createStickyNoteTagId(): string {
  return `tag-${crypto.randomUUID()}`
}

export function isValidTagId(value: string): boolean {
  return value.length > 0
}

/** UI 入力用: trim し、上限を適用。空文字は未設定。 */
export function normalizeTagLabel(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return ''
  if (trimmed.length <= STICKY_NOTE_TAG_LABEL_MAX_LENGTH) return trimmed
  return trimmed.slice(0, STICKY_NOTE_TAG_LABEL_MAX_LENGTH)
}

function normalizeTagDefinition(raw: unknown): StickyNoteTagDefinition | 'empty-slot' | null {
  if (raw === null) return 'empty-slot'
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (typeof record.id !== 'string' || !isValidTagId(record.id)) return null
  if (typeof record.label !== 'string') return null
  return { id: record.id, label: record.label }
}

/**
 * optional `stickyNoteTags` を検証する。
 * absent は valid (undefined)。配列長 > 6 は invalid。
 * 要素が null の場合は空スロット (index 保持)。
 */
export function normalizeStickyNoteTags(
  raw: unknown,
): StickyNoteTagSlotEntry[] | null | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) return null
  if (raw.length > STICKY_NOTE_TAG_SLOT_COUNT) return null
  const tags: StickyNoteTagSlotEntry[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i]
    if (item === undefined) continue
    const def = normalizeTagDefinition(item)
    if (def === null) return null
    tags[i] = def === 'empty-slot' ? null : def
  }
  return tags
}

/** optional `note.tags` を検証する。absent は valid (undefined)。 */
export function normalizeNoteTags(raw: unknown): string[] | null | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) return null
  const ids: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || item.length === 0) return null
    ids.push(item)
  }
  return ids
}

/** 読取後 in-memory を常に 6 スロットへ。不足分は空スロット。 */
export function padTagSlotsToSix(
  defs: readonly StickyNoteTagSlotEntry[] | undefined,
): StickyNoteTagSlotDraft[] {
  const slots: StickyNoteTagSlotDraft[] = []
  for (let i = 0; i < STICKY_NOTE_TAG_SLOT_COUNT; i += 1) {
    const def = defs?.[i]
    if (def && typeof def === 'object') {
      slots.push({ id: def.id, label: def.label })
    } else {
      slots.push({ id: '', label: '' })
    }
  }
  return slots
}

export function buildTagSlotViews(
  defs: readonly StickyNoteTagSlotEntry[] | undefined,
): StickyNoteTagSlotView[] {
  return padTagSlotsToSix(defs).map((slot, index) => ({
    ...slot,
    placeholder: TAG_SLOT_PLACEHOLDERS[index] ?? '',
  }))
}

/** trim 後 label が非空のタグのみ（picker 候補）。 */
export function listDefinedTags(
  slots: readonly StickyNoteTagSlotDraft[],
): StickyNoteTagDefinition[] {
  return slots
    .map((slot) => ({
      id: slot.id,
      label: normalizeTagLabel(slot.label),
    }))
    .filter((slot) => slot.label.length > 0 && isValidTagId(slot.id))
}

export function buildTagRegistry(
  defs: readonly StickyNoteTagSlotEntry[] | undefined,
): Map<string, StickyNoteTagDefinition> {
  const registry = new Map<string, StickyNoteTagDefinition>()
  for (const slot of padTagSlotsToSix(defs)) {
    const label = normalizeTagLabel(slot.label)
    if (label.length > 0 && isValidTagId(slot.id)) {
      registry.set(slot.id, { id: slot.id, label })
    }
  }
  return registry
}

export function resolveNoteTagLabels(
  tagIds: string[] | undefined,
  registry: ReadonlyMap<string, StickyNoteTagDefinition>,
): StickyNoteTagDefinition[] {
  if (!tagIds || tagIds.length === 0) return []
  const resolved: StickyNoteTagDefinition[] = []
  for (const id of tagIds) {
    const def = registry.get(id)
    if (def) resolved.push(def)
  }
  return resolved
}

/** 全 note（全 status）で tag id の参照数を数える。 */
export function countTagUsage(store: NyozeNotesStore, tagId: string): number {
  let count = 0
  for (const note of Object.values(store.notes)) {
    if (note.tags?.includes(tagId)) count += 1
  }
  return count
}

export type TagSlotValidationError =
  | { kind: 'duplicate-label'; label: string }
  | { kind: 'label-too-long' }
  | { kind: 'in-use'; tagId: string }
  | { kind: 'invalid-slots' }

export function validateTagSlotDrafts(
  drafts: readonly StickyNoteTagSlotDraft[],
  store: NyozeNotesStore,
  previousSlots: readonly StickyNoteTagSlotDraft[],
): TagSlotValidationError | null {
  if (drafts.length !== STICKY_NOTE_TAG_SLOT_COUNT) {
    return { kind: 'invalid-slots' }
  }

  const seenLabels = new Set<string>()
  for (let i = 0; i < drafts.length; i += 1) {
    const draft = drafts[i]!
    const normalized = normalizeTagLabel(draft.label)
    if (normalized.length === 0) {
      const prev = previousSlots[i]
      if (prev && isValidTagId(prev.id) && normalizeTagLabel(prev.label).length > 0) {
        if (countTagUsage(store, prev.id) > 0) {
          return { kind: 'in-use', tagId: prev.id }
        }
      }
      continue
    }
    if (normalized.length > STICKY_NOTE_TAG_LABEL_MAX_LENGTH) {
      return { kind: 'label-too-long' }
    }
    const key = normalized.toLocaleLowerCase()
    if (seenLabels.has(key)) {
      return { kind: 'duplicate-label', label: normalized }
    }
    seenLabels.add(key)
  }
  return null
}

/**
 * serialize 用: index = スロット位置。末尾の未使用空スロット (null) を trim。
 */
export function compactTagSlotsForSerialize(
  slots: readonly StickyNoteTagSlotDraft[],
): Array<StickyNoteTagDefinition | null> | undefined {
  const defs: Array<StickyNoteTagDefinition | null> = []
  for (let i = 0; i < STICKY_NOTE_TAG_SLOT_COUNT; i += 1) {
    const slot = slots[i]!
    const label = normalizeTagLabel(slot.label)
    if (label.length > 0 && isValidTagId(slot.id)) {
      defs.push({ id: slot.id, label })
    } else if (label.length === 0 && isValidTagId(slot.id)) {
      defs.push({ id: slot.id, label: '' })
    } else {
      defs.push(null)
    }
  }
  while (defs.length > 0) {
    const last = defs[defs.length - 1]
    if (last === null) {
      defs.pop()
      continue
    }
    if (normalizeTagLabel(last.label).length === 0) {
      defs.pop()
      continue
    }
    break
  }
  const hasContent = defs.some(
    (item) => item !== null && normalizeTagLabel(item.label).length > 0,
  )
  return hasContent ? defs : undefined
}

export function applyTagSlotDrafts(
  store: NyozeNotesStore,
  drafts: readonly StickyNoteTagSlotDraft[],
  previousSlots: readonly StickyNoteTagSlotDraft[],
  createId: () => string = createStickyNoteTagId,
): { store: NyozeNotesStore } | { error: TagSlotValidationError } {
  const validation = validateTagSlotDrafts(drafts, store, previousSlots)
  if (validation) return { error: validation }

  const nextSlots: StickyNoteTagSlotDraft[] = []
  for (let i = 0; i < STICKY_NOTE_TAG_SLOT_COUNT; i += 1) {
    const draft = drafts[i]!
    const prev = previousSlots[i]!
    const normalized = normalizeTagLabel(draft.label)
    if (normalized.length === 0) {
      nextSlots.push({
        id: isValidTagId(prev.id) ? prev.id : '',
        label: '',
      })
      continue
    }
    const id = isValidTagId(prev.id) ? prev.id : createId()
    nextSlots.push({ id, label: normalized })
  }

  const stickyNoteTags = compactTagSlotsForSerialize(nextSlots)
  const next: NyozeNotesStore = {
    version: store.version,
    notes: store.notes,
  }
  if (stickyNoteTags) {
    next.stickyNoteTags = stickyNoteTags
  } else {
    delete next.stickyNoteTags
  }
  return { store: next }
}

/**
 * UI で選択した既知 tag id と、registry に無い既存 id を preserve して merge。
 */
export function mergeNoteTagSelection(
  existingTags: string[] | undefined,
  selectedKnownIds: readonly string[],
  registry: ReadonlyMap<string, StickyNoteTagDefinition>,
): string[] {
  const knownSet = new Set<string>()
  const result: string[] = []

  for (const id of selectedKnownIds) {
    if (!registry.has(id)) continue
    if (knownSet.has(id)) continue
    knownSet.add(id)
    result.push(id)
  }

  for (const id of existingTags ?? []) {
    if (registry.has(id)) continue
    if (knownSet.has(id)) continue
    knownSet.add(id)
    result.push(id)
  }

  return result
}

export function buildNoteTagIdsForSave(
  draftIds: readonly string[],
  existingTags: string[] | undefined,
  registry: ReadonlyMap<string, StickyNoteTagDefinition>,
): string[] {
  return mergeNoteTagSelection(existingTags, draftIds, registry)
}

export const TAG_SUGGESTION_LABELS = TAG_SLOT_PLACEHOLDERS

export type TagManagerError =
  | { kind: 'duplicate-label'; label: string }
  | { kind: 'label-too-long' }
  | { kind: 'max-tags' }
  | { kind: 'tag-not-found' }
  | { kind: 'empty-label' }

export function countRegisteredTags(store: NyozeNotesStore): number {
  return listDefinedTags(padTagSlotsToSix(store.stickyNoteTags)).length
}

function findDuplicateLabelInSlots(
  slots: readonly StickyNoteTagSlotDraft[],
  label: string,
  excludeTagId?: string,
): boolean {
  const key = label.toLocaleLowerCase()
  for (const slot of slots) {
    const normalized = normalizeTagLabel(slot.label)
    if (normalized.length === 0) continue
    if (excludeTagId && slot.id === excludeTagId) continue
    if (normalized.toLocaleLowerCase() === key) return true
  }
  return false
}

function stripTagIdFromAllNotes(
  store: NyozeNotesStore,
  tagId: string,
): NyozeNotesStore['notes'] {
  const notes: NyozeNotesStore['notes'] = {}
  for (const [id, note] of Object.entries(store.notes)) {
    if (!note.tags?.includes(tagId)) {
      notes[id] = note
      continue
    }
    const filtered = note.tags.filter((t) => t !== tagId)
    const nextNote = { ...note }
    if (filtered.length > 0) {
      nextNote.tags = filtered
    } else {
      delete nextNote.tags
    }
    notes[id] = nextNote
  }
  return notes
}

export function addStickyNoteTag(
  store: NyozeNotesStore,
  rawLabel: string,
  createId: () => string = createStickyNoteTagId,
): { store: NyozeNotesStore } | { error: TagManagerError } {
  const label = normalizeTagLabel(rawLabel)
  if (label.length === 0) return { error: { kind: 'empty-label' } }
  if (label.length > STICKY_NOTE_TAG_LABEL_MAX_LENGTH) {
    return { error: { kind: 'label-too-long' } }
  }

  const slots = padTagSlotsToSix(store.stickyNoteTags)
  if (listDefinedTags(slots).length >= STICKY_NOTE_TAG_SLOT_COUNT) {
    return { error: { kind: 'max-tags' } }
  }
  if (findDuplicateLabelInSlots(slots, label)) {
    return { error: { kind: 'duplicate-label', label } }
  }

  const slotIndex = slots.findIndex((slot) => normalizeTagLabel(slot.label).length === 0)
  if (slotIndex < 0) return { error: { kind: 'max-tags' } }

  const nextSlots = slots.map((slot, i) =>
    i === slotIndex ? { id: createId(), label } : { ...slot },
  )

  const stickyNoteTags = compactTagSlotsForSerialize(nextSlots)
  const next: NyozeNotesStore = { version: store.version, notes: store.notes }
  if (stickyNoteTags) next.stickyNoteTags = stickyNoteTags
  return { store: next }
}

export function renameStickyNoteTag(
  store: NyozeNotesStore,
  tagId: string,
  rawLabel: string,
): { store: NyozeNotesStore } | { error: TagManagerError } {
  const label = normalizeTagLabel(rawLabel)
  if (label.length === 0) return { error: { kind: 'empty-label' } }
  if (label.length > STICKY_NOTE_TAG_LABEL_MAX_LENGTH) {
    return { error: { kind: 'label-too-long' } }
  }

  const slots = padTagSlotsToSix(store.stickyNoteTags)
  const index = slots.findIndex(
    (slot) => slot.id === tagId && normalizeTagLabel(slot.label).length > 0,
  )
  if (index < 0) return { error: { kind: 'tag-not-found' } }
  if (findDuplicateLabelInSlots(slots, label, tagId)) {
    return { error: { kind: 'duplicate-label', label } }
  }

  const nextSlots = slots.map((slot, i) =>
    i === index ? { ...slot, label } : { ...slot },
  )
  const stickyNoteTags = compactTagSlotsForSerialize(nextSlots)
  const next: NyozeNotesStore = { version: store.version, notes: store.notes }
  if (stickyNoteTags) next.stickyNoteTags = stickyNoteTags
  else delete next.stickyNoteTags
  return { store: next }
}

export function removeStickyNoteTag(
  store: NyozeNotesStore,
  tagId: string,
): { store: NyozeNotesStore } | { error: TagManagerError } {
  const slots = padTagSlotsToSix(store.stickyNoteTags)
  const index = slots.findIndex(
    (slot) => slot.id === tagId && normalizeTagLabel(slot.label).length > 0,
  )
  if (index < 0) return { error: { kind: 'tag-not-found' } }

  const nextSlots = slots.map((slot, i) =>
    i === index ? { id: '', label: '' } : { ...slot },
  )

  const stickyNoteTags = compactTagSlotsForSerialize(nextSlots)
  const next: NyozeNotesStore = {
    version: store.version,
    notes: stripTagIdFromAllNotes(store, tagId),
  }
  if (stickyNoteTags) next.stickyNoteTags = stickyNoteTags
  else delete next.stickyNoteTags
  return { store: next }
}

/** 付箋 view が登録済み tag id を持つか（filter 用。未知 id は対象外）。 */
export function noteViewHasRegisteredTag(
  note: { tagIds: readonly string[] },
  filterTagId: string,
): boolean {
  return note.tagIds.includes(filterTagId)
}

/** 単一 tag filter。`filterTagId === null` なら全件。 */
export function filterNoteViewsByTag<T extends { tagIds: readonly string[] }>(
  notes: readonly T[],
  filterTagId: string | null,
): T[] {
  if (filterTagId === null) return [...notes]
  return notes.filter((note) => noteViewHasRegisteredTag(note, filterTagId))
}

/** 選択中 filter tag id が現行 definedTags に存在するか。null は常に valid。 */
export function isRegisteredFilterTagId(
  tagId: string | null,
  definedTags: readonly StickyNoteTagDefinition[],
): boolean {
  if (tagId === null) return true
  return definedTags.some((tag) => tag.id === tagId)
}
