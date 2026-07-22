import { useCallback, useEffect, useMemo } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import { getPathBaseName, isSamePath } from '../utils/path'
import { canEditProjectAssetInPane } from '../utils/projectAssetEditGate'
import { useProjectPanel } from '../hooks/useProjectPanel'
import { useBookManifestV3UnregisteredFiles } from '../hooks/useBookManifestV3UnregisteredFiles'
import { useProjectList } from '../hooks/useProjectList'
import { useProjectAssetEditor } from '../hooks/useProjectAssetEditor'
import { useProjectCreate } from '../hooks/useProjectCreate'
import { useProjectUnregister } from '../hooks/useProjectUnregister'
import { useProjectTitleEditor } from '../hooks/useProjectTitleEditor'
import { useBookManifestV3Editor } from '../hooks/useBookManifestV3Editor'
import { useChapterFileNavigator } from '../hooks/useChapterFileNavigator'
import { getSelectedAssetPreviewPath } from '../utils/projectPanePreviewClear'
import {
  isProjectPanelContextWriteCapable,
  makeActiveFileProjectPanelContext,
  projectPanelContextRefreshKey,
  projectPanelContextToWriteAnchor,
  projectPanelWriteAnchorRefreshKey,
  type ProjectPanelContext,
} from '../../project/projectPanelContext'
import type { ProjectPanelWriteAnchor } from '../../project/projectIpcTypes'
import { ProjectPane } from './ProjectPane'
import type { ProjectV3Editing, ProjectV3ManifestInit } from './BookManifestV3Controls'
import type { BookManifestV3MaterialRole } from '../../project/bookManifestV3'

/**
 * Slice B3: Project タブの wiring container。
 *
 * App.tsx を薄く保つため、Project パネルの state hook・preview・open flow を
 * ここへ閉じ込める。App からは active file / 内部 doc 判定と、既存の
 * tab open / IME flush / tab-limit コールバックだけを受け取る。
 *
 * Books 章クリックは {@link useChapterFileNavigator} を流用し、通常=同タブ /
 * Shift=別タブ。資料「中央で開く」は従来どおり別タブ open。
 * dirty / save-before-close / Source Mode / Paragraph Plain の既存境界を迂回しない。
 */
type OpenFileInTab = (
  filePath: string,
  title: string,
  content: string,
  savedStat: { mtimeMs: number; size: number } | null,
) => Promise<string | void>

type ProjectPaneContainerProps = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  uiLanguageMode: UiLanguageMode
  /** 通常クリック: 同じタブへ章を読み込む。 */
  loadIntoActiveTab: OpenFileInTab
  /** Shift+クリック: 別タブで章を開く。資料「中央で開く」もこの経路。 */
  openFileInTab: OpenFileInTab
  flushImeCompositionSideEffects: (reason: string) => void
  onTabLimit: () => void
  /** File Explorer など外部導線で project 作成成功したときに bump し、Project タブを refresh する。 */
  projectRefreshNonce?: number
  /** 登録解除成功後に Explorer の project badge を refresh する。 */
  onProjectUnregistered?: () => void
  /**
   * 作品切り替えで別 Project を選んだとき、File Explorer の表示フォルダをその projectRoot へ
   * 切り替える（read-only。中央エディタの tab / dirty には触れない）。
   */
  onRevealProjectInExplorer?: (projectRoot: string) => void
  /**
   * Project タブの表示文脈（explorer / switcher / active file の合成結果）。
   * 未指定時は active file から内部生成する。
   */
  projectPanelContext?: ProjectPanelContext
  /**
   * 作品切り替えで明示選択した project root を App 側 state へ渡す（次スライス用）。
   * projectRoot は resolve/write IPC へ送らない。
   */
  onProjectSwitcherContextChange?: (projectRoot: string) => void
  /**
   * v3 Book / 本文 / 資料 metadata の保存・追加・並べ替え・登録解除が成功したときに呼ぶ。
   * App 側で projectRefreshNonce を bump し、左ペイン文書 metadata / Outline / Chapter Neighbors を
   * 既存 nonce 経路で再取得させる（books.json だけが変わり、Markdown/frontmatter は不変）。
   */
  onProjectBooksChanged?: () => void
}

export function ProjectPaneContainer({
  getActiveFilePath,
  isInternalDoc,
  uiLanguageMode,
  loadIntoActiveTab,
  openFileInTab,
  flushImeCompositionSideEffects,
  onTabLimit,
  projectRefreshNonce = 0,
  onProjectUnregistered,
  onRevealProjectInExplorer,
  projectPanelContext,
  onProjectSwitcherContextChange,
  onProjectBooksChanged,
}: ProjectPaneContainerProps) {
  const activeFilePath = getActiveFilePath()
  const resolvedContext =
    projectPanelContext ??
    makeActiveFileProjectPanelContext(activeFilePath, isInternalDoc())
  const contextRefreshKey = projectPanelContextRefreshKey(resolvedContext)
  const projectWriteAnchor = projectPanelContextToWriteAnchor(resolvedContext, activeFilePath)
  const projectWriteAnchorRefreshKey = projectPanelWriteAnchorRefreshKey(projectWriteAnchor)
  const assetEditEnabled = isProjectPanelContextWriteCapable(resolvedContext)
  const getResolvedContext = useCallback(() => resolvedContext, [resolvedContext])

  const { projectPanelState, projectAssetPreview, refreshProjectPanel, selectAssetPreview, clearAssetPreview } =
    useProjectPanel({
      getProjectPanelContext: getResolvedContext,
      getActiveFilePath,
      isInternalDoc,
    })

  const projectMetadataWriteEnabled =
    projectPanelState.kind === 'ready' && projectWriteAnchor !== null

  const queryAnchorFilePath =
    projectPanelState.kind === 'ready' ? (projectPanelState.queryAnchorFilePath ?? null) : null

  // v3 ready Project（manifestSource === 'v3'）かどうか。編集 UI / 未登録一覧の gate に使う。
  const v3ManifestUiEnabled = useMemo(() => {
    if (projectPanelState.kind !== 'ready') return false
    return projectPanelState.manifestSource === 'v3'
  }, [projectPanelState])

  const v3ManifestInitEnabled = useMemo(() => {
    if (projectPanelState.kind !== 'ready') return false
    return (
      projectPanelState.manifestSource === 'none' &&
      !projectPanelState.manifestWarning &&
      projectWriteAnchor !== null
    )
  }, [projectPanelState, projectWriteAnchor])

  // 未登録一覧は v3 ready / manifest absent（none かつ warning なし）の両方で表示する。
  // 破損 manifest（warning あり）では query しない。
  const unregisteredQueryEnabled = useMemo(() => {
    if (projectPanelState.kind !== 'ready') return false
    if (projectPanelState.manifestWarning) return false
    return (
      projectPanelState.manifestSource === 'v3' ||
      projectPanelState.manifestSource === 'none'
    )
  }, [projectPanelState])

  // v3 未登録 query / 編集の anchor。書き込み可能なら write anchor、read-only context では
  // queryAnchorFilePath（bounded file path）を使う。projectRoot は渡さない。
  const getUnregisteredAnchor = useCallback(() => {
    if (projectWriteAnchor !== null) return projectWriteAnchor
    if (queryAnchorFilePath) return queryAnchorFilePath
    return getActiveFilePath()
  }, [projectWriteAnchor, queryAnchorFilePath, getActiveFilePath])

  const { unregisteredFilesState, refreshUnregisteredFiles } = useBookManifestV3UnregisteredFiles({
    getAnchor: getUnregisteredAnchor,
    enabled:
      unregisteredQueryEnabled &&
      (projectWriteAnchor !== null || queryAnchorFilePath !== null || activeFilePath !== null),
  })

  // 作品切り替え一覧（read-only）。一覧は switcher を開いたときだけ取得し、Project タブの
  // title / books.json 更新後や登録解除後は、一覧表示中のときだけ refresh する（idle は no-op）。
  const {
    projectListState,
    load: loadProjectList,
    refresh: refreshProjectList,
    reset: resetProjectList,
  } = useProjectList()

  const refreshProjectAndUnregistered = useCallback(() => {
    void refreshProjectPanel()
    void refreshUnregisteredFiles()
    refreshProjectList()
  }, [refreshProjectPanel, refreshUnregisteredFiles, refreshProjectList])

  useEffect(() => {
    if (projectRefreshNonce < 1) return
    refreshProjectAndUnregistered()
  }, [projectRefreshNonce, refreshProjectAndUnregistered])

  // Slice B4: 資料の右ペイン内編集。preview とは別 hook で管理する。
  const editor = useProjectAssetEditor({
    onSaved: (absolutePath) => void selectAssetPreview(absolutePath),
  })
  const { requestLeave: requestAssetLeave, resetIfClean: resetAssetIfClean } = editor

  const titleEditor = useProjectTitleEditor({
    onSaved: () => refreshProjectAndUnregistered(),
  })
  const { requestLeave: requestTitleLeave, resetIfClean: resetTitleIfClean } = titleEditor

  // v3 manifest 編集（Book / 本文 / 資料 metadata 編集 / 追加 / 並べ替え / 登録解除）。
  // 保存成功で Project 再読み込み。登録解除は registry から外すだけで Markdown ファイルは削除しない。
  // 書き込むのは `.nyoze/books.json` だけ（hook / IPC が保証）。
  const v3Editor = useBookManifestV3Editor({
    onSaved: () => {
      // 保存後の refresh は単一経路にする。onProjectBooksChanged → App が projectRefreshNonce を bump
      // → container の projectRefreshNonce effect が refreshProjectAndUnregistered を 1 回だけ呼び、
      // 同時に左ペイン metadata / Outline / Chapter Neighbors も既存 nonce 経路で再取得される。
      // App が未配線（prop なし）のときだけ直接 refresh して取りこぼさない。
      if (onProjectBooksChanged) onProjectBooksChanged()
      else refreshProjectAndUnregistered()
    },
  })
  const { requestLeave: requestV3Leave, resetIfClean: resetV3IfClean } = v3Editor

  const requestPanelLeave = useCallback((): boolean => {
    return requestAssetLeave() || requestTitleLeave() || requestV3Leave()
  }, [requestAssetLeave, requestTitleLeave, requestV3Leave])

  // Slice B5: project 未所属時の「作品として設定」導線。read-only な useProjectPanel に
  // 作成状態を混ぜないよう、独立した hook で管理する。成功時は Project タブを再読み込みする。
  const { createState, createProjectForFolder, resetCreateState } = useProjectCreate({
    onCreated: () => refreshProjectAndUnregistered(),
  })

  const refreshProjectAndNotifyUnregistered = useCallback(() => {
    refreshProjectAndUnregistered()
    onProjectUnregistered?.()
  }, [refreshProjectAndUnregistered, onProjectUnregistered])

  const {
    unregisterState,
    beginUnregister,
    cancelUnregister,
    confirmUnregister,
    resetUnregisterState,
  } = useProjectUnregister({
    onUnregistered: refreshProjectAndNotifyUnregistered,
  })

  // 別資料を選ぶ / 同じ資料で解除する前に未保存編集をガードする（dirty ならブロックして notice 表示）。
  const handleSelectAsset = useCallback(
    (absolutePath: string) => {
      const currentPath = getSelectedAssetPreviewPath(projectAssetPreview)
      if (currentPath === absolutePath) {
        if (requestPanelLeave()) return
        clearAssetPreview()
        return
      }
      if (requestPanelLeave()) return
      void selectAssetPreview(absolutePath)
    },
    [requestPanelLeave, selectAssetPreview, clearAssetPreview, projectAssetPreview],
  )

  const handleClearAssetPreview = useCallback(() => {
    if (projectAssetPreview.kind === 'idle') return
    if (requestPanelLeave()) return
    clearAssetPreview()
  }, [requestPanelLeave, clearAssetPreview, projectAssetPreview])

  const handleRefresh = useCallback(() => {
    if (requestPanelLeave()) return
    refreshProjectAndUnregistered()
  }, [requestPanelLeave, refreshProjectAndUnregistered])

  // 別 Project を選んで File Explorer の表示フォルダを切り替える。
  // 中央エディタの tab / dirty には触れない（dirty guard 不要）。ただし Project タブ内の
  // 資料 / title / book の未保存 draft があれば、無言破棄しないよう requestPanelLeave で block する。
  const handleSelectProject = useCallback(
    (projectRoot: string): boolean => {
      if (requestPanelLeave()) return false
      onRevealProjectInExplorer?.(projectRoot)
      onProjectSwitcherContextChange?.(projectRoot)
      return true
    },
    [requestPanelLeave, onRevealProjectInExplorer, onProjectSwitcherContextChange],
  )

  // 中央の active file が切り替わったら編集状態を初期化する（別 project 文脈になるため）。
  // ただし未保存変更があるときは無言破棄しない（draft を保持する）。
  // 作成エラー表示も別ファイル文脈では持ち越さない。
  useEffect(() => {
    resetAssetIfClean()
    resetTitleIfClean()
    resetV3IfClean()
    resetCreateState()
    resetUnregisterState()
  }, [
    activeFilePath,
    contextRefreshKey,
    projectWriteAnchorRefreshKey,
    getActiveFilePath,
    resetAssetIfClean,
    resetTitleIfClean,
    resetV3IfClean,
    resetCreateState,
    resetUnregisterState,
  ])

  const createTargetFolder =
    projectPanelState.kind === 'not-in-project' ? projectPanelState.createTargetFolder : null
  const createTargetName =
    projectPanelState.kind === 'not-in-project' ? projectPanelState.createTargetName : null

  const handleCreateProject = useCallback(
    (projectTitle: string, initialBookName: string) => {
      if (!createTargetFolder) return
      // renderer は対象フォルダと作品名 / 最初の Book 名だけを渡す（解決済み root は送らない）。
      void createProjectForFolder(createTargetFolder, { projectTitle, initialBookName })
    },
    [createTargetFolder, createProjectForFolder],
  )

  const navigateToChapterFile = useChapterFileNavigator({
    loadIntoActiveTab,
    openFileInTab,
    flushImeCompositionSideEffects,
    onTabLimit,
    flushReason: 'project-books-open',
  })

  const handleOpenBookChapter = useCallback(
    async (absolutePath: string, openInNewTab: boolean) => {
      if (requestPanelLeave()) return
      void navigateToChapterFile(absolutePath, openInNewTab ? 'new-tab' : 'same-tab')
    },
    [requestPanelLeave, navigateToChapterFile],
  )

  const handleOpenFile = useCallback(
    async (absolutePath: string) => {
      if (requestPanelLeave()) return
      const openFile = window.nyozeBridge?.fs?.openFile
      if (!openFile) return
      flushImeCompositionSideEffects('project-open-file')
      const result = await openFile(absolutePath).catch(() => null)
      if (!result || !result.ok) return
      const stat = await window.nyozeBridge?.fs
        ?.getFileStat?.(absolutePath)
        .catch(() => null)
      const saved = stat ? { mtimeMs: stat.mtimeMs, size: stat.size } : null
      const opened = await openFileInTab(
        absolutePath,
        getPathBaseName(absolutePath),
        result.content,
        saved,
      )
      if (opened === 'tab-limit') onTabLimit()
    },
    [requestPanelLeave, flushImeCompositionSideEffects, openFileInTab, onTabLimit],
  )

  const handleBeginTitleEdit = useCallback(() => {
    if (requestAssetLeave() || requestV3Leave()) return
    if (projectPanelState.kind !== 'ready') return
    titleEditor.beginEdit(projectPanelState.projectTitle)
  }, [requestAssetLeave, requestV3Leave, projectPanelState, titleEditor])

  const handleSaveProjectTitle = useCallback(() => {
    void titleEditor.save(projectWriteAnchor)
  }, [titleEditor, projectWriteAnchor])

  const handleBeginUnregister = useCallback(() => {
    if (requestPanelLeave()) return
    beginUnregister()
  }, [requestPanelLeave, beginUnregister])

  const handleConfirmUnregister = useCallback(() => {
    void confirmUnregister(projectWriteAnchor)
  }, [confirmUnregister, projectWriteAnchor])

  const handleBeginAssetEdit = useCallback(
    (absolutePath: string) => {
      // 中央で開いている資料は二重編集を避けるため、右ペイン簡易編集を開始しない。
      if (isSamePath(absolutePath, activeFilePath)) return
      if (requestTitleLeave() || requestV3Leave()) return
      void editor.beginEdit(absolutePath)
    },
    [requestTitleLeave, requestV3Leave, editor, activeFilePath],
  )

  const v3ManifestWriteEnabled =
    projectPanelState.kind === 'ready' && v3ManifestUiEnabled && projectWriteAnchor !== null

  // v3 編集開始ハンドラ。他 editor（資料 / title / 別 v3 draft）の未保存変更があれば
  // 無言破棄せずブロックする。anchor は begin 時点の context write anchor に凍結する。
  const guardV3Begin = useCallback((): ProjectPanelWriteAnchor | null => {
    if (requestAssetLeave() || requestTitleLeave() || requestV3Leave()) {
      return null
    }
    return projectWriteAnchor
  }, [requestAssetLeave, requestTitleLeave, requestV3Leave, projectWriteAnchor])

  const v3Editing = useMemo<ProjectV3Editing | undefined>(() => {
    if (!v3ManifestWriteEnabled || !projectWriteAnchor) return undefined
    return {
      editor: v3Editor,
      onBeginEditBook: (bookId, name, authors) => {
        const anchor = guardV3Begin()
        if (anchor) v3Editor.beginEditBook(anchor, bookId, name, authors)
      },
      onBeginEditItem: (bookId, itemId, title, authors, translators) => {
        const anchor = guardV3Begin()
        if (anchor) v3Editor.beginEditBodyItem(anchor, bookId, itemId, title, authors, translators)
      },
      onBeginEditMaterial: (materialId, title, authors, translators, role) => {
        const anchor = guardV3Begin()
        if (anchor) v3Editor.beginEditMaterial(anchor, materialId, title, authors, translators, role)
      },
      onRequestRemoveItem: (bookId, itemId, label) => {
        const anchor = guardV3Begin()
        if (anchor) v3Editor.requestRemoveItem(anchor, bookId, itemId, label)
      },
      onRequestRemoveMaterial: (materialId, label) => {
        const anchor = guardV3Begin()
        if (anchor) v3Editor.requestRemoveMaterial(anchor, materialId, label)
      },
      onRequestRemoveBook: (bookId, bookName) => {
        const anchor = guardV3Begin()
        if (anchor) v3Editor.requestRemoveBook(anchor, bookId, bookName)
      },
      onMoveBodyItem: (bookId, itemId, toIndex) => {
        const anchor = guardV3Begin()
        if (anchor) void v3Editor.moveBodyItem(anchor, bookId, itemId, toIndex)
      },
      onMoveMaterial: (materialId, toIndex) => {
        const anchor = guardV3Begin()
        if (anchor) void v3Editor.moveMaterial(anchor, materialId, toIndex)
      },
      onBeginCreateBook: () => {
        const anchor = guardV3Begin()
        if (anchor) v3Editor.beginCreateBook(anchor)
      },
      onRegisterBodyItem: (relativePath, bookId) => {
        const anchor = guardV3Begin()
        if (anchor) {
          void v3Editor.registerUnregisteredFile(anchor, relativePath, { kind: 'body', bookId })
        }
      },
      onRegisterMaterial: (relativePath, role: BookManifestV3MaterialRole) => {
        const anchor = guardV3Begin()
        if (anchor) {
          void v3Editor.registerUnregisteredFile(anchor, relativePath, { kind: 'material', role })
        }
      },
    }
  }, [v3ManifestWriteEnabled, projectWriteAnchor, v3Editor, guardV3Begin])

  const v3ManifestInit = useMemo<ProjectV3ManifestInit | undefined>(() => {
    if (projectPanelState.kind !== 'ready') return undefined
    if (projectPanelState.manifestSource !== 'none' || projectPanelState.manifestWarning) {
      return undefined
    }
    return {
      editor: v3Editor,
      enabled: v3ManifestInitEnabled,
      onSubmitCreateBook: (name: string) => {
        const anchor = guardV3Begin()
        if (anchor) void v3Editor.submitCreateBook(anchor, name)
      },
    }
  }, [projectPanelState, v3ManifestInitEnabled, v3Editor, guardV3Begin])

  const handleReturnAssetPreview = useCallback(() => {
    requestAssetLeave()
  }, [requestAssetLeave])

  // 選択中の資料を簡易編集してよいか（write 可能 context かつ中央 active tab と別ファイル）。
  // 中央で開いている資料は二重編集を避けるため編集不可にする。path 比較は separator / case 差を
  // 吸収する pure helper に委譲する（renderer で realpath は取得しない）。
  const selectedAssetPath = getSelectedAssetPreviewPath(projectAssetPreview)
  const canEditSelectedAsset = canEditProjectAssetInPane({
    contextWriteCapable: assetEditEnabled,
    selectedAssetPath,
    activeFilePath,
  })
  // 編集中の資料が中央 active tab と同一になった状態。dirty draft を無言破棄しないため
  // 編集 UI は残すが、textarea を read-only 化して警告する（別ファイルへ切り替われば解除）。
  const assetEditCenterLocked =
    editor.editState.kind === 'editing' &&
    isSamePath(editor.editState.absolutePath, activeFilePath)

  return (
    <ProjectPane
      state={projectPanelState}
      preview={projectAssetPreview}
      editor={editor}
      uiLanguageMode={uiLanguageMode}
      createState={createState}
      createTargetName={createTargetName}
      canCreateProject={createTargetFolder !== null}
      projectMetadataWriteEnabled={projectMetadataWriteEnabled}
      assetEditEnabled={assetEditEnabled}
      canEditSelectedAsset={canEditSelectedAsset}
      assetEditCenterLocked={assetEditCenterLocked}
      onRefresh={handleRefresh}
      onOpenBookChapter={(absolutePath, openInNewTab) =>
        void handleOpenBookChapter(absolutePath, openInNewTab)
      }
      onOpenFile={(absolutePath) => void handleOpenFile(absolutePath)}
      onSelectAsset={handleSelectAsset}
      onClearAssetPreview={handleClearAssetPreview}
      onCreateProject={handleCreateProject}
      titleEditor={titleEditor}
      onBeginTitleEdit={handleBeginTitleEdit}
      onSaveProjectTitle={handleSaveProjectTitle}
      onBeginAssetEdit={handleBeginAssetEdit}
      onReturnAssetPreview={handleReturnAssetPreview}
      v3Editing={v3Editing}
      v3ManifestInit={v3ManifestInit}
      unregisteredSectionReady={unregisteredFilesState.kind === 'ready'}
      unregisteredFiles={
        unregisteredFilesState.kind === 'ready' ? unregisteredFilesState.files : []
      }
      unregisterState={unregisterState}
      onBeginUnregister={handleBeginUnregister}
      onCancelUnregister={cancelUnregister}
      onConfirmUnregister={handleConfirmUnregister}
      projectListState={projectListState}
      onLoadProjectList={loadProjectList}
      onCloseProjectList={resetProjectList}
      onSelectProject={handleSelectProject}
    />
  )
}
