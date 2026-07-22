import { useState } from 'react'
import {
  IconArrowDown,
  IconArrowUp,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react'
import type { createUiTextGetter, UiTextKey } from '../i18n/uiText'
import {
  MATERIALS_DISPLAY_ROLES,
  type ProjectAssetRole,
} from '../../project/projectBooksQuery'
import { BOOK_MANIFEST_V3_MAX_CREDITS } from '../../project/bookManifestV3'
import type { BookManifestV3MaterialRole } from '../../project/bookManifestV3'
import type {
  BookManifestV3EditError,
  BookManifestV3EditorApi,
  CreditField,
} from '../hooks/useBookManifestV3Editor'
import { ProjectPaneIconButton } from './ProjectPaneIconButton'
import { getProjectRoleIcon } from './projectRoleIconMap'

/**
 * Project タブ v3 Book / 本文 / 資料 metadata の編集 UI（presentational）。
 *
 * 設計の正本は `docs/book-manifest-v3-design-2026-06.md`（スライス7）。
 *
 * - 1 つの編集ボタンから、Book は十分幅の panel、本文 / 資料は行直下の full-width panel を開く。
 * - 編集項目: Book = name / authors、本文 = title / authors / translators、
 *   資料 = title / authors / translators / role。保存は 1 operation で atomic。
 * - credits（authors / translators）は文字列配列。追加 / 削除 / 並べ替え / 各要素編集ができる。
 *   空配列は許可、空要素は保存不可、最大32件。UI では切り詰めず、件数 / 文字数の最終検証は writer に委ねる。
 * - `label` の概念・文言・operation は持たない。状態は {@link useBookManifestV3Editor} が一元管理する。
 * - icon button + floating tooltip を使い、native title と二重表示しない。
 */

type TextGetter = ReturnType<typeof createUiTextGetter>

const V3_EDIT_ERROR_KEY: Record<BookManifestV3EditError, UiTextKey> = {
  'invalid-manifest': 'projectPanel.bookEditErrorInvalidManifest',
  'read-error': 'projectPanel.bookEditErrorReadError',
  'write-error': 'projectPanel.bookEditErrorWrite',
  'invalid-input': 'projectPanel.v3CreditInvalid',
  'book-not-empty': 'projectPanel.v3BookNotEmpty',
  'not-in-project': 'projectPanel.bookEditErrorNotInProject',
  'invalid-path': 'projectPanel.bookEditErrorInvalidPath',
  'save-failed': 'projectPanel.bookEditErrorSave',
}

const ASSET_ROLE_LABEL_KEY: Record<ProjectAssetRole, UiTextKey> = {
  synopsis: 'projectPanel.role.synopsis',
  character: 'projectPanel.role.character',
  setting: 'projectPanel.role.setting',
  material: 'projectPanel.role.material',
  unsorted: 'projectPanel.role.unsorted',
}

/**
 * container が組み立てて ProjectPane へ渡す v3 編集ハンドラ束。
 * begin* / requestRemove* は cross-editor の未保存ガードを container 側で挟むため callback 経由。
 * 入力・保存・キャンセルは editor api を直接使う。
 */
export type ProjectV3Editing = {
  editor: BookManifestV3EditorApi
  onBeginEditBook: (bookId: string, name: string, authors: string[]) => void
  onBeginEditItem: (
    bookId: string,
    itemId: string,
    title: string,
    authors: string[],
    translators: string[],
  ) => void
  onBeginEditMaterial: (
    materialId: string,
    title: string,
    authors: string[],
    translators: string[],
    role: BookManifestV3MaterialRole,
  ) => void
  onRequestRemoveItem: (bookId: string, itemId: string, label: string) => void
  onRequestRemoveMaterial: (materialId: string, label: string) => void
  onRequestRemoveBook: (bookId: string, bookName: string) => void
  onMoveBodyItem: (bookId: string, itemId: string, toIndex: number) => void
  onMoveMaterial: (materialId: string, toIndex: number) => void
  onBeginCreateBook: () => void
  /** 未登録ファイル（relativePath）を指定 Book の本文として登録する。 */
  onRegisterBodyItem: (relativePath: string, bookId: string) => void
  /** 未登録ファイル（relativePath）を role 付き material として登録する。 */
  onRegisterMaterial: (relativePath: string, role: BookManifestV3MaterialRole) => void
}

/**
 * books.json absent Project の初期化導線。
 * container が manifestSource === 'none' かつ manifestWarning なしのときだけ渡す。
 */
export type ProjectV3ManifestInit = {
  editor: BookManifestV3EditorApi
  enabled: boolean
  onSubmitCreateBook: (name: string) => void
}

/** 未登録ファイル行から登録できる Book（id + 表示名）。0 件なら Book 登録 control を無効化する。 */
export type V3RegisterBookOption = {
  bookId: string
  name: string
}

function V3EditError({ error, t }: { error: BookManifestV3EditError | null; t: TextGetter }) {
  if (!error) return null
  return <p className="project-pane-book-edit-error">{t(V3_EDIT_ERROR_KEY[error])}</p>
}

function V3FormActions({
  busy,
  saveDisabled,
  onSave,
  onCancel,
  t,
}: {
  busy: boolean
  saveDisabled: boolean
  onSave: () => void
  onCancel: () => void
  t: TextGetter
}) {
  return (
    <div className="project-pane-book-actions">
      <button
        type="button"
        className="project-pane-book-btn"
        onClick={onSave}
        disabled={busy || saveDisabled}
      >
        {busy ? t('projectPanel.editSaving') : t('projectPanel.save')}
      </button>
      <button
        type="button"
        className="project-pane-book-btn"
        onClick={onCancel}
        disabled={busy}
      >
        {t('projectPanel.cancel')}
      </button>
    </div>
  )
}

/**
 * credits（authors / translators）入力 UI。文字列配列を 1 件ずつ編集 / 追加 / 削除 / 並べ替えする。
 *
 * - 各行: テキスト input + 上へ / 下へ / 削除の icon button（floating tooltip）。
 * - 末尾に「追加」ボタン。最大件数に達したら追加を無効化する（切り詰めはしない）。
 * - 空配列は許可。空要素があると保存ボタンは無効（呼び出し側 saveDisabled）になる。
 */
function V3CreditsEditor({
  editor,
  field,
  values,
  busy,
  labelText,
  addLabel,
  t,
}: {
  editor: BookManifestV3EditorApi
  field: CreditField
  values: string[]
  busy: boolean
  labelText: string
  addLabel: string
  t: TextGetter
}) {
  const atMax = values.length >= BOOK_MANIFEST_V3_MAX_CREDITS
  return (
    <div className="project-pane-v3-credits">
      <span className="project-pane-book-field-label">{labelText}</span>
      {values.length === 0 ? null : (
        <ul className="project-pane-v3-credit-list">
          {values.map((value, index) => (
            <li key={index} className="project-pane-v3-credit-row">
              <input
                type="text"
                className="project-pane-book-input project-pane-v3-credit-input"
                value={value}
                onChange={(e) => editor.setCredit(field, index, e.target.value)}
                disabled={busy}
                aria-label={`${labelText} ${index + 1}`}
              />
              <div className="project-pane-v3-credit-actions">
                <ProjectPaneIconButton
                  icon={IconArrowUp}
                  label={t('projectPanel.v3CreditMoveUp')}
                  onClick={() => editor.moveCredit(field, index, 'up')}
                  disabled={busy || index <= 0}
                />
                <ProjectPaneIconButton
                  icon={IconArrowDown}
                  label={t('projectPanel.v3CreditMoveDown')}
                  onClick={() => editor.moveCredit(field, index, 'down')}
                  disabled={busy || index >= values.length - 1}
                />
                <ProjectPaneIconButton
                  icon={IconTrash}
                  label={t('projectPanel.v3CreditRemove')}
                  onClick={() => editor.removeCredit(field, index)}
                  disabled={busy}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="project-pane-v3-credit-add">
        <ProjectPaneIconButton
          icon={IconPlus}
          label={addLabel}
          onClick={() => editor.addCredit(field)}
          disabled={busy || atMax}
        />
        <span className="project-pane-v3-credit-add-text">{addLabel}</span>
      </div>
    </div>
  )
}

/** 登録解除の確認 UI。Markdown を消さない旨を明示し、実行はここでだけ可能にする。 */
function V3RemoveConfirm({
  editor,
  busy,
  error,
  confirmKey,
  confirmLabelKey = 'projectPanel.bookUnregister',
  t,
}: {
  editor: BookManifestV3EditorApi
  busy: boolean
  error: BookManifestV3EditError | null
  confirmKey: UiTextKey
  confirmLabelKey?: UiTextKey
  t: TextGetter
}) {
  return (
    <div className="project-pane-book-remove-confirm">
      <p className="project-pane-book-remove-message">{t(confirmKey, 'helper')}</p>
      <div className="project-pane-book-actions">
        <button
          type="button"
          className="project-pane-book-btn project-pane-book-btn-danger"
          onClick={() => void editor.commit()}
          disabled={busy}
        >
          {t(confirmLabelKey)}
        </button>
        <button
          type="button"
          className="project-pane-book-btn"
          onClick={() => editor.cancelEdit()}
          disabled={busy}
        >
          {t('projectPanel.cancel')}
        </button>
      </div>
      <V3EditError error={error} t={t} />
    </div>
  )
}

/** Book header: 編集中なら name + authors panel、登録解除確認、そうでなければ編集 / 登録解除トリガ。 */
export function V3BookHeaderControls({
  v3,
  bookId,
  bookName,
  authors,
  t,
}: {
  v3: ProjectV3Editing
  bookId: string
  bookName: string
  authors: string[]
  t: TextGetter
}) {
  const { editor } = v3
  const editing =
    editor.editState.kind === 'edit-book' && editor.editState.bookId === bookId
      ? editor.editState
      : null
  const removing =
    editor.editState.kind === 'confirm-remove-book' && editor.editState.bookId === bookId
      ? editor.editState
      : null

  if (removing) {
    return (
      <V3RemoveConfirm
        editor={editor}
        busy={removing.busy}
        error={removing.error}
        confirmKey="projectPanel.bookUnregisterBookConfirm"
        confirmLabelKey="projectPanel.bookUnregisterBook"
        t={t}
      />
    )
  }

  if (editing) {
    return (
      <div className="project-pane-book-edit-form">
        <label className="project-pane-book-field">
          <span className="project-pane-book-field-label">{t('projectPanel.v3BookTitleLabel')}</span>
          <input
            type="text"
            className="project-pane-book-input"
            value={editing.name}
            onChange={(e) => editor.setName(e.target.value)}
            disabled={editing.busy}
            aria-label={t('projectPanel.v3BookTitleLabel')}
            autoFocus
          />
        </label>
        <V3CreditsEditor
          editor={editor}
          field="authors"
          values={editing.authors}
          busy={editing.busy}
          labelText={t('projectPanel.v3AuthorsLabel')}
          addLabel={t('projectPanel.v3AddAuthor')}
          t={t}
        />
        <V3FormActions
          busy={editing.busy}
          saveDisabled={!editor.canSubmit}
          onSave={() => void editor.commit()}
          onCancel={() => editor.cancelEdit()}
          t={t}
        />
        <V3EditError error={editing.error} t={t} />
        {editor.leaveBlocked ? (
          <p className="project-pane-book-edit-error">{t('projectPanel.bookEditLeaveBlocked')}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="project-pane-row-actions">
      <ProjectPaneIconButton
        icon={IconPencil}
        label={t('projectPanel.v3EditBookButton')}
        onClick={() => v3.onBeginEditBook(bookId, bookName, authors)}
        className="project-pane-icon-btn project-pane-book-edit-trigger"
      />
      <ProjectPaneIconButton
        icon={IconTrash}
        label={t('projectPanel.bookUnregisterBookHint', 'tooltip')}
        onClick={() => v3.onRequestRemoveBook(bookId, bookName)}
      />
    </div>
  )
}

/** title + authors + translators の編集 panel（本文 / 資料共通の中身）。 */
function V3MetadataFields({
  editor,
  title,
  authors,
  translators,
  busy,
  t,
}: {
  editor: BookManifestV3EditorApi
  title: string
  authors: string[]
  translators: string[]
  busy: boolean
  t: TextGetter
}) {
  return (
    <>
      <label className="project-pane-book-field">
        <span className="project-pane-book-field-label">{t('projectPanel.v3TitleLabel')}</span>
        <input
          type="text"
          className="project-pane-book-input"
          value={title}
          onChange={(e) => editor.setTitle(e.target.value)}
          disabled={busy}
          aria-label={t('projectPanel.v3TitleLabel')}
          autoFocus
        />
      </label>
      <V3CreditsEditor
        editor={editor}
        field="authors"
        values={authors}
        busy={busy}
        labelText={t('projectPanel.v3AuthorsLabel')}
        addLabel={t('projectPanel.v3AddAuthor')}
        t={t}
      />
      <V3CreditsEditor
        editor={editor}
        field="translators"
        values={translators}
        busy={busy}
        labelText={t('projectPanel.v3TranslatorsLabel')}
        addLabel={t('projectPanel.v3AddTranslator')}
        t={t}
      />
    </>
  )
}

/** body item / material 行の ↑↓ 並べ替えボタン。 */
function V3MoveButtons({
  editor,
  index,
  count,
  moveEnabled,
  filteredDisabledTitle,
  onMoveUp,
  onMoveDown,
  t,
}: {
  editor: BookManifestV3EditorApi
  index: number
  count: number
  moveEnabled: boolean
  filteredDisabledTitle?: string
  onMoveUp: () => void
  onMoveDown: () => void
  t: TextGetter
}) {
  const editBusy = editor.editState.kind !== 'idle' && editor.editState.busy
  const moveBusy = editor.moveFeedback.busy
  const disabled = !moveEnabled || editBusy || moveBusy
  const atTop = index <= 0
  const atBottom = index < 0 || index >= count - 1
  const upTitle =
    !moveEnabled && filteredDisabledTitle ? filteredDisabledTitle : t('projectPanel.bookMoveUp')
  const downTitle =
    !moveEnabled && filteredDisabledTitle ? filteredDisabledTitle : t('projectPanel.bookMoveDown')

  return (
    <>
      <ProjectPaneIconButton
        icon={IconArrowUp}
        label={upTitle}
        onClick={onMoveUp}
        disabled={disabled || atTop}
        className="project-pane-icon-btn"
      />
      <ProjectPaneIconButton
        icon={IconArrowDown}
        label={downTitle}
        onClick={onMoveDown}
        disabled={disabled || atBottom}
        className="project-pane-icon-btn"
      />
    </>
  )
}

/** body item 行の編集導線（並べ替え / metadata 編集 / 登録解除）。 */
export function V3ItemControls({
  v3,
  bookId,
  itemId,
  index,
  itemCount,
  title,
  authors,
  translators,
  missing = false,
  t,
}: {
  v3: ProjectV3Editing
  bookId: string
  itemId: string
  index: number
  itemCount: number
  title: string
  authors: string[]
  translators: string[]
  missing?: boolean
  t: TextGetter
}) {
  const { editor } = v3
  const editState = editor.editState
  const moveError = editor.getMoveErrorFor('item', itemId)

  if (editState.kind === 'edit-body' && editState.itemId === itemId) {
    return (
      <div className="project-pane-book-label-edit project-pane-book-material-edit">
        <V3MetadataFields
          editor={editor}
          title={editState.title}
          authors={editState.authors}
          translators={editState.translators}
          busy={editState.busy}
          t={t}
        />
        <V3FormActions
          busy={editState.busy}
          saveDisabled={!editor.canSubmit}
          onSave={() => void editor.commit()}
          onCancel={() => editor.cancelEdit()}
          t={t}
        />
        {editState.title.trim().length === 0 ? (
          <p className="project-pane-book-edit-error">{t('projectPanel.v3TitleRequired')}</p>
        ) : null}
        <V3EditError error={editState.error} t={t} />
      </div>
    )
  }
  if (editState.kind === 'confirm-remove-item' && editState.itemId === itemId) {
    return (
      <V3RemoveConfirm
        editor={editor}
        busy={editState.busy}
        error={editState.error}
        confirmKey={
          missing
            ? 'projectPanel.bookUnregisterItemMissingConfirm'
            : 'projectPanel.bookUnregisterItemConfirm'
        }
        t={t}
      />
    )
  }
  return (
    <div className="project-pane-row-actions">
      <V3MoveButtons
        editor={editor}
        index={index}
        count={itemCount}
        moveEnabled
        onMoveUp={() => v3.onMoveBodyItem(bookId, itemId, index - 1)}
        onMoveDown={() => v3.onMoveBodyItem(bookId, itemId, index + 1)}
        t={t}
      />
      <ProjectPaneIconButton
        icon={IconPencil}
        label={t('projectPanel.v3EditItemButton')}
        onClick={() => v3.onBeginEditItem(bookId, itemId, title, authors, translators)}
      />
      <ProjectPaneIconButton
        icon={IconTrash}
        label={
          missing
            ? t('projectPanel.bookUnregisterItemMissingConfirm', 'helper')
            : t('projectPanel.bookUnregisterHint', 'tooltip')
        }
        onClick={() => v3.onRequestRemoveItem(bookId, itemId, title)}
      />
      <V3EditError error={moveError} t={t} />
    </div>
  )
}

/** material 行の編集導線（並べ替え / metadata + role 編集 / 登録解除）。 */
export function V3MaterialControls({
  v3,
  materialId,
  index,
  materialCount,
  moveEnabled,
  title,
  authors,
  translators,
  role,
  missing = false,
  t,
}: {
  v3: ProjectV3Editing
  materialId: string
  index: number
  materialCount: number
  moveEnabled: boolean
  title: string
  authors: string[]
  translators: string[]
  role: ProjectAssetRole
  missing?: boolean
  t: TextGetter
}) {
  const { editor } = v3
  const editState = editor.editState
  const moveError = editor.getMoveErrorFor('material', materialId)

  if (editState.kind === 'edit-material' && editState.materialId === materialId) {
    return (
      <div className="project-pane-book-label-edit project-pane-book-material-edit">
        <V3MetadataFields
          editor={editor}
          title={editState.title}
          authors={editState.authors}
          translators={editState.translators}
          busy={editState.busy}
          t={t}
        />
        <label className="project-pane-book-field">
          <span className="project-pane-book-field-label">{t('projectPanel.bookRoleLabel')}</span>
          <select
            className="project-pane-book-select"
            value={editState.role}
            onChange={(e) => editor.setRole(e.target.value as BookManifestV3MaterialRole)}
            disabled={editState.busy}
            aria-label={t('projectPanel.bookRoleLabel')}
          >
            {MATERIALS_DISPLAY_ROLES.map((option) => (
              <option key={option} value={option}>
                {t(ASSET_ROLE_LABEL_KEY[option])}
              </option>
            ))}
          </select>
        </label>
        <V3FormActions
          busy={editState.busy}
          saveDisabled={!editor.canSubmit}
          onSave={() => void editor.commit()}
          onCancel={() => editor.cancelEdit()}
          t={t}
        />
        {editState.title.trim().length === 0 ? (
          <p className="project-pane-book-edit-error">{t('projectPanel.v3TitleRequired')}</p>
        ) : null}
        <V3EditError error={editState.error} t={t} />
      </div>
    )
  }
  if (editState.kind === 'confirm-remove-material' && editState.materialId === materialId) {
    return (
      <V3RemoveConfirm
        editor={editor}
        busy={editState.busy}
        error={editState.error}
        confirmKey={
          missing
            ? 'projectPanel.bookUnregisterMaterialMissingConfirm'
            : 'projectPanel.bookUnregisterMaterialConfirm'
        }
        t={t}
      />
    )
  }
  return (
    <div className="project-pane-row-actions">
      <V3MoveButtons
        editor={editor}
        index={index}
        count={materialCount}
        moveEnabled={moveEnabled}
        filteredDisabledTitle={t('projectPanel.bookMoveFilteredDisabled')}
        onMoveUp={() => v3.onMoveMaterial(materialId, index - 1)}
        onMoveDown={() => v3.onMoveMaterial(materialId, index + 1)}
        t={t}
      />
      <ProjectPaneIconButton
        icon={IconPencil}
        label={t('projectPanel.v3EditMaterialButton')}
        onClick={() =>
          v3.onBeginEditMaterial(
            materialId,
            title,
            authors,
            translators,
            role as BookManifestV3MaterialRole,
          )
        }
      />
      <ProjectPaneIconButton
        icon={IconTrash}
        label={
          missing
            ? t('projectPanel.bookUnregisterMaterialMissingConfirm', 'helper')
            : t('projectPanel.bookUnregisterHint', 'tooltip')
        }
        onClick={() => v3.onRequestRemoveMaterial(materialId, title)}
      />
      <V3EditError error={moveError} t={t} />
    </div>
  )
}

/** Books セクション: Book 新規作成（name + authors）。 */
export function V3CreateBookControls({ v3, t }: { v3: ProjectV3Editing; t: TextGetter }) {
  const { editor } = v3
  const editing = editor.editState.kind === 'create-book' ? editor.editState : null

  if (editing) {
    return (
      <div className="project-pane-book-add-form">
        <label className="project-pane-book-field">
          <span className="project-pane-book-field-label">{t('projectPanel.v3BookTitleLabel')}</span>
          <input
            type="text"
            className="project-pane-book-input"
            value={editing.name}
            onChange={(e) => editor.setName(e.target.value)}
            disabled={editing.busy}
            aria-label={t('projectPanel.v3BookTitleLabel')}
            autoFocus
          />
        </label>
        <V3CreditsEditor
          editor={editor}
          field="authors"
          values={editing.authors}
          busy={editing.busy}
          labelText={t('projectPanel.v3AuthorsLabel')}
          addLabel={t('projectPanel.v3AddAuthor')}
          t={t}
        />
        <V3FormActions
          busy={editing.busy}
          saveDisabled={!editor.canSubmit}
          onSave={() => void editor.commit()}
          onCancel={() => editor.cancelEdit()}
          t={t}
        />
        {editing.name.trim().length === 0 ? (
          <p className="project-pane-book-edit-error">{t('projectPanel.v3TitleRequired')}</p>
        ) : null}
        <V3EditError error={editing.error} t={t} />
        {editor.leaveBlocked ? (
          <p className="project-pane-book-edit-error">{t('projectPanel.bookEditLeaveBlocked')}</p>
        ) : null}
      </div>
    )
  }

  if (editor.editState.kind !== 'idle') return null

  return (
    <div className="project-pane-book-section-actions">
      <button
        type="button"
        className="project-pane-book-trigger"
        onClick={() => v3.onBeginCreateBook()}
        title={t('projectPanel.bookAddBook')}
      >
        {t('projectPanel.bookAddBook')}
      </button>
    </div>
  )
}

/**
 * books.json absent Project の初期化フォーム（最初の Book を作成）。
 * manifestSource === 'none' かつ manifestWarning なしのときだけ ProjectPane から表示する。
 */
export function V3ManifestInitControls({
  init,
  t,
}: {
  init: ProjectV3ManifestInit
  t: TextGetter
}) {
  const { editor, enabled, onSubmitCreateBook } = init
  const [localName, setLocalName] = useState('')
  const editing = editor.editState.kind === 'create-book' ? editor.editState : null
  const name = editing ? editing.name : localName
  const busy = editing?.busy ?? false
  const error = editing?.error ?? null
  const saveDisabled = name.trim().length === 0

  const handleSubmit = () => {
    if (!enabled || busy || saveDisabled) return
    onSubmitCreateBook(name)
  }

  return (
    <div className="project-pane-book-init-panel">
      <h4 className="project-pane-book-init-heading">{t('projectPanel.bookManifestInitHeading')}</h4>
      <p className="project-pane-book-init-description">
        {t('projectPanel.bookManifestInitDescription')}
      </p>
      <p className="project-pane-book-init-helper">
        {t('projectPanel.bookManifestInitDescription', 'helper')}
      </p>
      <label className="project-pane-book-field">
        <span className="project-pane-book-field-label">
          {t('projectPanel.bookManifestInitBookNameLabel')}
        </span>
        <input
          type="text"
          className="project-pane-book-input"
          value={name}
          onChange={(e) => {
            const next = e.target.value
            if (editing) editor.setName(next)
            else setLocalName(next)
          }}
          disabled={!enabled || busy}
          aria-label={t('projectPanel.bookManifestInitBookNameLabel')}
          autoFocus={enabled}
        />
      </label>
      <div className="project-pane-book-actions">
        <button
          type="button"
          className="project-pane-book-btn"
          onClick={handleSubmit}
          disabled={!enabled || busy || saveDisabled}
        >
          {busy ? t('projectPanel.editSaving') : t('projectPanel.bookManifestInitSubmit')}
        </button>
      </div>
      <V3EditError error={error} t={t} />
      {editor.leaveBlocked ? (
        <p className="project-pane-book-edit-error">{t('projectPanel.bookEditLeaveBlocked')}</p>
      ) : null}
    </div>
  )
}

/** 未登録ファイルからの material 登録の初期 role。 */
const REGISTER_DEFAULT_ROLE: BookManifestV3MaterialRole = 'material'

/**
 * 未登録ファイル行の登録導線。path 手入力をなくし、一覧から選んで登録する。
 *
 * - 「Bookに追加」: 既存 Book を選び `add-body-item`。Book が 0 件なら disabled。
 * - 「資料にする」: role を選び `add-material`（初期 role は material）。
 * - renderer は path / bookId または path / role だけ送る。title / authors / translators は送らない。
 * - 実行中は全 control を無効化し、失敗時は行ローカルに error を出す（draft なし）。
 */
export function V3RegisterUnregisteredControls({
  v3,
  relativePath,
  books,
  t,
}: {
  v3: ProjectV3Editing
  relativePath: string
  books: V3RegisterBookOption[]
  t: TextGetter
}) {
  const { editor } = v3
  const [selectedBookId, setSelectedBookId] = useState('')
  const [role, setRole] = useState<BookManifestV3MaterialRole>(REGISTER_DEFAULT_ROLE)

  const noBooks = books.length === 0
  const effectiveBookId = books.some((book) => book.bookId === selectedBookId)
    ? selectedBookId
    : (books[0]?.bookId ?? '')

  const busy = editor.registerFeedback.busy
  const error = editor.getRegisterErrorFor(relativePath)
  const addToBookAria = noBooks
    ? t('projectPanel.unregisteredNoBooksHint', 'tooltip')
    : t('projectPanel.unregisteredAddToBook', 'tooltip')

  return (
    <div className="project-pane-unregistered-actions">
      <div className="project-pane-unregistered-action-group">
        <select
          className="project-pane-book-select"
          value={effectiveBookId}
          onChange={(e) => setSelectedBookId(e.target.value)}
          disabled={noBooks || busy}
          aria-label={addToBookAria}
          title={addToBookAria}
        >
          {noBooks ? (
            <option value="">{t('projectPanel.unregisteredNoBooksHint')}</option>
          ) : (
            books.map((book) => (
              <option key={book.bookId} value={book.bookId}>
                {book.name}
              </option>
            ))
          )}
        </select>
        <ProjectPaneIconButton
          icon={getProjectRoleIcon('body')}
          hoverIcon={IconPlus}
          label={addToBookAria}
          onClick={() => v3.onRegisterBodyItem(relativePath, effectiveBookId)}
          disabled={noBooks || busy || effectiveBookId === ''}
        />
      </div>
      <div className="project-pane-unregistered-action-group">
        <select
          className="project-pane-book-select"
          value={role}
          onChange={(e) => setRole(e.target.value as BookManifestV3MaterialRole)}
          disabled={busy}
          aria-label={t('projectPanel.bookRoleLabel')}
        >
          {MATERIALS_DISPLAY_ROLES.map((option) => (
            <option key={option} value={option}>
              {t(ASSET_ROLE_LABEL_KEY[option])}
            </option>
          ))}
        </select>
        <ProjectPaneIconButton
          icon={getProjectRoleIcon(role)}
          hoverIcon={IconPlus}
          label={t('projectPanel.unregisteredAddAsMaterial', 'tooltip')}
          onClick={() => v3.onRegisterMaterial(relativePath, role)}
          disabled={busy}
        />
      </div>
      <V3EditError error={error} t={t} />
    </div>
  )
}
