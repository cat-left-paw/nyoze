import { useCallback, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { IconFilter, IconFilterCheck, IconLayoutSidebar } from '@tabler/icons-react'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter, type UiTextKey } from '../i18n/uiText'
import type {
  ProjectPanelState,
  ProjectAssetPreviewState,
} from '../hooks/useProjectPanel'
import type {
  ProjectBookGroup,
  ProjectAssetGroup,
  ProjectAssetItem,
  ProjectAssetRole,
  MaterialsRoleFilterSet,
} from '../../project/projectBooksQuery'
import {
  flattenProjectAssets,
  filterMaterialsByRoles,
  MATERIALS_DISPLAY_ROLES,
} from '../../project/projectBooksQuery'
import type { ProjectAssetEditorApi } from '../hooks/useProjectAssetEditor'
import type { ProjectTitleEditorApi } from '../hooks/useProjectTitleEditor'
import type { ProjectCreateState } from '../hooks/useProjectCreate'
import type { ProjectUnregisterState } from '../hooks/useProjectUnregister'
import type { UnregisteredProjectFile } from '../../project/bookManifestV3UnregisteredFiles'
import { shouldClearPreviewOnProjectPaneBackgroundClick } from '../utils/projectPanePreviewClear'
import {
  computeDragPreviewRatio,
  nextLockedRatio,
} from '../utils/projectPanePreviewResize'
import { ProjectAssetEditor } from './ProjectAssetEditor'
import { ProjectCreateForm } from './ProjectCreateForm'
import { ProjectPaneHeader } from './ProjectPaneHeader'
import {
  V3BookHeaderControls,
  V3ItemControls,
  V3MaterialControls,
  V3CreateBookControls,
  V3ManifestInitControls,
  V3RegisterUnregisteredControls,
  type ProjectV3Editing,
  type ProjectV3ManifestInit,
  type V3RegisterBookOption,
} from './BookManifestV3Controls'
import { ProjectPaneIconButton } from './ProjectPaneIconButton'
import { PaneTablerIcon } from './PaneTablerIcon'
import { ProjectRoleIcon } from './projectRoleIcons'
import { getProjectRoleIcon } from './projectRoleIconMap'
import type { ProjectListUiState } from '../hooks/useProjectList'

/**
 * Slice B3-B5: 右ペイン Project タブのビュー。
 *
 * - 物理フォルダ階層は再現しない。主分類は Books / Materials の 2 つ。
 * - Books は `role: body` の章を book ごとに表示する（構造上の特別 role）。
 * - Materials は body 以外の既知 role（synopsis / character / setting / material /
 *   unsorted）を 1 リストへ flatten し、role はアイコン + filter chip として扱う。
 *   role 別の専用 UI / 専用編集挙動は持たせない。
 * - Books 章は通常クリック=同タブ / Shift+クリック=別タブ（container 経由で共有 navigator）。
 * - 資料「中央で開く」は別タブ open（現状維持）。
 * - 資料 preview は hook 側で safe HTML 化済み（raw HTML は実行しない）。
 * - 資料の右ペイン内編集 UI は ProjectAssetEditor へ分離する。
 */

type ProjectPaneProps = {
  state: ProjectPanelState
  preview: ProjectAssetPreviewState
  editor: ProjectAssetEditorApi
  uiLanguageMode: UiLanguageMode
  /** Slice B5: project 未所属時の「作品として設定」状態。 */
  createState: ProjectCreateState
  /** 作成対象（現在ファイルの親フォルダ）の表示名。対象が無ければ null。 */
  createTargetName: string | null
  /** 作成対象 folder を決められるか（false なら作成ボタンを無効化）。 */
  canCreateProject: boolean
  /** active-file context のときだけ true（title / unregister / Book edit）。 */
  projectMetadataWriteEnabled?: boolean
  /** active-file context のときだけ true（資料 in-pane edit）。 */
  assetEditEnabled?: boolean
  /**
   * 選択中の資料を簡易編集してよいか。write 可能 context かつ、選択資料が中央 active tab と
   * 別ファイルのときだけ true。中央表示中の資料は二重編集を避けるため false。
   */
  canEditSelectedAsset?: boolean
  /**
   * 編集中の資料が中央 active tab と同一ファイルになった状態。dirty draft を無言破棄しないため
   * 編集 UI は残すが、textarea を read-only 化して警告を出す。
   */
  assetEditCenterLocked?: boolean
  onRefresh: () => void
  /** Books 章クリック: openInNewTab=true（Shift）で別タブ、false で同タブ。 */
  onOpenBookChapter: (absolutePath: string, openInNewTab: boolean) => void
  /** 資料「中央で開く」（別タブ）。 */
  onOpenFile: (absolutePath: string) => void
  onSelectAsset: (absolutePath: string) => void
  /** 索引空白クリック等で preview 選択を解除する。guard は container 側。 */
  onClearAssetPreview: () => void
  onCreateProject: (projectTitle: string, initialBookName: string) => void
  titleEditor: ProjectTitleEditorApi
  onBeginTitleEdit: () => void
  onSaveProjectTitle: () => void
  onBeginAssetEdit: (absolutePath: string) => void
  onReturnAssetPreview: () => void
  /**
   * v3 manifest 編集束（Book / 本文 / 資料 metadata 編集 / 追加 / 並べ替え / 登録解除）。
   * manifestSource === 'v3' かつ書き込み可能 context のときだけ container が渡す。
   */
  v3Editing?: ProjectV3Editing
  /**
   * books.json absent Project の初期化導線（最初の Book を作成）。
   * manifestSource === 'none' かつ manifestWarning なしのときだけ container が渡す。
   */
  v3ManifestInit?: ProjectV3ManifestInit
  /** v3 未登録ファイル query が ready のとき true（0 件でも section を表示）。 */
  unregisteredSectionReady?: boolean
  /** v3 registry を正本にした未登録テキスト系ファイル（read-only 表示）。 */
  unregisteredFiles?: UnregisteredProjectFile[]
  /** Project 登録解除（ready 状態のみ）。 */
  unregisterState: ProjectUnregisterState
  onBeginUnregister: () => void
  onCancelUnregister: () => void
  onConfirmUnregister: () => void
  /** 作品切り替え一覧の state（read-only）。 */
  projectListState: ProjectListUiState
  /** 一覧を開く / 一覧 refresh 時に呼ぶ（listProjects 取得）。 */
  onLoadProjectList: () => void
  /** 一覧を閉じるときに呼ぶ（generation guard で stale を破棄）。 */
  onCloseProjectList: () => void
  /** 別 Project を選んだとき。dirty draft 等でブロックされたら false を返す。 */
  onSelectProject: (projectRoot: string) => boolean
}

const ASSET_ROLE_LABEL_KEY: Record<ProjectAssetRole, UiTextKey> = {
  synopsis: 'projectPanel.role.synopsis',
  character: 'projectPanel.role.character',
  setting: 'projectPanel.role.setting',
  material: 'projectPanel.role.material',
  unsorted: 'projectPanel.role.unsorted',
}

/**
 * 索引（上部）と preview（下部）の境界をドラッグで上下リサイズする。
 * preview 高さは body 高さに対する比率で保持し、ペイン幅変更にも追従させる。
 * ドラッグ前は `null`（CSS 既定の content ベース）。一度動かすと比率固定になる。
 *
 * Preview / Edit の切替で content 高さが変わってもセクション高を維持するため、
 * 切替直前に現在の section 実高さを比率へ変換して凍結する（{@link lockPreviewRatio}）。
 * 既に比率が確定している（divider 操作 / 直前の切替）ときは上書きしない。
 */
function useProjectPreviewResize() {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [previewRatio, setPreviewRatio] = useState<number | null>(null)

  const onDividerMouseDown = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    const body = bodyRef.current
    if (!body) return
    const previewEl = body.querySelector<HTMLElement>('.project-pane-preview-section')
    const startHeight = previewEl?.getBoundingClientRect().height ?? 0
    const startY = event.clientY

    const handleMove = (moveEvent: MouseEvent) => {
      const bodyHeight = bodyRef.current?.getBoundingClientRect().height ?? 0
      const ratio = computeDragPreviewRatio({
        startHeight,
        startY,
        clientY: moveEvent.clientY,
        bodyHeight,
      })
      if (ratio === null) return
      setPreviewRatio(ratio)
    }
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.classList.remove('is-resizing-project-preview')
    }
    document.body.classList.add('is-resizing-project-preview')
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [])

  // Preview / Edit を切り替える直前に呼ぶ。比率が未確定のときだけ、現在の section 実高さを
  // body 高さに対する比率へ変換して固定する。これで content 高さの違いがセクション高へ
  // 波及しなくなる。既に比率があれば（divider / 直前切替）維持し、上書きしない。
  const lockPreviewRatio = useCallback(() => {
    setPreviewRatio((prev) => {
      if (prev !== null) return prev
      const body = bodyRef.current
      if (!body) return prev
      const previewEl = body.querySelector<HTMLElement>('.project-pane-preview-section')
      const sectionHeight = previewEl?.getBoundingClientRect().height ?? 0
      const bodyHeight = body.getBoundingClientRect().height ?? 0
      return nextLockedRatio(prev, sectionHeight, bodyHeight) ?? prev
    })
  }, [])

  const previewStyle: CSSProperties | undefined =
    previewRatio === null
      ? undefined
      : { height: `${previewRatio * 100}%`, maxHeight: 'none' }

  return { bodyRef, previewStyle, onDividerMouseDown, lockPreviewRatio }
}

export function ProjectPane({
  state,
  preview,
  editor,
  uiLanguageMode,
  createState,
  createTargetName,
  canCreateProject,
  projectMetadataWriteEnabled = true,
  assetEditEnabled = true,
  canEditSelectedAsset = true,
  assetEditCenterLocked = false,
  onRefresh,
  onOpenBookChapter,
  onOpenFile,
  onSelectAsset,
  onClearAssetPreview,
  onCreateProject,
  titleEditor,
  onBeginTitleEdit,
  onSaveProjectTitle,
  onBeginAssetEdit,
  onReturnAssetPreview,
  v3Editing,
  v3ManifestInit,
  unregisteredSectionReady = false,
  unregisteredFiles = [],
  unregisterState,
  onBeginUnregister,
  onCancelUnregister,
  onConfirmUnregister,
  projectListState,
  onLoadProjectList,
  onCloseProjectList,
  onSelectProject,
}: ProjectPaneProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const { bodyRef, previewStyle, onDividerMouseDown, lockPreviewRatio } =
    useProjectPreviewResize()
  const refreshDisabled = state.kind === 'loading'

  // 作品切り替えパネルの開閉（表示専用 local state、永続化しない）。
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const handleToggleSwitcher = useCallback(() => {
    setSwitcherOpen((prev) => {
      const next = !prev
      if (next) onLoadProjectList()
      else onCloseProjectList()
      return next
    })
  }, [onLoadProjectList, onCloseProjectList])
  const handleSelectProject = useCallback(
    (projectRoot: string) => {
      if (onSelectProject(projectRoot)) {
        onCloseProjectList()
        setSwitcherOpen(false)
      }
    },
    [onSelectProject, onCloseProjectList],
  )

  const readyDisplayTitle =
    state.kind === 'ready'
      ? state.projectTitle.trim() || t('projectPanel.untitledProject')
      : null

  return (
    <div className="project-pane">
      {state.kind === 'ready' && readyDisplayTitle !== null ? (
        <ProjectPaneHeader
          variant="ready"
          t={t}
          displayTitle={readyDisplayTitle}
          currentProjectRoot={state.projectRoot}
          titleEditor={titleEditor}
          readOnly={!projectMetadataWriteEnabled}
          onBeginTitleEdit={onBeginTitleEdit}
          onSaveProjectTitle={onSaveProjectTitle}
          switcherOpen={switcherOpen}
          onToggleSwitcher={handleToggleSwitcher}
          projectListState={projectListState}
          onSelectProject={handleSelectProject}
          onLoadProjectList={onLoadProjectList}
          unregisterState={unregisterState}
          onBeginUnregister={onBeginUnregister}
          onCancelUnregister={onCancelUnregister}
          onConfirmUnregister={onConfirmUnregister}
          metadataWriteEnabled={projectMetadataWriteEnabled}
          onRefresh={onRefresh}
          refreshDisabled={refreshDisabled}
        />
      ) : (
        <ProjectPaneHeader
          variant="compact"
          t={t}
          onRefresh={onRefresh}
          refreshDisabled={refreshDisabled}
        />
      )}

      {state.kind === 'loading' ? (
        <p className="pane-placeholder">{t('projectPanel.loading')}</p>
      ) : state.kind === 'unavailable' ? (
        <p className="pane-placeholder">{t('projectPanel.unavailable')}</p>
      ) : state.kind === 'not-in-project' ? (
        <ProjectPaneNotInProject
          t={t}
          createState={createState}
          createTargetName={createTargetName}
          canCreateProject={canCreateProject}
          onCreateProject={onCreateProject}
        />
      ) : state.kind === 'error' ? (
        <p className="pane-placeholder">{t('projectPanel.error')}</p>
      ) : (
        <ProjectPaneReady
          state={state}
          preview={preview}
          editor={editor}
          t={t}
          bodyRef={bodyRef}
          previewStyle={previewStyle}
          onDividerMouseDown={onDividerMouseDown}
          lockPreviewRatio={lockPreviewRatio}
          onOpenBookChapter={onOpenBookChapter}
          onOpenFile={onOpenFile}
          onSelectAsset={onSelectAsset}
          onClearAssetPreview={onClearAssetPreview}
          assetEditEnabled={assetEditEnabled}
          canEditSelectedAsset={canEditSelectedAsset}
          assetEditCenterLocked={assetEditCenterLocked}
          onBeginAssetEdit={onBeginAssetEdit}
          onReturnAssetPreview={onReturnAssetPreview}
          v3Editing={v3Editing}
          v3ManifestInit={v3ManifestInit}
          unregisteredSectionReady={unregisteredSectionReady}
          unregisteredFiles={unregisteredFiles}
        />
      )}
    </div>
  )
}

type TextGetter = ReturnType<typeof createUiTextGetter>
type ReadyState = Extract<ProjectPanelState, { kind: 'ready' }>

/**
 * セクション / Book group 折りたたみ用の小さな chevron ボタン（表示専用）。
 *
 * - state は呼び出し側 component の local useState。永続化しない（books.json / settings 等に書かない）。
 * - 展開 / 折りたたみで chevron を回転（CSS）。`aria-expanded` と `aria-label` / tooltip を持つ。
 * - 編集 / 確認中など畳むと紛らわしい状況では `disabled` を渡す（呼び出し側が判断）。
 */
function FoldChevron({
  expanded,
  onToggle,
  t,
  disabled = false,
}: {
  expanded: boolean
  onToggle: () => void
  t: TextGetter
  disabled?: boolean
}) {
  const label = expanded ? t('projectPanel.collapseSection') : t('projectPanel.expandSection')
  return (
    <button
      type="button"
      className="project-pane-fold-toggle"
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      onClick={onToggle}
      disabled={disabled}
    >
      <span
        className={`project-pane-fold-chevron${expanded ? ' is-expanded' : ''}`}
        aria-hidden="true"
      >
        ▸
      </span>
    </button>
  )
}

/**
 * Slice B5: project 未所属状態の案内 + 「このフォルダを作品として設定」導線。
 *
 * 対象は現在ファイルの親フォルダで、UI 上に対象フォルダ名を明示する。作成自体は
 * ユーザーのボタン操作に限定し、main 側が workspace 境界と既存 project 上書きを防ぐ。
 */
function ProjectPaneNotInProject({
  t,
  createState,
  createTargetName,
  canCreateProject,
  onCreateProject,
}: {
  t: TextGetter
  createState: ProjectCreateState
  createTargetName: string | null
  canCreateProject: boolean
  onCreateProject: (projectTitle: string, initialBookName: string) => void
}) {
  return (
    <div className="project-pane-create">
      <p className="pane-placeholder">{t('projectPanel.notInProject')}</p>
      {canCreateProject && createTargetName !== null ? (
        <ProjectCreateForm
          // フォルダが変わったら入力（作品名 / Book 名）を初期値へ戻す。
          key={createTargetName}
          createTargetName={createTargetName}
          createState={createState}
          onCreateProject={onCreateProject}
          t={t}
        />
      ) : (
        <p className="project-pane-create-unavailable">
          {t('projectPanel.createNoTarget')}
        </p>
      )}
    </div>
  )
}

function ProjectPaneReady({
  state,
  preview,
  editor,
  t,
  bodyRef,
  previewStyle,
  onDividerMouseDown,
  lockPreviewRatio,
  onOpenBookChapter,
  onOpenFile,
  onSelectAsset,
  onClearAssetPreview,
  assetEditEnabled,
  canEditSelectedAsset,
  assetEditCenterLocked,
  onBeginAssetEdit,
  onReturnAssetPreview,
  v3Editing,
  v3ManifestInit,
  unregisteredSectionReady,
  unregisteredFiles,
}: {
  state: ReadyState
  preview: ProjectAssetPreviewState
  editor: ProjectAssetEditorApi
  t: TextGetter
  bodyRef: RefObject<HTMLDivElement>
  previewStyle: CSSProperties | undefined
  onDividerMouseDown: (event: ReactMouseEvent) => void
  lockPreviewRatio: () => void
  onOpenBookChapter: (absolutePath: string, openInNewTab: boolean) => void
  onOpenFile: (absolutePath: string) => void
  onSelectAsset: (absolutePath: string) => void
  onClearAssetPreview: () => void
  assetEditEnabled: boolean
  canEditSelectedAsset: boolean
  assetEditCenterLocked: boolean
  onBeginAssetEdit: (absolutePath: string) => void
  onReturnAssetPreview: () => void
  v3Editing?: ProjectV3Editing
  v3ManifestInit?: ProjectV3ManifestInit
  unregisteredSectionReady: boolean
  unregisteredFiles: UnregisteredProjectFile[]
}) {
  const anyBookCurrent = state.books.some((group) =>
    group.items.some((item) => item.isCurrent),
  )
  const anyMaterialCurrent = state.materialsFlat?.some((item) => item.isCurrent) ?? false
  const showCurrentBookMissing =
    state.currentRelativePath !== null &&
    state.books.length > 0 &&
    !anyBookCurrent &&
    !anyMaterialCurrent
  const totalAssets =
    state.materialsFlat?.length ??
    state.assets.reduce((sum, group) => sum + group.items.length, 0)
  const selectedPath = preview.kind === 'idle' ? null : preview.absolutePath
  const isEditing = assetEditEnabled && editor.editState.kind === 'editing'

  // Preview / Edit を切り替える直前にセクション高さを比率へ固定し、content 高さの違いで
  // 表示高さが変わらないようにする（比率が未確定のときだけ。divider 設定値は上書きしない）。
  const handleSwitchToPreview = useCallback(() => {
    lockPreviewRatio()
    onReturnAssetPreview()
  }, [lockPreviewRatio, onReturnAssetPreview])
  const handleSwitchToEdit = useCallback(() => {
    if (selectedPath === null) return
    lockPreviewRatio()
    onBeginAssetEdit(selectedPath)
  }, [lockPreviewRatio, onBeginAssetEdit, selectedPath])

  // Books セクションの折りたたみ（表示専用 local state、初期は展開）。
  const [booksExpanded, setBooksExpanded] = useState(true)
  // create-book / manifest init の入力中は畳むとフォームが隠れて紛らわしいので fold を無効化し、
  // 強制的に展開のまま見せる（editor state は破棄しない）。
  const booksFoldDisabled =
    v3Editing?.editor.editState.kind === 'create-book' ||
    v3ManifestInit?.editor.editState.kind === 'create-book'
  const booksContentVisible = booksExpanded || booksFoldDisabled
  const manifestUninitialized =
    state.manifestSource === 'none' && !state.manifestWarning
  const manifestBroken = state.manifestSource === 'none' && !!state.manifestWarning

  const handleIndexBackgroundMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      if (!shouldClearPreviewOnProjectPaneBackgroundClick(event.target)) return
      onClearAssetPreview()
    },
    [onClearAssetPreview],
  )

  return (
    <div className="project-pane-body" ref={bodyRef}>
      {/* 上部の索引（Book / 資料一覧）。長ければこの領域内でスクロールする。 */}
      <div className="project-pane-index" onMouseDown={handleIndexBackgroundMouseDown}>
        <section className="project-pane-section">
          <div className="project-pane-section-header">
            <FoldChevron
              expanded={booksContentVisible}
              onToggle={() => setBooksExpanded((prev) => !prev)}
              t={t}
              disabled={booksFoldDisabled}
            />
            <h3 className="project-pane-section-title">
              <ProjectRoleIcon role="books" />
              {t('projectPanel.books')}
            </h3>
            {v3Editing && !manifestUninitialized && v3Editing.editor.editState.kind === 'idle' ? (
              <V3CreateBookControls v3={v3Editing} t={t} />
            ) : null}
          </div>
          {booksContentVisible ? (
            <>
              {manifestBroken ? (
                <p className="project-pane-book-edit-error">
                  {t(
                    state.manifestWarning === 'read-error'
                      ? 'projectPanel.bookManifestBrokenReadError'
                      : 'projectPanel.bookManifestBrokenInvalid',
                  )}
                </p>
              ) : null}
              {v3ManifestInit ? <V3ManifestInitControls init={v3ManifestInit} t={t} /> : null}
              {v3Editing && v3Editing.editor.editState.kind === 'create-book' ? (
                <V3CreateBookControls v3={v3Editing} t={t} />
              ) : null}
              {!manifestUninitialized && !manifestBroken && state.books.length === 0 ? (
                <p className="project-pane-empty">{t('projectPanel.booksEmpty')}</p>
              ) : !manifestUninitialized && !manifestBroken ? (
                <>
                  {showCurrentBookMissing ? (
                    <p className="project-pane-hint">{t('projectPanel.currentBookMissing')}</p>
                  ) : null}
                  {state.books.map((group) => (
                    <BookGroupView
                      key={group.book}
                      group={group}
                      t={t}
                      onOpenBookChapter={onOpenBookChapter}
                      v3Editing={v3Editing}
                    />
                  ))}
                </>
              ) : null}
            </>
          ) : null}
        </section>

        <ProjectMaterialsSection
          assets={state.assets}
          materialsFlat={state.materialsFlat}
          totalAssets={totalAssets}
          t={t}
          selectedPath={selectedPath}
          onOpenFile={onOpenFile}
          onSelectAsset={onSelectAsset}
          v3Editing={v3Editing}
        />

        <ProjectUnregisteredFilesSection
          ready={unregisteredSectionReady}
          files={unregisteredFiles}
          books={state.books.map((group) => ({
            bookId: group.bookId,
            name: group.displayName,
          }))}
          t={t}
          v3Editing={v3Editing}
        />
      </div>

      {/* 索引と preview の境界。ドラッグで上下リサイズする。 */}
      <div
        className="project-pane-divider"
        role="separator"
        aria-orientation="horizontal"
        title={t('projectPanel.resize')}
        onMouseDown={onDividerMouseDown}
      />

      {/* 下部の preview / edit。索引とは独立に、この領域内だけでスクロールする。 */}
      <section
        className="project-pane-section project-pane-preview-section"
        style={previewStyle}
      >
        <div className="project-pane-preview-header">
          <h3 className="project-pane-section-title">{t('projectPanel.preview')}</h3>
          {selectedPath !== null && assetEditEnabled ? (
            <div className="project-pane-mode-toggle">
              <button
                type="button"
                className={`project-pane-mode-btn${!isEditing ? ' active' : ''}`}
                onClick={handleSwitchToPreview}
              >
                {t('projectPanel.modePreview')}
              </button>
              <button
                type="button"
                className={`project-pane-mode-btn${isEditing ? ' active' : ''}`}
                // 中央で開いている資料は二重編集を避けるため Edit を無効化する（Preview は維持）。
                // ただし既に編集中（中央表示へ移行した dirty draft）の状態では、現在モードを
                // 反映するためボタンは残す。
                disabled={!canEditSelectedAsset && !isEditing}
                title={
                  !canEditSelectedAsset
                    ? t('projectPanel.editDisabledOpenInCenter', 'tooltip')
                    : undefined
                }
                onClick={handleSwitchToEdit}
              >
                {t('projectPanel.modeEdit')}
              </button>
            </div>
          ) : null}
        </div>
        {isEditing ? (
          <ProjectAssetEditor editor={editor} t={t} centerLocked={assetEditCenterLocked} />
        ) : (
          <AssetPreviewView preview={preview} t={t} />
        )}
      </section>
    </div>
  )
}

/**
 * Book group header の補助 tooltip。
 * 表示名は `displayName`。manifest で正式 title / 別名が付いた場合だけ、
 * tooltip に正式 title と元の frontmatter `book` key を控えめに添える。
 */
function bookGroupTooltip(group: ProjectBookGroup): string | undefined {
  const lines: string[] = []
  if (group.title && group.title !== group.displayName) lines.push(group.title)
  if (group.book !== group.displayName) lines.push(`book: ${group.book}`)
  return lines.length > 0 ? lines.join('\n') : undefined
}

function BookGroupView({
  group,
  t,
  onOpenBookChapter,
  v3Editing,
}: {
  group: ProjectBookGroup
  t: TextGetter
  onOpenBookChapter: (absolutePath: string, openInNewTab: boolean) => void
  v3Editing?: ProjectV3Editing
}) {
  // この Book group を対象にした v3 編集 / 確認中か（Book 編集 / 本文編集 / 登録解除 / 章追加など）。
  const v3State = v3Editing?.editor.editState
  const v3TargetsThisBook = !!v3State && 'bookId' in v3State && v3State.bookId === group.bookId
  // 編集 / 確認中の Book group は畳むと紛らわしいので fold を無効化し、展開のまま見せる
  //（章 list を隠して editor state を失わせない）。
  const foldDisabled = v3TargetsThisBook
  // Book metadata 編集 / 登録解除 panel を開いているか。開いている間は header 行に押し込めず、
  // header 直下の full-width panel として描画する（狭幅で name/credits/actions を圧縮しない）。
  const bookPanelOpen =
    !!v3State &&
    (v3State.kind === 'edit-book' || v3State.kind === 'confirm-remove-book') &&
    v3State.bookId === group.bookId

  const [groupExpanded, setGroupExpanded] = useState(true)
  const groupContentVisible = groupExpanded || foldDisabled

  return (
    <div className="project-pane-book-group">
      <div className="project-pane-book-name-row">
        <FoldChevron
          expanded={groupContentVisible}
          onToggle={() => setGroupExpanded((prev) => !prev)}
          t={t}
          disabled={foldDisabled}
        />
        {/* 表示名は v3 Book name。 */}
        <div className="project-pane-book-name project-pane-row-text" title={bookGroupTooltip(group)}>
          {group.displayName}
        </div>
        {/* v3: 行内は編集トリガ（鉛筆 / 登録解除）だけ。編集中は下の full-width panel に移す。 */}
        {v3Editing && !bookPanelOpen ? (
          <V3BookHeaderControls
            v3={v3Editing}
            bookId={group.bookId}
            bookName={group.displayName}
            authors={group.authors}
            t={t}
          />
        ) : null}
      </div>
      {/* Book 編集 / 登録解除 panel は header 直下に full-width で開く（本文 / 資料行と同方針）。 */}
      {v3Editing && bookPanelOpen ? (
        <div className="project-pane-book-edit-panel">
          <V3BookHeaderControls
            v3={v3Editing}
            bookId={group.bookId}
            bookName={group.displayName}
            authors={group.authors}
            t={t}
          />
        </div>
      ) : null}
      {groupContentVisible ? (
        group.items.length === 0 ? (
          <p className="project-pane-section-empty">{t('projectPanel.bookBodyEmpty')}</p>
        ) : (
          <ul className="project-pane-item-list">
            {group.items.map((item, index) => {
              // この本文 item で metadata 編集 / 登録解除 panel を開いているか（開いている間だけ full-width 化）。
              const itemEditState = v3Editing?.editor.editState
              const isRowEditing =
                !!itemEditState &&
                !!item.registryId &&
                ((itemEditState.kind === 'edit-body' &&
                  itemEditState.itemId === item.registryId) ||
                  (itemEditState.kind === 'confirm-remove-item' &&
                    itemEditState.itemId === item.registryId))
              return (
              <li
                key={item.relativePath}
                className={`project-pane-item${isRowEditing ? ' is-editing' : ''}${
                  item.missing ? ' is-missing' : ''
                }`}
              >
                {/* 本文 item の role icon（表示専用）。Materials 行と先頭 icon の位置を揃える。 */}
                <ProjectRoleIcon role="body" />
                <button
                  type="button"
                  className={`project-pane-item-open${item.isCurrent ? ' is-current' : ''}`}
                  disabled={item.missing}
                  onClick={(e) => {
                    if (item.missing) return
                    if (item.isCurrent && !e.shiftKey) return
                    onOpenBookChapter(item.absolutePath, e.shiftKey)
                  }}
                  title={
                    item.missing
                      ? missingRegistryAffordance(
                          item.relativePath,
                          t('projectPanel.missingBodyItemHint', 'tooltip'),
                        )
                      : item.relativePath
                  }
                  aria-label={
                    item.missing
                      ? missingRegistryAffordance(
                          item.relativePath,
                          t('projectPanel.missingBodyItemHint', 'tooltip'),
                        )
                      : item.title
                  }
                >
                  <span className="project-pane-row-text">{item.title}</span>
                  {item.missing ? (
                    <RegistryMissingBadge
                      t={t}
                      relativePath={item.relativePath}
                      hintKey="projectPanel.missingBodyItemHint"
                    />
                  ) : null}
                </button>
                {/* v3: 章 metadata 編集 / 登録解除。章クリック open は壊さない（別ボタン）。 */}
                {v3Editing && item.registryId ? (
                  <V3ItemControls
                    v3={v3Editing}
                    bookId={group.bookId}
                    itemId={item.registryId}
                    index={index}
                    itemCount={group.items.length}
                    title={item.title}
                    authors={item.authors ?? []}
                    translators={item.translators ?? []}
                    missing={item.missing}
                    t={t}
                  />
                ) : null}
              </li>
              )
            })}
          </ul>
        )
      ) : null}
    </div>
  )
}

/**
 * Materials セクション。role 別セクションを廃し、1 リスト + filter chip へ整理する。
 *
 * - filter state はこのコンポーネント内に閉じる（保存 / project.json / localStorage 非永続）。
 * - role は item 先頭のアイコン + filter chip としてのみ扱い、専用 UI を持たせない。
 * - 既存の select(preview 切替) / 「中央で開く」/ isCurrent / isSelected を維持する。
 */
function ProjectMaterialsSection({
  assets,
  materialsFlat,
  totalAssets,
  t,
  selectedPath,
  onOpenFile,
  onSelectAsset,
  v3Editing,
}: {
  assets: ProjectAssetGroup[]
  materialsFlat?: ProjectAssetItem[]
  totalAssets: number
  t: TextGetter
  selectedPath: string | null
  onOpenFile: (absolutePath: string) => void
  onSelectAsset: (absolutePath: string) => void
  v3Editing?: ProjectV3Editing
}) {
  // role ごとの multi-toggle。初期は全 role ON。「全て」は全選択状態のトグル。
  const [activeRoles, setActiveRoles] = useState<MaterialsRoleFilterSet>(
    () => new Set(MATERIALS_DISPLAY_ROLES),
  )
  const toggleRole = useCallback((role: ProjectAssetRole) => {
    setActiveRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }, [])

  // materialsFlat（registry 順）でも assets（表示順 flatten）でも、
  // flatten 後に activeRoles で filter する。
  const items = useMemo(() => {
    const flat =
      materialsFlat !== undefined ? materialsFlat : flattenProjectAssets(assets)
    return filterMaterialsByRoles(flat, activeRoles)
  }, [assets, materialsFlat, activeRoles])

  // 全 role ON のときだけ move 可（一部 OFF だと表示順が registry 全体順と一致しないため）。
  const allRolesActive = activeRoles.size === MATERIALS_DISPLAY_ROLES.length
  const toggleAllRoles = useCallback(() => {
    setActiveRoles((prev) =>
      prev.size === MATERIALS_DISPLAY_ROLES.length
        ? new Set()
        : new Set(MATERIALS_DISPLAY_ROLES),
    )
  }, [])

  // Materials セクションの折りたたみ（表示専用 local state、初期は展開）。
  const [materialsExpanded, setMaterialsExpanded] = useState(true)
  // 資料 metadata 編集 / 登録解除確認中は畳むと紛らわしいので fold 無効化し、展開のまま見せる。
  const matState = v3Editing?.editor.editState
  const materialsFoldDisabled =
    !!matState &&
    (matState.kind === 'edit-material' || matState.kind === 'confirm-remove-material')
  const materialsContentVisible = materialsExpanded || materialsFoldDisabled

  return (
    <section className="project-pane-section">
      <div className="project-pane-section-header">
        <FoldChevron
          expanded={materialsContentVisible}
          onToggle={() => setMaterialsExpanded((prev) => !prev)}
          t={t}
          disabled={materialsFoldDisabled}
        />
        <h3 className="project-pane-section-title">{t('projectPanel.materialsHeading')}</h3>
      </div>
      {!materialsContentVisible ? null : totalAssets === 0 ? (
        <p className="project-pane-empty">{t('projectPanel.materialsEmpty')}</p>
      ) : (
        <>
          <div
            className="project-pane-materials-filter"
            role="group"
            aria-label={t('projectPanel.materialsFilterLabel')}
          >
            <span className="project-pane-materials-filter-label">
              <PaneTablerIcon
                icon={IconFilter}
                size="sm"
                stroke={1.6}
                className="project-pane-materials-filter-label-icon"
              />
              <span className="project-pane-materials-filter-label-text">
                {t('projectPanel.materialsFilterLabel')}
              </span>
            </span>
            <div className="project-pane-materials-filter-buttons">
              <ProjectPaneIconButton
                icon={IconFilterCheck}
                label={t('projectPanel.filterAll')}
                className="project-pane-icon-btn project-pane-filter-btn"
                ariaPressed={allRolesActive}
                active={allRolesActive}
                onClick={toggleAllRoles}
              />
              {MATERIALS_DISPLAY_ROLES.map((role) => {
                const isActive = activeRoles.has(role)
                return (
                  <ProjectPaneIconButton
                    key={role}
                    icon={getProjectRoleIcon(role)}
                    label={t(ASSET_ROLE_LABEL_KEY[role])}
                    className="project-pane-icon-btn project-pane-filter-btn"
                    ariaPressed={isActive}
                    active={isActive}
                    onClick={() => toggleRole(role)}
                  />
                )
              })}
            </div>
          </div>
          {items.length === 0 ? (
            <p className="project-pane-section-empty">
              {t('projectPanel.materialsFilterEmpty')}
            </p>
          ) : (
            <ul className="project-pane-item-list project-pane-materials-list">
              {items.map((item) => (
                <MaterialsItemView
                  key={item.relativePath}
                  item={item}
                  t={t}
                  isSelected={selectedPath === item.absolutePath}
                  onOpenFile={onOpenFile}
                  onSelectAsset={onSelectAsset}
                  v3Editing={v3Editing}
                  materialsFlat={materialsFlat}
                  materialsMoveEnabled={allRolesActive}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function missingRegistryAffordance(relativePath: string, hint: string): string {
  return `${relativePath} — ${hint}`
}

function RegistryMissingBadge({
  t,
  relativePath,
  hintKey,
}: {
  t: TextGetter
  relativePath: string
  hintKey: 'projectPanel.missingBodyItemHint' | 'projectPanel.missingMaterialHint'
}) {
  const affordance = missingRegistryAffordance(relativePath, t(hintKey, 'tooltip'))
  return (
    <span className="registry-missing-badge" title={affordance} aria-label={affordance}>
      {t('registry.fileNotFound')}
    </span>
  )
}

function unregisteredExtensionChipLabel(
  extension: UnregisteredProjectFile['extension'],
): string {
  if (extension === '.markdown') return 'markdown'
  if (extension === '.md') return 'md'
  return 'txt'
}

/**
 * v3 registry 未登録テキスト系ファイル。query ready のとき Materials 下に表示する（0 件でも empty state）。
 *
 * ファイル名 / path / 拡張子チップ自体はクリック導線を持たない（open はしない）。
 * v3 編集が有効なときだけ、各行に登録導線（Bookに追加 / 資料にする）を添える。
 * これが Book 本文 / Material 登録の正本導線で、path 手入力の追加フォームは通常 UI に出さない。
 */
function ProjectUnregisteredFilesSection({
  ready,
  files,
  books,
  t,
  v3Editing,
}: {
  /** 未登録ファイル query が ready のときだけ section を出す。 */
  ready: boolean
  files: UnregisteredProjectFile[]
  books: V3RegisterBookOption[]
  t: TextGetter
  v3Editing?: ProjectV3Editing
}) {
  // 折りたたみ state は早期 return より前で宣言する（hooks 順序を固定）。
  const [expanded, setExpanded] = useState(true)
  if (!ready) return null

  return (
    <section className="project-pane-section">
      <div className="project-pane-section-header">
        <FoldChevron expanded={expanded} onToggle={() => setExpanded((prev) => !prev)} t={t} />
        <h3
          className="project-pane-section-title"
          title={t('projectPanel.unregisteredHeading', 'tooltip')}
        >
          {t('projectPanel.unregisteredHeading')}
        </h3>
      </div>
      {expanded ? (
        files.length === 0 ? (
          <p className="project-pane-section-empty">{t('projectPanel.unregisteredEmpty', 'helper')}</p>
        ) : (
          <>
            <p className="project-pane-unregistered-section-hint">
              {t('projectPanel.unregisteredSectionHint', 'helper')}
            </p>
            <ul className="project-pane-unregistered-list">
              {files.map((file) => (
                <li key={file.relativePath} className="project-pane-unregistered-item">
                  <div className="project-pane-unregistered-main">
                    <span className="project-pane-unregistered-name project-pane-row-text" title={file.relativePath}>
                      {file.displayName}
                    </span>
                    <span
                      className="project-pane-unregistered-path project-pane-row-text"
                      title={file.relativePath}
                    >
                      {file.relativePath}
                    </span>
                    <span className="project-pane-extension-chip">
                      {unregisteredExtensionChipLabel(file.extension)}
                    </span>
                  </div>
                  {v3Editing ? (
                    <V3RegisterUnregisteredControls
                      v3={v3Editing}
                      relativePath={file.relativePath}
                      books={books}
                      t={t}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </section>
  )
}

function MaterialsItemView({
  item,
  t,
  isSelected,
  onOpenFile,
  onSelectAsset,
  v3Editing,
  materialsFlat,
  materialsMoveEnabled,
}: {
  item: ProjectAssetItem
  t: TextGetter
  isSelected: boolean
  onOpenFile: (absolutePath: string) => void
  onSelectAsset: (absolutePath: string) => void
  v3Editing?: ProjectV3Editing
  materialsFlat?: ProjectAssetItem[]
  /** 全 role が ON のときだけ material 並べ替えを有効にする（registry 全体順と一致するため）。 */
  materialsMoveEnabled: boolean
}) {
  const registryIndex =
    item.registryId && materialsFlat
      ? materialsFlat.findIndex((m) => m.registryId === item.registryId)
      : -1
  const materialCount = materialsFlat?.length ?? 0

  // この行で v3 編集 / 登録解除 panel を開いているか（開いている間だけ行を full-width 化する）。
  const matState = v3Editing?.editor.editState
  const isRowEditing =
    !!matState &&
    !!item.registryId &&
    ((matState.kind === 'edit-material' && matState.materialId === item.registryId) ||
      (matState.kind === 'confirm-remove-material' && matState.materialId === item.registryId))

  return (
    <li
      className={`project-pane-item project-pane-material-item${
        isRowEditing ? ' is-editing' : ''
      }${item.missing ? ' is-missing' : ''}`}
    >
      <ProjectRoleIcon role={item.role} />
      <button
        type="button"
        className={`project-pane-item-select${isSelected ? ' is-selected' : ''}${item.isCurrent ? ' is-current' : ''}`}
        disabled={item.missing}
        onClick={() => {
          if (item.missing) return
          onSelectAsset(item.absolutePath)
        }}
        title={
          item.missing
            ? missingRegistryAffordance(
                item.relativePath,
                t('projectPanel.missingMaterialHint', 'tooltip'),
              )
            : item.relativePath
        }
        aria-label={
          item.missing
            ? missingRegistryAffordance(
                item.relativePath,
                t('projectPanel.missingMaterialHint', 'tooltip'),
              )
            : item.title
        }
      >
        <span className="project-pane-row-text">{item.title}</span>
        {item.missing ? (
          <RegistryMissingBadge
            t={t}
            relativePath={item.relativePath}
            hintKey="projectPanel.missingMaterialHint"
          />
        ) : null}
      </button>
      <ProjectPaneIconButton
        icon={IconLayoutSidebar}
        label={
          item.missing
            ? missingRegistryAffordance(
                item.relativePath,
                t('projectPanel.missingMaterialHint', 'tooltip'),
              )
            : t('projectPanel.openInCenter')
        }
        onClick={() => onOpenFile(item.absolutePath)}
        disabled={item.missing}
        className="project-pane-icon-btn project-pane-item-open-center"
      />
      {/* v3: 資料 metadata 編集 / 登録解除。preview/edit/中央で開く（上のボタン）は壊さない。 */}
      {v3Editing && item.registryId ? (
        <V3MaterialControls
          v3={v3Editing}
          materialId={item.registryId}
          index={registryIndex}
          materialCount={materialCount}
          moveEnabled={materialsMoveEnabled}
          title={item.title}
          authors={item.authors ?? []}
          translators={item.translators ?? []}
          role={item.role}
          missing={item.missing}
          t={t}
        />
      ) : null}
    </li>
  )
}

function AssetPreviewView({
  preview,
  t,
}: {
  preview: ProjectAssetPreviewState
  t: TextGetter
}) {
  if (preview.kind === 'idle') {
    return <p className="project-pane-empty">{t('projectPanel.previewEmpty')}</p>
  }
  if (preview.kind === 'loading') {
    return <p className="project-pane-empty">{t('projectPanel.previewLoading')}</p>
  }
  if (preview.kind === 'error') {
    return <p className="project-pane-empty">{t('projectPanel.previewError')}</p>
  }
  if (preview.html.trim().length === 0) {
    return <p className="project-pane-empty">{t('projectPanel.previewEmptyBody')}</p>
  }
  return (
    <div
      className="project-pane-preview note-markdown-preview"
      // hook 側で markdown-it html:false により safe HTML 化済み。raw HTML は実行しない。
      dangerouslySetInnerHTML={{ __html: preview.html }}
    />
  )
}
