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
      openAppMenu: (uiLanguageMode: import('../src/settings/types').UiLanguageMode) => Promise<void>
      onMenuCommand: (callback: (command: string) => void) => () => void
    }
    document: {
      /** SEC-5: Notify main of the active file path before each document load. */
      setActiveFilePath(filePath: string | null): void
    }
    appState: {
      setDocumentDirty: (dirty: boolean) => Promise<boolean>
      onRequestSaveBeforeClose: (callback: (requestId: number) => void) => () => void
      reportSaveBeforeClose: (requestId: number, ok: boolean) => void
    }
    e2e?: {
      readDocumentFixture: (filePath: string) => Promise<{
        content: string
        savedStat: { mtimeMs: number; size: number } | null
      } | null>
      establishWorkspaceRoot: (dirPath: string) => Promise<string | null>
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
    loadFileIntoActiveTab: (
      filePath: string,
    ) => Promise<"loaded" | "activated-existing" | "cancelled" | false>
    openFileInNewTab: (
      filePath: string,
    ) => Promise<'added' | 'tab-limit' | 'cancelled' | false>
    openShortcutReferenceDoc?: () => Promise<
      'added' | 'tab-limit' | 'cancelled' | false
    >
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
