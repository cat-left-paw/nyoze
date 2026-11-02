export type InputSurfaceDocumentShortcut = 'save' | 'save-as' | 'quit' | null

/**
 * macOSの実IME中はmenu acceleratorが起動しない。入力面ownerのキーだけを分類する。
 * Cmd+Wは対象にしない（MacのメニューにCmd+Wの「閉じる」がなく、変換中も変換していないときも何もしない。APP-WINDOWS-CTRL-W1）。
 */
export function classifyInputSurfaceDocumentShortcut(input: {
  key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean
}): InputSurfaceDocumentShortcut {
  if (!input.metaKey || input.ctrlKey || input.altKey) return null
  switch (input.key.toLowerCase()) {
    case 's': return input.shiftKey ? 'save-as' : 'save'
    case 'q': return input.shiftKey ? null : 'quit'
    default: return null
  }
}
