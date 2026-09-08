/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
    NYOZE_E2E?: string
    NYOZE_E2E_USER_DATA_DIR?: string
  }
}

interface Window {
  nyozeBridge?: {
    versions: {
      chrome: string
      electron: string
      node: string
    }
    platform: 'darwin' | 'win32' | 'linux' | string
    windowControls: {
      minimize: () => Promise<boolean>
      close: () => Promise<void>
    }
    library: {
      /**
       * 書庫 (workspace / library) registry の read-only payload。renderer は
       * registered libraries / active library を表示できる。mutation は下の専用 API で
       * 行い、renderer から rootPath / parent path は渡さない。
       */
      getRegistry: () => Promise<
        import('../src/settings/libraryRegistry').LibraryRegistryReadResult
      >
      /**
       * 既存登録済み書庫を active に切り替える。renderer は libraryId だけ渡し、
       * rootPath は送らない。main 側で registry から rootPath を解決し、realpath /
       * directory 検証を満たす場合のみ workspaceRoot / activeWorkspaceRoot を更新する。
       * 既存フォルダ登録 / rename / 解除はこの API では行わない。
       */
      setActive: (
        libraryId: string,
      ) => Promise<import('../src/settings/libraryRegistry').LibrarySetActiveResult>
      /**
       * 既存フォルダを書庫として登録し active にする。renderer は引数なしで呼び、
       * folder 選択は main 側 dialog で行う (rootPath を送らない)。duplicate は追加せず
       * 既存を active 化する (added: false)。書庫の新規作成 / rename / 解除はこの API では行わない。
       */
      registerExisting: () => Promise<
        import('../src/settings/libraryRegistry').LibraryRegisterExistingResult
      >
      /**
       * 書庫名を変更する。renderer は `{ libraryId, name }` だけを渡し、rootPath は送らない。
       * main 側で name だけ更新し、workspaceRoot / activeWorkspaceRoot は変えない。
       */
      rename: (
        libraryId: string,
        name: string,
      ) => Promise<import('../src/settings/libraryRegistry').LibraryRenameResult>
      /**
       * 書庫の登録解除。renderer は libraryId だけを渡し、rootPath は送らない。
       * registry から外すだけでフォルダやファイルは削除しない。active 解除時は次 / 前の行へ
       * fallback し、realpath 検証後に workspaceRoot / activeWorkspaceRoot を更新する。
       */
      unregister: (
        libraryId: string,
      ) => Promise<import('../src/settings/libraryRegistry').LibraryUnregisterResult>
      /**
       * 書庫フォルダを OS file manager で表示する。renderer は libraryId だけ渡し、
       * rootPath は送らない。state / workspaceRoot / activeWorkspaceRoot は変更しない。
       */
      reveal: (
        libraryId: string,
      ) => Promise<import('../src/settings/libraryRegistry').LibraryRevealResult>
      /**
       * 新規書庫作成の親フォルダを選択する。path は main 側一時 state に保持し renderer へは返さない。
       */
      pickCreateParent: () => Promise<
        import('../src/settings/libraryRegistry').LibraryPickCreateParentResult
      >
      /**
       * 新規書庫作成の pending parent を破棄する。state / workspaceRoot は変更しない。
       */
      clearCreateParent: () => Promise<{ ok: true }>
      /**
       * 新規書庫フォルダを作成して registry に登録する。renderer は name だけ渡す。
       */
      createNew: (name: string) => Promise<
        import('../src/settings/libraryRegistry').LibraryCreateNewResult
      >
    }
    fs: {
      openFolder: () => Promise<string | null>
      getLastWorkspaceRoot: () => Promise<string | null>
      openPath: () => Promise<{ kind: 'file' | 'directory'; path: string } | null>
      listDir: (dirPath: string) => Promise<{ name: string; isDirectory: boolean }[]>
      openFile: (filePath: string) => Promise<
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
      >
      readFile: (filePath: string) => Promise<
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
      >
      pathExists: (filePath: string) => Promise<boolean>
      getFileStat: (
        filePath: string,
      ) => Promise<{ ctimeMs: number; mtimeMs: number; size: number } | null>
      writeFile: (
        filePath: string,
        content: string,
        options?: {
          expectedStat?: { mtimeMs: number; size: number } | null
          allowConflictOverwrite?: boolean
        },
      ) => Promise<{
        saved: boolean
        backupWarning?: string
        conflictKind?: 'modified' | 'deleted'
        errorKind?:
          | 'validation'
          | 'parent-missing'
          | 'permission'
          | 'disk-full'
          | 'write-failed'
          | 'canceled'
        errorMessage?: string
      }>
      createFile: (parentDir: string, name: string, content?: string) => Promise<boolean>
      createDir: (parentDir: string, name: string) => Promise<boolean>
      renamePath: (sourcePath: string, newName: string) => Promise<boolean>
      revealInFileManager: (targetPath: string) => Promise<boolean>
      trashItem: (targetPath: string) => Promise<boolean>
      copyFile: (
        sourcePath: string,
        destinationPath: string,
        overwrite: boolean,
      ) => Promise<boolean>
      moveFile: (
        sourcePath: string,
        destinationPath: string,
        overwrite: boolean,
      ) => Promise<boolean>
      saveAs: (content: string, defaultPath?: string) => Promise<{
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
      }>
      exportAozoraText: (text: string, suggestedPath?: string) => Promise<{
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
      }>
      exportLeMEMarkdown: (text: string, suggestedPath?: string) => Promise<{
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
      }>
      exportDendenMarkdown: (text: string, suggestedPath?: string) => Promise<{
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
      }>
      exportWebBook: (
        template: readonly import('../src/editor-core/export/webBookAssetPlan').HtmlTemplatePart[],
        assetRequests: readonly import('../src/editor-core/export/webBookAssetPlan').WebBookAssetRequest[],
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
        outputProfile?: 'singleHtml' | 'package',
        capacityWarningsAcknowledged?: boolean,
      ) => Promise<{
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
        assetFailures?: import('../src/editor-core/export/webBookAssetPlan').WebBookAssetFailure[]
        capacity?: import('./webBookCapacity').WebBookCapacityReport
      }>
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
          /** `format` が `leme` / `denden` / `aozora` のときだけ使う。`bookInfo` /
           *  `chapterInfos` は main 側が Book / chapter metadata から決めるため、
           *  ここでは受け付けない。 */
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
      }) => Promise<import('./bookExportOperation').BookExportIpcResult>
    }
    settings: {
      read: () => Promise<Record<string, unknown> | null>
      write: (data: Record<string, unknown>) => Promise<boolean>
    }
    appInfo: {
      windowsStore: boolean
    }
    update: {
      checkForUpdate: () => Promise<{
        ok: boolean
        hasUpdate: boolean
        latestVersion: string | null
        releaseUrl: string | null
      }>
    }
    fonts: {
      getSystemFonts: () => Promise<string[]>
    }
    shell: {
      openExternal: (url: string) => Promise<boolean>
    }
    menu: {
      setBookExportAvailable: (available: boolean) => void
      openAppMenu: (uiLanguageMode: import('../src/settings/types').UiLanguageMode) => Promise<void>
      /**
       * Application menu → renderer command.
       * P2-G1b で追加した Edit 系は `menu:edit-undo` / `menu:edit-redo` /
       * `menu:edit-select-all` の固定 3 channel のみ（汎用 command IPC は設けない）。
       * 受信側は `isEditMenuChannel` / `editMenuChannelToOperation` で絞り込む。
       */
      onMenuCommand: (callback: (command: string) => void) => () => void
    }
    project: {
      /**
       * Task 3A-2: project root / notes.json bridge.
       * renderer は filePath / folderPath だけを渡し、project root の解決と
       * 境界検査は main 側で行う。
       */
      resolveForFile: (
        filePath: string,
      ) => Promise<import('../src/project/projectIpcTypes').ProjectResolveResult>
      resolveProjectBooks: (
        filePath: string,
      ) => Promise<import('../src/project/projectIpcTypes').ProjectBooksResult>
      resolvePanelContext: (
        request: import('../src/project/projectIpcTypes').ProjectPanelContextIpcRequest,
      ) => Promise<import('../src/project/projectIpcTypes').ProjectPanelContextResult>
      resolveBookFullOutline: (
        filePath: string,
      ) => Promise<import('../src/project/projectIpcTypes').BookFullOutlineResult>
      resolveChapterNeighbors: (
        filePath: string,
      ) => Promise<import('../src/project/projectIpcTypes').ChapterNeighborsResult>
      resolveBookExportTarget: (
        filePath: string,
      ) => Promise<import('../src/project/projectIpcTypes').BookExportTargetResult>
      /**
       * File Explorer: 表示中フォルダ候補のうち `.nyoze/project.json` を持つ
       * project root だけを「入力文字列のまま」返す（表示専用）。renderer は
       * 候補ディレクトリパスだけを渡し、境界検査と存在確認は main 側で行う。
       */
      detectProjectRoots: (dirPaths: string[]) => Promise<string[]>
      /**
       * workspace root（書庫）配下の Project 一覧を read-only で返す。renderer は
       * projectRoot を送らず、main 側 boundary の workspace root を正本に走査する。
       * 書き込みは一切しない（project.json / books.json / Markdown / notes.json 不変）。
       */
      listProjects: () => Promise<
        import('../src/project/projectIpcTypes').ProjectListResult
      >
      /**
       * File Explorer: 表示中の `.md` / `.markdown` / `.txt` のうち、project 内かつ
       * books.json v3 registry に登録済みで表示対象 role を持つものだけを
       * `{ path, role }` で返す（表示専用・read-only）。
       * renderer は候補ファイルパスだけを渡し、境界検査・project 解決・manifest 読み取りは
       * main 側で行う（projectRoot は渡さない）。作品ごとに manifest を 1 回読み、
       * invalid / diagnostics がある作品は role を返さない。
       */
      detectFileRoles: (
        filePaths: string[],
      ) => Promise<import('../src/project/projectIpcTypes').FileRoleEntry[]>
      /**
       * フォルダを作品にし、`.nyoze/project.json` と v3 `.nyoze/books.json`（最初の Book 1 件）を
       * 初期作成する。renderer は folderPath と作成オプションだけを渡す（projectRoot は送らない）。
       * options 省略時は projectTitle=フォルダ名 / initialBookName=本編 で作る。
       */
      createProject: (
        folderPath: string,
        options?: { projectTitle?: string; initialBookName?: string },
      ) => Promise<import('../src/project/projectIpcTypes').ProjectCreateResult>
      /** bounded file path または context write anchor だけを渡し、main 側で project root を解決して登録解除する。 */
      unregisterProject: (
        filePathOrAnchor:
          | string
          | import('../src/project/projectIpcTypes').ProjectPanelContextIpcRequest,
      ) => Promise<import('../src/project/projectIpcTypes').ProjectUnregisterResult>
      readNotes: (
        filePath: string,
      ) => Promise<import('../src/project/projectIpcTypes').ProjectReadNotesResult>
      resolveMissingFileNotes: (
        filePath: string,
      ) => Promise<import('../src/project/projectIpcTypes').ProjectMissingFileNotesResult>
      writeNotes: (
        filePath: string,
        store: import('../src/project/noteStore').NyozeNotesStore,
      ) => Promise<import('../src/project/projectIpcTypes').ProjectWriteNotesResult>
      /**
       * STICKY-NOTE-DISCARD-CONSISTENCY1: 明示的な破棄時に、未保存 anchor に対応する
       * provisional note を id 単位で取り除く。project root は main 側で document path
       * から再解決し、request の projectRoot と一致しなければ 1 件も削除しない。
       */
      discardProvisionalNotes: (
        filePath: string,
        request: import('../src/project/provisionalNoteCleanup').ProvisionalNoteCleanupRequest,
      ) => Promise<import('../src/project/projectIpcTypes').ProjectDiscardProvisionalNotesResult>
      /** bounded file path または context write anchor だけを渡し、main 側で project root を解決して title を更新する。 */
      updateTitle: (
        filePathOrAnchor:
          | string
          | import('../src/project/projectIpcTypes').ProjectPanelContextIpcRequest,
        title: string,
      ) => Promise<import('../src/project/projectIpcTypes').ProjectUpdateTitleResult>
      /**
       * bounded file path または context write anchor と operation だけを渡し、main 側で
       * project root を解決して `.nyoze/books.json` v3 を atomic に更新する。
       * projectRoot は渡さない。`add-body-item` / `add-material` は path のみ受け取り、
       * metadata は main 側で frontmatter から一度だけ読み取る。
       */
      updateBookManifestV3: (
        filePathOrAnchor:
          | string
          | import('../src/project/projectIpcTypes').ProjectPanelContextIpcRequest,
        operation: import('../src/project/projectIpcTypes').BookManifestV3UpdateOperation,
      ) => Promise<import('../src/project/projectIpcTypes').UpdateBookManifestV3Result>
      /**
       * File Explorer 単一ファイル rename / move の統合 transfer。物理移動 + books.json v3 +
       * notes.json を main 側で整合更新する。renderer は source / destination 絶対 path・
       * 操作種別・overwrite だけを渡し、project root は main 側で解決する。
       */
      transferExplorerEntry: (
        request: import('../src/project/projectIpcTypes').ExplorerTransferRequest,
      ) => Promise<import('../src/project/projectIpcTypes').ExplorerTransferResult>
      /**
       * フォルダ rename / move 前の安全ガード。配下に v3 登録済み path / 非 deleted 付箋が
       * あれば blocked を返す（フォルダ配下 path 一括追従は未実装）。folder 絶対 path だけを渡す。
       */
      checkFolderTransferGuard: (
        folderPath: string,
      ) => Promise<import('../src/project/projectIpcTypes').ExplorerFolderTransferGuardResult>
      /**
       * write anchor または bounded file path だけを渡し、main 側で project root を解決して
       * `.nyoze/books.json` v3 registry を正本に未登録 `.md` / `.markdown` / `.txt` を列挙する。
       * scan は version 非依存で、registry filter だけが v3 を見る。read-only。
       */
      resolveUnregisteredFilesV3: (
        filePathOrAnchor:
          | string
          | import('../src/project/projectIpcTypes').ProjectPanelContextIpcRequest,
      ) => Promise<import('../src/project/projectIpcTypes').BookManifestV3UnregisteredFilesIpcResult>
    }
    document: {
      /** SEC-5: Notify main of the active file path before each document load. */
      setActiveFilePath(filePath: string | null): void
    }
    pageViewer: {
      /** Hand a serializable Markdown snapshot to main; opens an independent read-only viewer window. */
      openSnapshot: (
        payload: import('../src/ui/page-viewer/pageViewerTypes').PageViewerSnapshotRequest,
      ) => Promise<{ ok: true; payloadId: string } | { ok: false }>
      /** Book 全体を read-only に読み、独立 viewer window で開く。 */
      openBook: (
        filePath: string,
        request: import('./bookPageViewerOperation').BookPageViewerRequest,
      ) => Promise<import('./bookPageViewerOperation').BookPageViewerIpcResult>
      /** Called by the viewer window itself to fetch its stored snapshot by payloadId. */
      getSnapshot: (
        payloadId: string,
      ) => Promise<import('../src/ui/page-viewer/pageViewerTypes').PageViewerSnapshotPayload | null>
    }
    appState: {
      setDocumentDirty: (dirty: boolean) => Promise<boolean>
      onRequestSaveBeforeClose: (callback: (requestId: number) => void) => () => void
      reportSaveBeforeClose: (requestId: number, ok: boolean) => void
      /**
       * STICKY-NOTE-DISCARD-CONSISTENCY1: 明示的な破棄で close / quit する前の
       * provisional 付箋 cleanup 要求。結果は reportSaveBeforeClose で返す。
       */
      onRequestDiscardBeforeClose: (callback: (requestId: number) => void) => () => void
    }
    e2e?: {
      /**
       * main の `MAIN_E2E_ENABLED`（`NYOZE_E2E` かつ非 packaged）。preload はこれが
       * true のときだけ bridge 自体を expose し、renderer も true を必須条件にする。
       */
      enabled: true
      readDocumentFixture: (filePath: string) => Promise<{
        content: string
        savedStat: { mtimeMs: number; size: number } | null
      } | null>
      establishWorkspaceRoot: (dirPath: string) => Promise<string | null>
      establishLibrariesFixture: (payload: {
        libraryRoots: string[]
        activeRoot: string
      }) => Promise<{ ok: true; activeRoot: string } | { ok: false; error: string }>
      queueOpenPathResult: (payload: {
        kind: 'file' | 'directory'
        path: string
      }) => Promise<{ ok: true } | { ok: false; error: string }>
      dispatchMenuCommand: (command: string) => Promise<boolean>
      /**
       * E2E-UX1b: 初回 paint 前に同期適用する theme bootstrap。
       * main が検証済みの enum だけを返す。非 E2E では `e2e` 自体が存在しない。
       */
      bootstrapTheme: {
        uiTheme: string
        documentTheme: string
        /** 3 値そろった `#RRGGBB` のときだけ非 null。 */
        docColor: {
          pageColor: string
          textColor: string
          headingColor: string
        } | null
      } | null
    }
    /**
     * P3-A1a: 作者限定 internal pilot（局所 IME slot safety shell）の
     * read-only capability。main の `LOCAL_IME_PILOT_AVAILABLE`
     * （`NYOZE_LOCAL_IME_PILOT === '1'` かつ**非 packaged**）が true のときだけ
     * preload が expose する。boolean 1 個だけで、任意設定・本文・path は載せない。
     * `available` は HUD と手動 arm 導線を出してよいという意味で、
     * session を開始した状態（`enabled`）ではない。
     */
    localImePilot?: {
      available: true
    }
    /**
     * LOCAL-WINDOW-PUBLIC-ENTRY1: 対応platformのread-only製品capability。
     *
     * mainのLocal Window platform authorityが対応を認め、作者pilotが非availableのときだけ
     * preloadがexposeする。
     * **`capable` は「設定 UI を出してよい」だけで、有効化ではない。** 実効有効化は
     * settings.jsonの`experimentalLocalImeEnabled`（既定false）が
     * 正本で、この bridge には preference も session 操作も diagnostics も載せない。
     */
    localImeExperimentalPreview?: {
      capable: true
    }
  }
  __NYOZE_E2E__?: {
    snapshotSpecialInlineBoundaryCompositionPendingForE2e?: () => Record<string, string>;
    setSpecialInlineBoundaryDiagEnabled?: (on: boolean) => void;
    flushSpecialInlineBoundaryDiagLogs?: () => string[];
    inspectSpecialInlineAdjacentCaretPm?: () => {
      collapsed: boolean;
      adjacentKind: "aozoraRuby" | "aozoraTcy" | null;
      anchorPos: number;
      headPos: number;
    } | null;
    /**
     * P2-G2b: `EditorCoreHandle.peekMarkdown()` の読み取り専用入口。live PM
     * state を保存せず serialize するだけ（file / IPC には触れない）。
     */
    peekMarkdown?: () => string | null;
    /**
     * P2-G1a: `EditorCoreHandle.routeLocalImeEditMenuCommand()` の実経路入口。
     * 製品の Edit menu はまだ native role なので、integration port →
     * controller port → 既存 P2-D1 adapter を実 instance で通す唯一の検証手段。
     */
    routeLocalImeEditMenuCommand?: (
      operation: import('../src/editor-core/features/localImeEditMenuCommandState').LocalImeEditMenuOperation,
    ) =>
      | import('../src/editor-core/features/localImeEditMenuCommandState').LocalImeEditMenuCommandResult
      | null;
    runEditorUndoRedo?: (operation: 'undo' | 'redo') => boolean;
    localImeLocalWindow?: {
      snapshot: () =>
        | import('../src/editor-core/features/localImeLocalWindowController').LocalImeLocalWindowSnapshot
        | null
      setFailure: (
        failure: import('../src/editor-core/features/localImeLocalWindowController').LocalImeLocalWindowFailureForTest,
      ) => void
      dispatchHostContentChange: (
        kind: import('../src/editor-core/features/localImeLocalWindowController').LocalImeLocalWindowHostContentChangeForTest,
      ) => boolean
      setLocalSelection: (anchor: number, head?: number) => boolean
      dispatchLocalGrowth: (additionalBlocks: number, text?: string) => boolean
      /** LOCAL-WINDOW-RECOVERY-RESTART1 typed portの診断入口（E2E gate内だけ）。 */
      recovery?: {
        epoch: () => number | null
        diagnostics: () =>
          | import('../src/editor-core/features/localImeLocalWindowRecoveryRuntime').LocalImeLocalWindowRecoveryDiagnostics
          | null
        requestEnabled: (
          enabled: boolean,
          epoch?: number,
        ) =>
          | import('../src/editor-core/features/localImeLocalWindowRecoveryRuntime').LocalImeLocalWindowEnableOutcome
          | null
        retry: () =>
          import('../src/editor-core/features/localImeLocalWindowRecoveryRuntime').LocalImeLocalWindowRecoveryRetryOutcome
        retryAtEpoch: (
          epoch: number,
        ) =>
          | import('../src/editor-core/features/localImeLocalWindowRecoveryRuntime').LocalImeLocalWindowRecoveryRetryOutcome
          | null
        exportMarkdown: () =>
          import('../src/editor-core/features/localImeLocalWindowRecoveryExport').LocalImeLocalWindowRecoveryExportResult
        copyMarkdown: (
          mode?: 'capture' | 'fail',
        ) => Promise<
          import('../src/editor-core/features/localImeLocalWindowRecoveryExport').LocalImeLocalWindowRecoveryCopyResult
        >
        readCapturedClipboard: () => { markdown: string | null; writeCount: number }
        discard: (
          confirmed: boolean,
        ) =>
          import('../src/editor-core/features/localImeLocalWindowRecoveryRuntime').LocalImeLocalWindowRecoveryDiscardOutcome
        restart: () =>
          import('../src/editor-core/features/localImeLocalWindowRecoveryRuntime').LocalImeLocalWindowRestartOutcome
        restartAtEpoch: (
          epoch: number,
        ) =>
          import('../src/editor-core/features/localImeLocalWindowRecoveryRuntime').LocalImeLocalWindowRestartOutcome
        /** test only: restartのStart経路へone-shot failureを仕込む。 */
        injectRestartStartFailure: (
          kind: 'start-wiring' | 'start-wiring-and-settlement',
        ) => void
      }
    }
    longDocNavigationPerformance?: {
      snapshot: () => ReturnType<
        import('../src/editor-core/features/localImeIntegration').LocalImeIntegrationHandle['getNavigationPerformanceSnapshotForE2e']
      >
    }
    /** EDITOR-INTERACTION-PERF1: non-packaged E2E-only host composition read-back. */
    hostImeComposition?: {
      active: () => boolean
    }
    /**
     * runtime の strategy-neutral coarse status 診断。
     * 本文・selection・geometry・path は載せない。
     */
    localImeLocalEditingStatus?: {
      snapshot: () => {
        localEditingStatus: import('../src/editor-core/features/localImeLocalEditingStatusState').LocalImeLocalEditingStatus
        localEditingStatusPublishCount: number
      }
    }
    loadFileIntoActiveTab: (
      filePath: string,
    ) => Promise<"loaded" | "activated-existing" | "cancelled" | false>
    openFileInNewTab: (
      filePath: string,
    ) => Promise<'added' | 'tab-limit' | 'cancelled' | false>
    openShortcutReferenceDoc?: () => Promise<
      'added' | 'tab-limit' | 'cancelled' | false
    >
    /** LOCAL-WINDOW-DOCUMENT-LEAVE1: non-packaged E2E-only tab observation/operation port. */
    documentLeaveTabs?: {
      snapshot: () => readonly {
        id: string
        title: string
        dirty: boolean
        filePath: string | null
        markdownSnapshot: string
        savedStat: { mtimeMs: number; size: number } | null
        internalDocId?: string
        active: boolean
      }[]
      switchTo: (tabId: string) => Promise<'switched' | 'cancelled'>
      add: () => Promise<'added' | 'tab-limit' | 'cancelled'>
      close: (tabId: string) => Promise<void>
      injectDocumentIdentity: (documentIdentity: string | null) => void
    }
    macosArrowScrollClampE2eEvaluate?: (payload: {
      gate: import('../src/editor-core/features/macosArrowScrollClamp').MacosArrowScrollClampGateInput
      beforeTop: number
      beforeLeft: number
      afterTop: number
      afterLeft: number
      clientWidth: number
      clientHeight: number
    }) => {
      shouldGate: boolean
      scrollTop: number
      scrollLeft: number
      changed: boolean
    }
    /** NYOZE_E2E: set trusted workspace + Explorer root to an absolute fixture directory. */
    establishFixtureWorkspace?: (dirPath: string) => Promise<boolean>
    /** NYOZE_E2E: register multiple libraries and sync the active library root. */
    establishLibrariesFixture?: (payload: {
      libraryRoots: string[]
      activeRoot: string
    }) => Promise<boolean>
    /** NYOZE_E2E: queue the next toolbar / Load file picker result (no native dialog). */
    queueOpenPathResult?: (payload: {
      kind: 'file' | 'directory'
      path: string
    }) => Promise<boolean>
    /** NYOZE_E2E: dispatch a File menu command through the preload menu channel. */
    dispatchMenuCommand?: (command: string) => Promise<boolean>
    /** NYOZE_E2E: toggle pseudo caret overlay at runtime (Task 2-2). */
    setPseudoCaretEnabledForE2e?: (on: boolean) => void
    /** NYOZE_E2E: set pseudo caret thickness in px at runtime (Task 2-4). */
    setPseudoCaretThicknessForE2e?: (px: number) => void
    /** NYOZE_E2E: toggle pseudo caret blink at runtime. */
    setPseudoCaretBlinkEnabledForE2e?: (on: boolean) => void
    /** NYOZE_E2E: shorten chapter boundary auto-hide delay for tests. */
    chapterBoundaryHideDelayMs?: number
    setChapterBoundaryHideDelayMsForE2e?: (delayMs: number) => void
    /**
     * NYOZE_E2E: fetchAndPatchSavedStat の patchTab 直前で 1 回だけ止まる latch。
     * production は arm しない。
     */
    savedStatPatchHold?: {
      arm: () => boolean
      release: () => boolean
      snapshot: () => { armed: boolean; waiting: boolean }
    }
    /**
     * NYOZE_E2E: leave snapshot capture 後〜functional update 前で 1 回だけ止まる latch。
     * production は arm しない。
     */
    tabLeaveSnapshotApplyHold?: {
      arm: () => boolean
      release: () => boolean
      snapshot: () => { armed: boolean; waiting: boolean }
    }
    /**
     * NYOZE_E2E: baseline / 将来 PoC 共通の IME composition latency probe
     * (`docs/ime-composition-latency-probe.md`)。診断専用で、起動するまで
     * listener / PerformanceObserver / rAF / timer を作らない。
     */
    imeLatencyProbe?: {
      start: (options?: {
        mode?: string
        targetSelector?: string
        maxSamples?: number
        pendingTimeoutMs?: number
      }) =>
        | { ok: true; targetKind: string; mode: string }
        | { ok: false; error: string }
      stop: (reason?: string) => boolean
      reset: (reason?: string) => boolean
      snapshot: () =>
        | import('../src/editor-core/features/imeCompositionLatencyStats').ImeCompositionLatencyReport
        | null
      report: (options?: { pendingTimeoutMs?: number }) => Promise<
        | import('../src/editor-core/features/imeCompositionLatencyStats').ImeCompositionLatencyReport
        | null
      >
      destroy: (reason?: string) => boolean
      isActive: () => boolean
    }
  }
  __NYOZE_PP_PROFILE__?: Array<{
    op: 'click-switch' | 'enter-reentry' | 'arrow-switch'
    phase: string
    ms: number
    meta?: string
    ts: number
  }>
  __NYOZE_ENABLE_PP_PROFILER__?: boolean
  __nyozeParagraphPlainProfiler?: {
    isEnabled(): boolean
    getSamples(): NonNullable<Window['__NYOZE_PP_PROFILE__']>
    clear(): void
    getSessions(): Array<NonNullable<Window['__NYOZE_PP_PROFILE__']>>
    cancelActiveSession(reason?: string): void
  }
  /** Internal Paragraph Plain experiment flags (localStorage); not user-facing. */
  __nyozeParagraphPlainExperiments?: {
    getState(): {
      lightweight: boolean
      scrollRepositionDisabled: boolean
      reservedBlockSizeDisabled: boolean
      formalBehavior: 'fast' | 'comfortable'
    }
  }
}
