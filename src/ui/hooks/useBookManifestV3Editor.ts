import { useCallback, useRef, useState } from 'react'
import {
  BOOK_MANIFEST_V3_MAX_CREDITS,
  type BookManifestV3MaterialRole,
} from '../../project/bookManifestV3'
import type {
  BookManifestV3UpdateOperation,
  ProjectPanelWriteAnchor,
  UpdateBookManifestV3Result,
} from '../../project/projectIpcTypes'

/**
 * Project タブ v3 Book / 本文 / 資料 metadata の編集 state hook。
 *
 * 設計の正本は `docs/book-manifest-v3-design-2026-06.md`（スライス7）。
 *
 * 境界:
 * - renderer から projectRoot は渡さない。保存時は beginEdit 時点で凍結した write anchor と
 *   operation だけを `project:updateBookManifestV3` に渡し、main 側で project root 解決 + atomic write する。
 * - 書き込むのは `.nyoze/books.json` だけ。Markdown / frontmatter / 本文には触れない。
 * - `label` という概念・field・operation は持たない。表示 metadata は title / authors / translators。
 * - 編集できるのは Book（name / authors）・本文（title / authors / translators）・
 *   資料（title / authors / translators / role）の metadata、追加・並べ替え・登録解除、
 *   manifest absent 時の最初の Book 作成。
 * - 保存失敗・各種エラー時は draft を保持する（無言破棄しない）。明示キャンセルだけが破棄する。
 * - 同時編集セッションは 1 つ。資料 preview / title 編集との同時編集は container 側で防ぐ。
 */

export type BookManifestV3EditError =
  | 'invalid-manifest'
  | 'read-error'
  | 'write-error'
  | 'invalid-input'
  | 'book-not-empty'
  | 'not-in-project'
  | 'invalid-path'
  | 'save-failed'

/** authors / translators を扱う credit 配列の field 名。 */
export type CreditField = 'authors' | 'translators'

type EditCommonFields = {
  /** beginEdit 時点の write anchor。保存先 project をここで凍結する。 */
  writeAnchor: ProjectPanelWriteAnchor
  busy: boolean
  error: BookManifestV3EditError | null
}

export type BookManifestV3EditState =
  | { kind: 'idle' }
  | (EditCommonFields & {
      kind: 'edit-book'
      bookId: string
      originalName: string
      name: string
      originalAuthors: string[]
      authors: string[]
    })
  | (EditCommonFields & {
      kind: 'edit-body'
      bookId: string
      itemId: string
      originalTitle: string
      title: string
      originalAuthors: string[]
      authors: string[]
      originalTranslators: string[]
      translators: string[]
    })
  | (EditCommonFields & {
      kind: 'edit-material'
      materialId: string
      originalTitle: string
      title: string
      originalAuthors: string[]
      authors: string[]
      originalTranslators: string[]
      translators: string[]
      originalRole: BookManifestV3MaterialRole
      role: BookManifestV3MaterialRole
    })
  | (EditCommonFields & {
      kind: 'create-book'
      name: string
      authors: string[]
    })
  | (EditCommonFields & {
      kind: 'confirm-remove-item'
      bookId: string
      itemId: string
      label: string
    })
  | (EditCommonFields & {
      kind: 'confirm-remove-material'
      materialId: string
      label: string
    })
  | (EditCommonFields & {
      kind: 'confirm-remove-book'
      bookId: string
      label: string
    })

type FormDraft = Extract<
  BookManifestV3EditState,
  { kind: 'edit-book' | 'edit-body' | 'edit-material' | 'create-book' }
>

type ProjectBridge = NonNullable<typeof window.nyozeBridge>['project']

function getProjectBridge(): ProjectBridge | null {
  return window.nyozeBridge?.project ?? null
}

export function isBookManifestV3FormDraft(
  state: BookManifestV3EditState,
): state is FormDraft {
  return (
    state.kind === 'edit-book' ||
    state.kind === 'edit-body' ||
    state.kind === 'edit-material' ||
    state.kind === 'create-book'
  )
}

/** credit 配列を canonical 形（各要素 trim、空要素 drop）にする。比較と保存値導出に使う。 */
export function canonicalizeCredits(values: readonly string[]): string[] {
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed.length > 0) result.push(trimmed)
  }
  return result
}

function creditsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** credit 配列に空要素（trim 後 空）があるか。あれば保存不可。 */
export function hasEmptyCredit(values: readonly string[]): boolean {
  return values.some((value) => value.trim().length === 0)
}

/**
 * form draft が dirty か（保存すると何かが変わるか）。
 * - title / name は trim 比較。credits は canonical（trim + 空 drop）比較。
 * - 空 credit 行の追加だけ（保存対象でない変化）は dirty にしない。
 * - confirm-remove は dirty 扱いしない。
 */
export function isBookManifestV3FormDraftDirty(state: BookManifestV3EditState): boolean {
  switch (state.kind) {
    case 'edit-book':
      return (
        state.name.trim() !== state.originalName.trim() ||
        !creditsEqual(canonicalizeCredits(state.authors), state.originalAuthors)
      )
    case 'edit-body':
      return (
        state.title.trim() !== state.originalTitle.trim() ||
        !creditsEqual(canonicalizeCredits(state.authors), state.originalAuthors) ||
        !creditsEqual(canonicalizeCredits(state.translators), state.originalTranslators)
      )
    case 'edit-material':
      return (
        state.title.trim() !== state.originalTitle.trim() ||
        !creditsEqual(canonicalizeCredits(state.authors), state.originalAuthors) ||
        !creditsEqual(canonicalizeCredits(state.translators), state.originalTranslators) ||
        state.role !== state.originalRole
      )
    case 'create-book':
      return state.name.trim() !== '' || canonicalizeCredits(state.authors).length > 0
    default:
      return false
  }
}

/**
 * 現在の draft が保存可能か（title 必須・空 credit 要素なし・dirty）。
 * 件数 / 文字数の canonical 上限超過は main/writer 側を最終正本とし、ここでは reject 表示に留める。
 */
export function canSubmitBookManifestV3Draft(state: BookManifestV3EditState): boolean {
  if (!isBookManifestV3FormDraft(state)) return false
  if (state.busy) return false
  if (!isBookManifestV3FormDraftDirty(state)) return false
  switch (state.kind) {
    case 'edit-book':
    case 'create-book':
      return state.name.trim().length > 0 && !hasEmptyCredit(state.authors)
    case 'edit-body':
      return (
        state.title.trim().length > 0 &&
        !hasEmptyCredit(state.authors) &&
        !hasEmptyCredit(state.translators)
      )
    case 'edit-material':
      return (
        state.title.trim().length > 0 &&
        !hasEmptyCredit(state.authors) &&
        !hasEmptyCredit(state.translators)
      )
  }
}

/**
 * 現在の draft から v3 operation を組み立てる（pure）。idle / 非 submit は null。
 * credits は canonical（trim + 空 drop）にして渡す。1 operation で atomic に反映する。
 */
export function buildBookManifestV3Operation(
  state: BookManifestV3EditState,
): BookManifestV3UpdateOperation | null {
  switch (state.kind) {
    case 'edit-book':
      return {
        type: 'update-book',
        bookId: state.bookId,
        name: state.name.trim(),
        authors: canonicalizeCredits(state.authors),
      }
    case 'edit-body':
      return {
        type: 'update-body-item-metadata',
        bookId: state.bookId,
        itemId: state.itemId,
        title: state.title.trim(),
        authors: canonicalizeCredits(state.authors),
        translators: canonicalizeCredits(state.translators),
      }
    case 'edit-material':
      return {
        type: 'update-material',
        materialId: state.materialId,
        title: state.title.trim(),
        authors: canonicalizeCredits(state.authors),
        translators: canonicalizeCredits(state.translators),
        role: state.role,
      }
    case 'create-book':
      return {
        type: 'create-book',
        name: state.name.trim(),
        authors: canonicalizeCredits(state.authors),
      }
    case 'confirm-remove-item':
      return { type: 'remove-body-item', bookId: state.bookId, itemId: state.itemId }
    case 'confirm-remove-material':
      return { type: 'remove-material', materialId: state.materialId }
    case 'confirm-remove-book':
      return { type: 'remove-book', bookId: state.bookId }
    default:
      return null
  }
}

function mapSaveError(result: UpdateBookManifestV3Result): BookManifestV3EditError {
  if (result.ok) return 'save-failed'
  // 空でない Book の削除は writer が book-not-empty を detail に載せる（明示エラー表示）。
  if (result.detail === 'book-not-empty') return 'book-not-empty'
  switch (result.reason) {
    case 'invalid-manifest':
      return 'invalid-manifest'
    case 'read-error':
      return 'read-error'
    case 'write-error':
      return 'write-error'
    case 'invalid-input':
    case 'invalid-args':
      return 'invalid-input'
    case 'not-in-project':
      return 'not-in-project'
    case 'invalid-path':
      return 'invalid-path'
    default:
      return 'save-failed'
  }
}

export type MoveFeedbackError = {
  kind: 'item' | 'material'
  id: string
  error: BookManifestV3EditError
}

export type MoveFeedback = {
  busy: boolean
  error: MoveFeedbackError | null
}

/** 未登録ファイルからの登録（add-body-item / add-material）の行ローカル feedback。 */
export type RegisterFeedback = {
  busy: boolean
  path: string | null
  error: BookManifestV3EditError | null
}

/** 未登録ファイルを登録する先（任意 Book の本文、または role 付き material）。 */
export type RegisterTarget =
  | { kind: 'body'; bookId: string }
  | { kind: 'material'; role: BookManifestV3MaterialRole }

type UseBookManifestV3EditorOptions = {
  onSaved: () => void
}

export function useBookManifestV3Editor({ onSaved }: UseBookManifestV3EditorOptions) {
  const [editState, setEditState] = useState<BookManifestV3EditState>({ kind: 'idle' })
  const [moveFeedback, setMoveFeedback] = useState<MoveFeedback>({ busy: false, error: null })
  const [registerFeedback, setRegisterFeedback] = useState<RegisterFeedback>({
    busy: false,
    path: null,
    error: null,
  })
  const [leaveBlocked, setLeaveBlocked] = useState(false)
  const generationRef = useRef(0)
  const stateRef = useRef(editState)
  stateRef.current = editState
  const moveFeedbackRef = useRef(moveFeedback)
  moveFeedbackRef.current = moveFeedback
  const registerFeedbackRef = useRef(registerFeedback)
  registerFeedbackRef.current = registerFeedback
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  /**
   * 進行中の mutation（保存 / 移動 / 登録 / 登録解除）があるか。
   * busy 中に generation を進めると、main で書込済みでも generation mismatch で
   * onSaved / refresh が落ち、完了済み mutation の結果が画面に反映されない。
   */
  const isMutationInFlight = useCallback((): boolean => {
    const current = stateRef.current
    return (
      (current.kind !== 'idle' && current.busy) ||
      moveFeedbackRef.current.busy ||
      registerFeedbackRef.current.busy
    )
  }, [])

  const goIdle = useCallback(() => {
    generationRef.current += 1
    setLeaveBlocked(false)
    setMoveFeedback({ busy: false, error: null })
    setRegisterFeedback({ busy: false, path: null, error: null })
    setEditState({ kind: 'idle' })
  }, [])

  const reset = goIdle
  const cancelEdit = goIdle

  /** clean（form draft でない or 変化なし）なら idle へ戻す。dirty form / mutation 進行中は保持。 */
  const resetIfClean = useCallback((): boolean => {
    const current = stateRef.current
    // 進行中の mutation を generation で無効化しない（完了結果と refresh を落とさない）。
    if (isMutationInFlight()) return false
    if (isBookManifestV3FormDraft(current) && isBookManifestV3FormDraftDirty(current)) {
      return false
    }
    generationRef.current += 1
    setLeaveBlocked(false)
    setMoveFeedback({ busy: false, error: null })
    setRegisterFeedback({ busy: false, path: null, error: null })
    setEditState({ kind: 'idle' })
    return true
  }, [isMutationInFlight])

  const startDraft = useCallback((next: BookManifestV3EditState) => {
    generationRef.current += 1
    setLeaveBlocked(false)
    setMoveFeedback({ busy: false, error: null })
    setEditState(next)
  }, [])

  const beginEditBook = useCallback(
    (writeAnchor: ProjectPanelWriteAnchor, bookId: string, name: string, authors: string[]) => {
      startDraft({
        kind: 'edit-book',
        writeAnchor,
        bookId,
        originalName: name,
        name,
        originalAuthors: [...authors],
        authors: [...authors],
        busy: false,
        error: null,
      })
    },
    [startDraft],
  )

  const beginEditBodyItem = useCallback(
    (
      writeAnchor: ProjectPanelWriteAnchor,
      bookId: string,
      itemId: string,
      title: string,
      authors: string[],
      translators: string[],
    ) => {
      startDraft({
        kind: 'edit-body',
        writeAnchor,
        bookId,
        itemId,
        originalTitle: title,
        title,
        originalAuthors: [...authors],
        authors: [...authors],
        originalTranslators: [...translators],
        translators: [...translators],
        busy: false,
        error: null,
      })
    },
    [startDraft],
  )

  const beginEditMaterial = useCallback(
    (
      writeAnchor: ProjectPanelWriteAnchor,
      materialId: string,
      title: string,
      authors: string[],
      translators: string[],
      role: BookManifestV3MaterialRole,
    ) => {
      startDraft({
        kind: 'edit-material',
        writeAnchor,
        materialId,
        originalTitle: title,
        title,
        originalAuthors: [...authors],
        authors: [...authors],
        originalTranslators: [...translators],
        translators: [...translators],
        originalRole: role,
        role,
        busy: false,
        error: null,
      })
    },
    [startDraft],
  )

  const beginCreateBook = useCallback(
    (writeAnchor: ProjectPanelWriteAnchor) => {
      startDraft({
        kind: 'create-book',
        writeAnchor,
        name: '',
        authors: [],
        busy: false,
        error: null,
      })
    },
    [startDraft],
  )

  const requestRemoveItem = useCallback(
    (writeAnchor: ProjectPanelWriteAnchor, bookId: string, itemId: string, label: string) => {
      startDraft({
        kind: 'confirm-remove-item',
        writeAnchor,
        bookId,
        itemId,
        label,
        busy: false,
        error: null,
      })
    },
    [startDraft],
  )

  const requestRemoveMaterial = useCallback(
    (writeAnchor: ProjectPanelWriteAnchor, materialId: string, label: string) => {
      startDraft({
        kind: 'confirm-remove-material',
        writeAnchor,
        materialId,
        label,
        busy: false,
        error: null,
      })
    },
    [startDraft],
  )

  const requestRemoveBook = useCallback(
    (writeAnchor: ProjectPanelWriteAnchor, bookId: string, label: string) => {
      startDraft({
        kind: 'confirm-remove-book',
        writeAnchor,
        bookId,
        label,
        busy: false,
        error: null,
      })
    },
    [startDraft],
  )

  const setTitle = useCallback((text: string) => {
    setLeaveBlocked(false)
    setEditState((prev) =>
      prev.kind === 'edit-body' || prev.kind === 'edit-material'
        ? { ...prev, title: text, error: null }
        : prev,
    )
  }, [])

  const setName = useCallback((text: string) => {
    setLeaveBlocked(false)
    setEditState((prev) =>
      prev.kind === 'edit-book' || prev.kind === 'create-book'
        ? { ...prev, name: text, error: null }
        : prev,
    )
  }, [])

  const setRole = useCallback((role: BookManifestV3MaterialRole) => {
    setLeaveBlocked(false)
    setEditState((prev) =>
      prev.kind === 'edit-material' ? { ...prev, role, error: null } : prev,
    )
  }, [])

  const updateCredits = useCallback(
    (field: CreditField, recipe: (current: string[]) => string[]) => {
      setLeaveBlocked(false)
      setEditState((prev) => {
        switch (prev.kind) {
          case 'edit-book':
          case 'create-book':
            // Book / 作成 draft は translators を持たない。
            if (field !== 'authors') return prev
            return { ...prev, authors: recipe([...prev.authors]), error: null }
          case 'edit-body':
          case 'edit-material':
            return field === 'authors'
              ? { ...prev, authors: recipe([...prev.authors]), error: null }
              : { ...prev, translators: recipe([...prev.translators]), error: null }
          default:
            return prev
        }
      })
    },
    [],
  )

  const setCredit = useCallback(
    (field: CreditField, index: number, value: string) => {
      updateCredits(field, (current) => {
        if (index < 0 || index >= current.length) return current
        current[index] = value
        return current
      })
    },
    [updateCredits],
  )

  const addCredit = useCallback(
    (field: CreditField) => {
      updateCredits(field, (current) => {
        if (current.length >= BOOK_MANIFEST_V3_MAX_CREDITS) return current
        current.push('')
        return current
      })
    },
    [updateCredits],
  )

  const removeCredit = useCallback(
    (field: CreditField, index: number) => {
      updateCredits(field, (current) => {
        if (index < 0 || index >= current.length) return current
        current.splice(index, 1)
        return current
      })
    },
    [updateCredits],
  )

  const moveCredit = useCallback(
    (field: CreditField, index: number, direction: 'up' | 'down') => {
      updateCredits(field, (current) => {
        const target = direction === 'up' ? index - 1 : index + 1
        if (index < 0 || index >= current.length) return current
        if (target < 0 || target >= current.length) return current
        const tmp = current[index]
        current[index] = current[target]
        current[target] = tmp
        return current
      })
    },
    [updateCredits],
  )

  /** 現在の draft を保存 / 登録解除する。成功時のみ idle + onSaved。失敗時は draft 保持。 */
  const commit = useCallback(async () => {
    const current = stateRef.current
    if (current.kind === 'idle' || current.busy) return
    // form draft は submit 条件（title 必須 / 空 credit なし / dirty）を満たすときだけ送る。
    if (isBookManifestV3FormDraft(current) && !canSubmitBookManifestV3Draft(current)) {
      setEditState({ ...current, error: 'invalid-input' })
      return
    }

    const operation = buildBookManifestV3Operation(current)
    if (!operation) return

    const bridge = getProjectBridge()
    if (!bridge?.updateBookManifestV3) {
      setEditState({ ...current, error: 'save-failed' })
      return
    }

    const generation = generationRef.current
    setEditState({ ...current, busy: true, error: null })

    const result = await bridge
      .updateBookManifestV3(current.writeAnchor, operation)
      .catch((): UpdateBookManifestV3Result => ({ ok: false, reason: 'write-error' }))
    if (generation !== generationRef.current) return

    if (!result.ok) {
      setEditState({ ...current, busy: false, error: mapSaveError(result) })
      return
    }

    generationRef.current += 1
    setLeaveBlocked(false)
    setMoveFeedback({ busy: false, error: null })
    setEditState({ kind: 'idle' })
    onSavedRef.current()
  }, [])

  /**
   * manifest absent Project の初期化用。name を受け取り create-book を 1 回で実行する。
   * React setState の非同期を避けるため stateRef を同期更新してから commit する。
   */
  const submitCreateBook = useCallback(
    async (writeAnchor: ProjectPanelWriteAnchor, name: string) => {
      const trimmed = name.trim()
      generationRef.current += 1
      setLeaveBlocked(false)
      setMoveFeedback({ busy: false, error: null })

      const draft: Extract<BookManifestV3EditState, { kind: 'create-book' }> = {
        kind: 'create-book',
        writeAnchor,
        name: trimmed,
        authors: [],
        busy: false,
        error: null,
      }

      if (trimmed.length === 0) {
        setEditState({ ...draft, error: 'invalid-input' })
        return
      }

      stateRef.current = draft
      setEditState(draft)
      await commit()
    },
    [commit],
  )

  /**
   * 別操作の前に呼ぶ。dirty な form draft、または進行中の mutation（保存 / 移動 / 登録 /
   * 登録解除）があれば block（true を返し leaveBlocked を立てる）。
   * confirm-remove や clean な draft は idle に畳んで通す（false）。
   */
  const requestLeave = useCallback((): boolean => {
    const current = stateRef.current
    // 進行中の mutation がある間は、main 書込済みでも結果 / refresh を落とさないよう block する。
    if (isMutationInFlight()) {
      setLeaveBlocked(true)
      return true
    }
    if (current.kind === 'idle') return false
    if (isBookManifestV3FormDraft(current) && isBookManifestV3FormDraftDirty(current)) {
      setLeaveBlocked(true)
      return true
    }
    generationRef.current += 1
    setLeaveBlocked(false)
    setMoveFeedback({ busy: false, error: null })
    setRegisterFeedback({ busy: false, path: null, error: null })
    setEditState({ kind: 'idle' })
    return false
  }, [isMutationInFlight])

  const isDirty =
    isBookManifestV3FormDraft(editState) && isBookManifestV3FormDraftDirty(editState)
  const canSubmit = canSubmitBookManifestV3Draft(editState)

  const runMove = useCallback(
    async (
      writeAnchor: ProjectPanelWriteAnchor,
      operation: Extract<
        BookManifestV3UpdateOperation,
        { type: 'move-body-item' } | { type: 'move-material' }
      >,
      errorTarget: MoveFeedbackError,
    ) => {
      const current = stateRef.current
      if (current.kind !== 'idle' && current.busy) return

      const bridge = getProjectBridge()
      if (!bridge?.updateBookManifestV3) {
        setMoveFeedback({ busy: false, error: { ...errorTarget, error: 'save-failed' } })
        return
      }

      const generation = generationRef.current
      setMoveFeedback({ busy: true, error: null })

      const result = await bridge
        .updateBookManifestV3(writeAnchor, operation)
        .catch((): UpdateBookManifestV3Result => ({ ok: false, reason: 'write-error' }))
      if (generation !== generationRef.current) return

      if (!result.ok) {
        setMoveFeedback({ busy: false, error: { ...errorTarget, error: mapSaveError(result) } })
        return
      }

      setMoveFeedback({ busy: false, error: null })
      onSavedRef.current()
    },
    [],
  )

  const moveBodyItem = useCallback(
    (writeAnchor: ProjectPanelWriteAnchor, bookId: string, itemId: string, toIndex: number) =>
      runMove(
        writeAnchor,
        { type: 'move-body-item', bookId, itemId, toIndex },
        { kind: 'item', id: itemId, error: 'save-failed' },
      ),
    [runMove],
  )

  const moveMaterial = useCallback(
    (writeAnchor: ProjectPanelWriteAnchor, materialId: string, toIndex: number) =>
      runMove(
        writeAnchor,
        { type: 'move-material', materialId, toIndex },
        { kind: 'material', id: materialId, error: 'save-failed' },
      ),
    [runMove],
  )

  const getMoveErrorFor = useCallback(
    (kind: 'item' | 'material', id: string): BookManifestV3EditError | null => {
      const { error } = moveFeedback
      if (!error || error.kind !== kind || error.id !== id) return null
      return error.error
    },
    [moveFeedback],
  )

  /**
   * 未登録ファイル（present file の relativePath）を add-body-item / add-material で登録する。
   *
   * - draft を開かず operation を直接実行する（path 手入力をなくすのがこのフローの目的）。
   * - renderer は path / bookId または path / role だけ送る。title / authors / translators は送らない。
   *   metadata 初期値は main 側の read 経路（frontmatter）で決める。
   * - 成功時のみ onSaved（refresh）。失敗時は行ローカルに error を残す（draft なし）。
   */
  const registerUnregisteredFile = useCallback(
    async (writeAnchor: ProjectPanelWriteAnchor, relativePath: string, target: RegisterTarget) => {
      const current = stateRef.current
      if (current.kind !== 'idle' && current.busy) return

      const operation: BookManifestV3UpdateOperation =
        target.kind === 'body'
          ? { type: 'add-body-item', bookId: target.bookId, path: relativePath }
          : { type: 'add-material', path: relativePath, role: target.role }

      const bridge = getProjectBridge()
      if (!bridge?.updateBookManifestV3) {
        setRegisterFeedback({ busy: false, path: relativePath, error: 'save-failed' })
        return
      }

      const generation = generationRef.current
      setRegisterFeedback({ busy: true, path: relativePath, error: null })

      const result = await bridge
        .updateBookManifestV3(writeAnchor, operation)
        .catch((): UpdateBookManifestV3Result => ({ ok: false, reason: 'write-error' }))
      if (generation !== generationRef.current) return

      if (!result.ok) {
        setRegisterFeedback({ busy: false, path: relativePath, error: mapSaveError(result) })
        return
      }

      setRegisterFeedback({ busy: false, path: null, error: null })
      onSavedRef.current()
    },
    [],
  )

  const getRegisterErrorFor = useCallback(
    (relativePath: string): BookManifestV3EditError | null => {
      const { error, path } = registerFeedback
      if (!error || path !== relativePath) return null
      return error
    },
    [registerFeedback],
  )

  return {
    editState,
    moveFeedback,
    registerFeedback,
    leaveBlocked,
    isDirty,
    canSubmit,
    beginEditBook,
    beginEditBodyItem,
    beginEditMaterial,
    beginCreateBook,
    submitCreateBook,
    requestRemoveItem,
    requestRemoveMaterial,
    requestRemoveBook,
    setTitle,
    setName,
    setRole,
    setCredit,
    addCredit,
    removeCredit,
    moveCredit,
    moveBodyItem,
    moveMaterial,
    getMoveErrorFor,
    registerUnregisteredFile,
    getRegisterErrorFor,
    commit,
    cancelEdit,
    requestLeave,
    reset,
    resetIfClean,
  }
}

export type BookManifestV3EditorApi = ReturnType<typeof useBookManifestV3Editor>
