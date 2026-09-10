/** File Explorer 削除専用。Windows で IPC が失敗しても問題の window.confirm へ戻さない。 */
export async function confirmFileExplorerDelete(
  name: string,
  bridge = window.nyozeBridge,
  browserConfirm = (message: string) => window.confirm(message),
): Promise<boolean> {
  try {
    if (bridge?.platform === 'win32') {
      return (await bridge.fileExplorer?.confirmDelete(name)) === true
    }
    return browserConfirm(`「${name}」をゴミ箱に移動しますか？`)
  } catch {
    return false
  }
}
