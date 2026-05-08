import { contextBridge, ipcRenderer } from 'electron'
import type { UiLanguageMode } from '../src/settings/types'

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
  },
  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke('shell:openExternal', url) as Promise<boolean>,
  },
  menu: {
    openAppMenu: (uiLanguageMode: UiLanguageMode) =>
      ipcRenderer.invoke('menu:openAppMenu', uiLanguageMode) as Promise<void>,
    onMenuCommand: (callback: (command: string) => void) => {
      const channels = [
        'menu:new-document',
        'menu:open',
        'menu:save',
        'menu:save-as',
        'menu:view-settings',
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
  document: {
    // SEC-5: Notify main of the active file path before each document load.
    // Uses sendSync so main's activeDocumentDir is set before <img> tags fire nyoze-img:// requests.
    setActiveFilePath: (filePath: string | null) => {
      ipcRenderer.sendSync('document:setActiveFilePath', filePath)
    },
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
