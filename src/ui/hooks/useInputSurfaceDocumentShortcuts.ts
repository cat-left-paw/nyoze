import { useEffect } from 'react'
import { isInputSurfaceCapable } from '../../editor-core/features/inputSurface/inputSurfaceGate'
import { isInputSurfaceComposing } from '../../editor-core/features/inputSurface/documentAction'
import { classifyInputSurfaceDocumentShortcut } from '../../editor-core/features/inputSurface/documentShortcut'
import { requestLocalImeDocumentAction } from '../../editor-core/features/localImeDocumentActionBarrier'

/** 変換中にmacOS menu acceleratorが抑止されるS6のOS観測だけを補う。 */
export function useInputSurfaceDocumentShortcuts(save: (saveAs: boolean) => void): void {
  useEffect(() => {
    if (!isInputSurfaceCapable()) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isInputSurfaceComposing()) return
      if (!(document.activeElement instanceof HTMLElement) || document.activeElement.dataset.nyozeInputSurface !== 'true') return
      const shortcut = classifyInputSurfaceDocumentShortcut(event)
      if (!shortcut) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (shortcut === 'save' || shortcut === 'save-as') save(shortcut === 'save-as')
      else requestLocalImeDocumentAction('app-quit')
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [save])
}
