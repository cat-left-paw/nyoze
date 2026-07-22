import { contextBridge, ipcRenderer } from 'electron'
import type { UiLanguageMode } from '../src/settings/types'
import type { NyozeNotesStore } from '../src/project/noteStore'
import type {
  HtmlTemplatePart,
  WebBookAssetFailure,
  WebBookAssetRequest,
} from '../src/editor-core/export/webBookAssetPlan'
import type {
  PageViewerSnapshotPayload,
  PageViewerSnapshotRequest,
} from '../src/ui/page-viewer/pageViewerTypes'
import type {
  ProjectResolveResult,
  ProjectCreateResult,
  ProjectReadNotesResult,
  ProjectWriteNotesResult,
  ProjectMissingFileNotesResult,
  BookFullOutlineResult,
  ChapterNeighborsResult,
  BookExportTargetResult,
  ProjectBooksResult,
  FileRoleEntry,
  ProjectUpdateTitleResult,
  ProjectUnregisterResult,
  BookManifestV3UpdateOperation,
  UpdateBookManifestV3Result,
  ProjectListResult,
  ProjectPanelContextIpcRequest,
  ProjectPanelContextResult,
} from '../src/project/projectIpcTypes'

const e2eBridge =
  process.env.NYOZE_E2E === '1'
    ? {
        readDocumentFixture: (filePath: string) =>
          ipcRenderer.invoke('e2e:readDocumentFixture', filePath) as Promise<
            {
              content: string
              savedStat: { mtimeMs: number; size: number } | null
            } | null
          >,
        establishWorkspaceRoot: (dirPath: string) =>
          ipcRenderer.invoke('e2e:establishWorkspaceRoot', dirPath) as Promise<
            string | null
          >,
        establishLibrariesFixture: (payload: {
          libraryRoots: string[]
          activeRoot: string
        }) =>
          ipcRenderer.invoke(
            'e2e:establishLibrariesFixture',
            payload,
          ) as Promise<
            { ok: true; activeRoot: string } | { ok: false; error: string }
          >,
        queueOpenPathResult: (payload: {
          kind: 'file' | 'directory'
          path: string
        }) =>
          ipcRenderer.invoke('e2e:queueOpenPathResult', payload) as Promise<
            { ok: true } | { ok: false; error: string }
          >,
        dispatchMenuCommand: (command: string) =>
          ipcRenderer.invoke('e2e:dispatchMenuCommand', command) as Promise<boolean>,
      }
    : undefined

contextBridge.exposeInMainWorld('nyozeBridge', {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  platform: process.platform,
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  library: {
    // 書庫 registry。getRegistry は read-only payload (registeredLibraries /
    // activeLibraryId / activeLibraryRoot / maxRegisteredLibraries) を返す。
    // mutation は下の専用 API で扱う。renderer は libraryId / name だけを渡し、
    // rootPath / parent path は main 側で registry / dialog / pending state から解決する。
    getRegistry: () =>
      ipcRenderer.invoke(
        'library:getRegistry',
      ) as Promise<import('../src/settings/libraryRegistry').LibraryRegistryReadResult>,
    // 既存登録済み書庫を active に切り替える。renderer は libraryId だけ渡し、
    // rootPath は送らない (main 側で registry から解決する)。
    setActive: (libraryId: string) =>
      ipcRenderer.invoke(
        'library:setActive',
        libraryId,
      ) as Promise<import('../src/settings/libraryRegistry').LibrarySetActiveResult>,
    // 既存フォルダを書庫として登録する。renderer は引数なしで呼び、folder 選択は
    // main 側 dialog で行う (rootPath を送らない)。
    registerExisting: () =>
      ipcRenderer.invoke(
        'library:registerExisting',
      ) as Promise<import('../src/settings/libraryRegistry').LibraryRegisterExistingResult>,
    // 書庫名を変更する。renderer は { libraryId, name } だけを渡し、rootPath は送らない。
    rename: (libraryId: string, name: string) =>
      ipcRenderer.invoke(
        'library:rename',
        { libraryId, name },
      ) as Promise<import('../src/settings/libraryRegistry').LibraryRenameResult>,
    // 書庫の登録解除。renderer は libraryId だけを渡し、rootPath は送らない。
    unregister: (libraryId: string) =>
      ipcRenderer.invoke(
        'library:unregister',
        libraryId,
      ) as Promise<import('../src/settings/libraryRegistry').LibraryUnregisterResult>,
    // 書庫フォルダを OS file manager で表示する。renderer は libraryId だけ渡す。
    reveal: (libraryId: string) =>
      ipcRenderer.invoke(
        'library:reveal',
        libraryId,
      ) as Promise<import('../src/settings/libraryRegistry').LibraryRevealResult>,
    // 新規書庫作成の親フォルダ選択 (path は main 側一時保持。renderer へは返さない)。
    pickCreateParent: () =>
      ipcRenderer.invoke(
        'library:pickCreateParent',
      ) as Promise<import('../src/settings/libraryRegistry').LibraryPickCreateParentResult>,
    // 新規書庫作成の pending parent を破棄する (path は renderer へ返さない)。
    clearCreateParent: () =>
      ipcRenderer.invoke(
        'library:clearCreateParent',
      ) as Promise<{ ok: true }>,
    // 新規書庫を作成する。renderer は name だけ渡す (parent / rootPath は送らない)。
    createNew: (name: string) =>
      ipcRenderer.invoke(
        'library:createNew',
        name,
      ) as Promise<import('../src/settings/libraryRegistry').LibraryCreateNewResult>,
  },
  fs: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder') as Promise<string | null>,
    getLastWorkspaceRoot: () =>
      ipcRenderer.invoke('fs:getLastWorkspaceRoot') as Promise<string | null>,
    openPath: () =>
      ipcRenderer.invoke('dialog:openPath') as Promise<
        { kind: 'file' | 'directory'; path: string } | null
      >,
    listDir: (dirPath: string) =>
      ipcRenderer.invoke('fs:listDir', dirPath) as Promise<
        { name: string; isDirectory: boolean }[]
      >,
    openFile: (filePath: string) =>
      ipcRenderer.invoke('fs:openFile', filePath) as Promise<
        | { ok: true; content: string; size: number }
        | {
            ok: false
            errorKind:
              | 'validation'
              | 'not-file'
              | 'too-large'
              | 'decode-failed'
              | 'read-failed'
            errorMessage: string
          }
      >,
    readFile: (filePath: string) =>
      ipcRenderer.invoke('fs:readFile', filePath) as Promise<
        | { ok: true; content: string; size: number }
        | {
            ok: false
            errorKind:
              | 'validation'
              | 'not-file'
              | 'too-large'
              | 'decode-failed'
              | 'read-failed'
            errorMessage: string
          }
      >,
    pathExists: (filePath: string) =>
      ipcRenderer.invoke('fs:pathExists', filePath) as Promise<boolean>,
    getFileStat: (filePath: string) =>
      ipcRenderer.invoke('fs:getFileStat', filePath) as Promise<
        { ctimeMs: number; mtimeMs: number; size: number } | null
      >,
    writeFile: (
      filePath: string,
      content: string,
      options?: {
        expectedStat?: { mtimeMs: number; size: number } | null
        allowConflictOverwrite?: boolean
      },
    ) =>
      ipcRenderer.invoke('fs:writeFile', filePath, content, options) as Promise<
        {
          saved: boolean
          backupWarning?: string
          conflictKind?: 'modified' | 'deleted'
        }
      >,
    createFile: (parentDir: string, name: string, content = '') =>
      ipcRenderer.invoke('fs:createFile', parentDir, name, content) as Promise<boolean>,
    createDir: (parentDir: string, name: string) =>
      ipcRenderer.invoke('fs:createDir', parentDir, name) as Promise<boolean>,
    renamePath: (sourcePath: string, newName: string) =>
      ipcRenderer.invoke('fs:renamePath', sourcePath, newName) as Promise<boolean>,
    revealInFileManager: (targetPath: string) =>
      ipcRenderer.invoke('fs:revealInFileManager', targetPath) as Promise<boolean>,
    trashItem: (targetPath: string) =>
      ipcRenderer.invoke('fs:trashItem', targetPath) as Promise<boolean>,
    copyFile: (sourcePath: string, destinationPath: string, overwrite: boolean) =>
      ipcRenderer.invoke(
        'fs:copyFile',
        sourcePath,
        destinationPath,
        overwrite,
      ) as Promise<boolean>,
    moveFile: (sourcePath: string, destinationPath: string, overwrite: boolean) =>
      ipcRenderer.invoke(
        'fs:moveFile',
        sourcePath,
        destinationPath,
        overwrite,
      ) as Promise<boolean>,
    saveAs: (content: string, defaultPath?: string) =>
      ipcRenderer.invoke('dialog:saveAs', { content, defaultPath }) as Promise<{
        saved: boolean
        filePath?: string
        backupWarning?: string
      }>,
    exportAozoraText: (text: string, suggestedPath?: string) =>
      ipcRenderer.invoke('dialog:exportAozoraText', { text, suggestedPath }) as Promise<{
        saved: boolean
        filePath?: string
        backupWarning?: string
        errorKind?:
          | 'validation'
          | 'parent-missing'
          | 'permission'
          | 'disk-full'
          | 'write-failed'
          | 'canceled'
        errorMessage?: string
      }>,
    exportLeMEMarkdown: (text: string, suggestedPath?: string) =>
      ipcRenderer.invoke('dialog:exportLeMEMarkdown', { text, suggestedPath }) as Promise<{
        saved: boolean
        filePath?: string
        backupWarning?: string
        errorKind?:
          | 'validation'
          | 'parent-missing'
          | 'permission'
          | 'disk-full'
          | 'write-failed'
          | 'canceled'
        errorMessage?: string
      }>,
    exportDendenMarkdown: (text: string, suggestedPath?: string) =>
      ipcRenderer.invoke('dialog:exportDendenMarkdown', { text, suggestedPath }) as Promise<{
        saved: boolean
        filePath?: string
        backupWarning?: string
        errorKind?:
          | 'validation'
          | 'parent-missing'
          | 'permission'
          | 'disk-full'
          | 'write-failed'
          | 'canceled'
        errorMessage?: string
      }>,
      exportWebBook: (
        template: readonly HtmlTemplatePart[],
        assetRequests: readonly WebBookAssetRequest[],
        documentPath: string | undefined,
        authorPaletteSnapshot: { pageColor: string; textColor: string; headingColor: string },
        typographySnapshot: {
          headingFont: 'same-as-body' | 'mincho' | 'gothic'
          headingAlignHorizontal: 'start' | 'center' | 'end'
          headingAlignVertical: 'start' | 'center' | 'end'
          headingMarginAfter: number
          headingDividerLevels: {
            h1: boolean
            h2: boolean
            h3: boolean
            h4: boolean
            h5: boolean
            h6: boolean
          }
        },
        autoTcySnapshot: {
          enabled: boolean
          numbersOnly: boolean
          minDigits: number
          maxDigits: number
        },
        suggestedPath?: string,
        outputProfile: 'singleHtml' | 'package' = 'singleHtml',
        capacityWarningsAcknowledged = false,
      ) =>
      ipcRenderer.invoke('dialog:exportWebBook', {
        template,
        assetRequests,
        documentPath,
        authorPaletteSnapshot,
        typographySnapshot,
        autoTcySnapshot,
        suggestedPath,
        outputProfile,
        capacityWarningsAcknowledged,
      }) as Promise<{
      saved: boolean
      filePath?: string
      backupWarning?: string
      errorKind?:
        | 'validation'
        | 'parent-missing'
        | 'permission'
        | 'disk-full'
        | 'write-failed'
        | 'canceled'
        | 'source-document-unavailable'
        | 'asset-error'
        | 'html-too-large'
        | 'needs-capacity-confirm'
      errorMessage?: string
      assetFailures?: WebBookAssetFailure[]
      capacity?: import('./webBookCapacity').WebBookCapacityReport
    }>,
    exportBook: (request: {
      filePath: string
      selector: { bookId: string } | { bookName: string }
      format: 'leme' | 'denden' | 'aozora' | 'webBook'
      options?: {
        boundary?: {
          insertPageBreakBetweenChapters?: boolean
          pageBreakEnabled?: boolean
        }
        export?: {
          autoTcy?: boolean
          tcyMaxDigits?: number
          tcyNumbersOnly?: boolean
          headingAlignment?: boolean
          pageBreakBeforeHeading?: boolean
          pageBreakBeforeHeadingMaxLevel?: number
          pageBreak?: boolean
        }
        lineBreakPolicy?: 'obsidian-paragraph' | 'commonmark-strict'
        /** `format` が `leme` / `denden` / `aozora` のときだけ使う。on/off の
         *  boolean だけで、実際の作品情報 (`bookInfo`) / 章ファイル情報
         *  (`chapterInfos`) は main 側が Book / chapter metadata から組み立てる
         *  （ここでは受け付けない）。 */
        includeBookInfo?: boolean
        includeChapterInfo?: boolean
        showRoleLabels?: boolean
        webBook?: {
          includeDocumentInfo?: boolean
          includeTableOfContents?: boolean
          tableOfContentsMaxLevel?: number
          showRoleLabels?: boolean
          includeChapterInfo?: boolean
          breakAfterDocumentInfo?: boolean
          documentInfoTitlePage?: boolean
          documentInfoTitlePageWritingMode?: 'inherit' | 'vertical-rl' | 'horizontal-tb'
          documentInfoTitlePageLayout?: 'normal' | 'center'
          writingMode?: 'vertical-rl' | 'horizontal-tb'
          outputProfile?: 'singleHtml' | 'package'
        }
        authorPaletteSnapshot?: { pageColor: string; textColor: string; headingColor: string }
        typographySnapshot?: {
          headingFont: 'same-as-body' | 'mincho' | 'gothic'
          headingAlignHorizontal: 'start' | 'center' | 'end'
          headingAlignVertical: 'start' | 'center' | 'end'
          headingMarginAfter: number
          headingDividerLevels: {
            h1: boolean
            h2: boolean
            h3: boolean
            h4: boolean
            h5: boolean
            h6: boolean
          }
        }
        autoTcySnapshot?: {
          enabled: boolean
          numbersOnly: boolean
          minDigits: number
          maxDigits: number
        }
        /** WB-IMG-3A: UX-only soft capacity ack for this attempt. */
        capacityWarningsAcknowledged?: boolean
      }
    }) => ipcRenderer.invoke('dialog:exportBook', request) as Promise<import('./bookExportOperation').BookExportIpcResult>,
  },
  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke('shell:openExternal', url) as Promise<boolean>,
  },
  menu: {
    setBookExportAvailable: (available: boolean) => {
      ipcRenderer.send('menu:setBookExportAvailable', available)
    },
    openAppMenu: (uiLanguageMode: UiLanguageMode) =>
      ipcRenderer.invoke('menu:openAppMenu', uiLanguageMode) as Promise<void>,
    onMenuCommand: (callback: (command: string) => void) => {
      const channels = [
        'menu:new-document',
        'menu:open',
        'menu:save',
        'menu:save-as',
        'menu:export-aozora-text',
        'menu:export-leme-markdown',
        'menu:export-denden-markdown',
        'menu:export-web-book',
        'menu:export-book-leme',
        'menu:export-book-denden',
        'menu:export-book-aozora',
        'menu:export-book-web-book',
        'menu:page-viewer',
        'menu:book-page-viewer',
        'menu:view-settings',
        'menu:manage-libraries',
        'menu:open-manual',
        'menu:show-shortcuts',
        'menu:bug-report',
        'menu:feedback',
      ] as const
      const handlers = channels.map((channel) => {
        const fn = () => callback(channel)
        ipcRenderer.on(channel, fn)
        return { channel, fn }
      })
      // Return cleanup function
      return () => {
        for (const { channel, fn } of handlers) {
          ipcRenderer.removeListener(channel, fn)
        }
      }
    },
  },
  settings: {
    read: () =>
      ipcRenderer.invoke('settings:read') as Promise<Record<string, unknown> | null>,
    write: (data: Record<string, unknown>) =>
      ipcRenderer.invoke('settings:write', data) as Promise<boolean>,
  },
  appInfo: {
    windowsStore: Boolean(process.windowsStore),
  },
  update: {
    checkForUpdate: () =>
      ipcRenderer.invoke('app:checkForUpdate') as Promise<{
        ok: boolean
        hasUpdate: boolean
        latestVersion: string | null
        releaseUrl: string | null
      }>,
  },
  fonts: {
    getSystemFonts: () =>
      ipcRenderer.invoke('fonts:getSystemFonts') as Promise<string[]>,
  },
  project: {
    // Task 3A-2: renderer は filePath だけを渡す。project root の解決と
    // 境界検査は main 側で行う (renderer から root を申告させない)。
    resolveForFile: (filePath: string) =>
      ipcRenderer.invoke('project:resolveForFile', filePath) as Promise<ProjectResolveResult>,
    // Slice B3: Project タブ用。active file path だけを渡し、同一 Project 全体を group 化する。
    resolveProjectBooks: (filePath: string) =>
      ipcRenderer.invoke('project:resolveProjectBooks', filePath) as Promise<ProjectBooksResult>,
    // Project タブ context: bounded selectedPath + kind + source だけを渡す（read-only）。
    resolvePanelContext: (request: ProjectPanelContextIpcRequest) =>
      ipcRenderer.invoke('project:resolvePanelContext', request) as Promise<ProjectPanelContextResult>,
    // Outline 拡張: Book全体Outline。active file path だけを渡し、同じ Book の章 + 見出しを返す。
    resolveBookFullOutline: (filePath: string) =>
      ipcRenderer.invoke('project:resolveBookFullOutline', filePath) as Promise<BookFullOutlineResult>,
    // Outline 拡張: 前後章ナビゲーション。active file path だけを渡し、同一 Book の前後章を返す。
    resolveChapterNeighbors: (filePath: string) =>
      ipcRenderer.invoke('project:resolveChapterNeighbors', filePath) as Promise<ChapterNeighborsResult>,
    // Book 全体 export: read-only v3 manifest から対象 Book を解決する。
    resolveBookExportTarget: (filePath: string) =>
      ipcRenderer.invoke('project:resolveBookExportTarget', filePath) as Promise<BookExportTargetResult>,
    detectProjectRoots: (dirPaths: string[]) =>
      ipcRenderer.invoke('project:detectProjectRoots', dirPaths) as Promise<string[]>,
    // Project 一覧 read-only query: 引数なし。main 側 boundary の workspace root を正本にする。
    listProjects: () =>
      ipcRenderer.invoke('project:listProjects') as Promise<ProjectListResult>,
    detectFileRoles: (filePaths: string[]) =>
      ipcRenderer.invoke('project:detectFileRoles', filePaths) as Promise<FileRoleEntry[]>,
    createProject: (
      folderPath: string,
      options?: { projectTitle?: string; initialBookName?: string },
    ) =>
      ipcRenderer.invoke('project:create', folderPath, options) as Promise<ProjectCreateResult>,
    unregisterProject: (filePathOrAnchor: string | ProjectPanelContextIpcRequest) =>
      ipcRenderer.invoke('project:unregister', filePathOrAnchor) as Promise<ProjectUnregisterResult>,
    readNotes: (filePath: string) =>
      ipcRenderer.invoke('project:readNotes', filePath) as Promise<ProjectReadNotesResult>,
    resolveMissingFileNotes: (filePath: string) =>
      ipcRenderer.invoke('project:resolveMissingFileNotes', filePath) as Promise<ProjectMissingFileNotesResult>,
    writeNotes: (filePath: string, store: NyozeNotesStore) =>
      ipcRenderer.invoke('project:writeNotes', filePath, store) as Promise<ProjectWriteNotesResult>,
    updateTitle: (filePathOrAnchor: string | ProjectPanelContextIpcRequest, title: string) =>
      ipcRenderer.invoke('project:updateTitle', filePathOrAnchor, title) as Promise<ProjectUpdateTitleResult>,
    updateBookManifestV3: (
      filePathOrAnchor: string | ProjectPanelContextIpcRequest,
      operation: BookManifestV3UpdateOperation,
    ) =>
      ipcRenderer.invoke('project:updateBookManifestV3', filePathOrAnchor, operation) as Promise<UpdateBookManifestV3Result>,
    // File Explorer 単一ファイル rename / move の統合 transfer。物理移動と books.json v3 / 付箋データの
    // 追従を main 側で整合更新する。renderer は source / destination / kind / overwrite だけを渡す。
    transferExplorerEntry: (
      request: import('../src/project/projectIpcTypes').ExplorerTransferRequest,
    ) =>
      ipcRenderer.invoke('project:transferExplorerEntry', request) as Promise<
        import('../src/project/projectIpcTypes').ExplorerTransferResult
      >,
    // フォルダ rename / move 前の安全ガード。folder 絶対 path だけを渡す。root 解決は main 側。
    checkFolderTransferGuard: (folderPath: string) =>
      ipcRenderer.invoke('project:checkFolderTransferGuard', folderPath) as Promise<
        import('../src/project/projectIpcTypes').ExplorerFolderTransferGuardResult
      >,
    // Book manifest v3: 未登録テキスト系ファイル query。write anchor または file path だけを渡す。root 解決は main 側。
    resolveUnregisteredFilesV3: (
      filePathOrAnchor:
        | string
        | import('../src/project/projectIpcTypes').ProjectPanelContextIpcRequest,
    ) =>
      ipcRenderer.invoke('project:resolveUnregisteredFilesV3', filePathOrAnchor) as Promise<
        import('../src/project/projectIpcTypes').BookManifestV3UnregisteredFilesIpcResult
      >,
  },
  document: {
    // SEC-5: Notify main of the active file path before each document load.
    // Uses sendSync so main's activeDocumentDir is set before <img> tags fire nyoze-img:// requests.
    setActiveFilePath: (filePath: string | null) => {
      ipcRenderer.sendSync('document:setActiveFilePath', filePath)
    },
  },
  pageViewer: {
    // Light Page Viewer: hand a serializable Markdown snapshot to main, which
    // stores it and opens an independent read-only viewer BrowserWindow.
    openSnapshot: (payload: PageViewerSnapshotRequest) =>
      ipcRenderer.invoke('pageViewer:openSnapshot', payload) as Promise<
        { ok: true; payloadId: string } | { ok: false }
      >,
    // Book 全体 Page Viewer: renderer は active file path + selector + 見た目 snapshot だけ渡す。
    openBook: (
      filePath: string,
      request: import('./bookPageViewerOperation').BookPageViewerRequest,
    ) =>
      ipcRenderer.invoke('pageViewer:openBook', filePath, request) as Promise<
        import('./bookPageViewerOperation').BookPageViewerIpcResult
      >,
    // Called by the viewer window itself (query `payloadId`) to fetch its snapshot.
    getSnapshot: (payloadId: string) =>
      ipcRenderer.invoke('pageViewer:getSnapshot', payloadId) as Promise<
        PageViewerSnapshotPayload | null
      >,
  },
  appState: {
    setDocumentDirty: (dirty: boolean) =>
      ipcRenderer.invoke('app:setDocumentDirty', dirty) as Promise<boolean>,
    onRequestSaveBeforeClose: (callback: (requestId: number) => void) => {
      const channel = 'app:requestSaveBeforeClose'
      const handler = (_event: Electron.IpcRendererEvent, payload: { requestId?: number }) => {
        const requestId = payload?.requestId
        if (typeof requestId !== 'number') return
        callback(requestId)
      }
      ipcRenderer.on(channel, handler)
      return () => {
        ipcRenderer.removeListener(channel, handler)
      }
    },
    reportSaveBeforeClose: (requestId: number, ok: boolean) => {
      ipcRenderer.send('app:saveBeforeClose:result', { requestId, ok })
    },
  },
  e2e: e2eBridge,
})
