import type { BrowserWindow, IpcMainInvokeEvent, MessageBoxOptions, MessageBoxReturnValue, WebContents } from 'electron'
import { validateNameArg } from './ipcSecurity'

/** Windows の window.confirm 終了後に renderer の文字入力 focus が失われるため、
 * File Explorer の削除確認だけを sender の native parent 付き非同期 dialog にする。
 * window activation や text-input focus の再発行は行わない。
 */
export function createFileExplorerDeleteConfirmation(ports: {
  platform: string
  fromWebContents: (sender: WebContents) => BrowserWindow | null
  showMessageBox: (parent: BrowserWindow, options: MessageBoxOptions) => Promise<MessageBoxReturnValue>
}) {
  const pending = new WeakSet<WebContents>()
  return async (event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>, name: unknown): Promise<boolean> => {
    const sender = event.sender
    if (ports.platform !== 'win32' || !validateNameArg(name) || sender.isDestroyed() || pending.has(sender)) return false
    if (event.senderFrame !== sender.mainFrame) return false
    const parent = ports.fromWebContents(sender)
    if (!parent || parent.isDestroyed() || parent.webContents !== sender || !parent.isVisible() || !parent.isFocused()) return false
    pending.add(sender)
    try {
      const result = await ports.showMessageBox(parent, {
        title: 'Nyoze',
        message: `「${name}」をゴミ箱に移動しますか？`,
        buttons: ['OK', 'キャンセル'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      return !sender.isDestroyed() && !parent.isDestroyed() && parent.webContents === sender && result.response === 0
    } catch {
      return false
    } finally {
      pending.delete(sender)
    }
  }
}
