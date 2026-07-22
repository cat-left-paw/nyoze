import type { ProjectAssetPreviewState } from '../hooks/useProjectPanel'

/** preview 選択中の資料 absolutePath。idle のときだけ null。 */
export function getSelectedAssetPreviewPath(
  preview: ProjectAssetPreviewState,
): string | null {
  return preview.kind === 'idle' ? null : preview.absolutePath
}

/**
 * Project タブ索引エリアの空白クリックで preview を解除してよいか。
 * interactive / item / preview / divider 上では false。
 */
const PREVIEW_CLEAR_BLOCK_SELECTORS = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  '.project-pane-preview-section',
  '.project-pane-divider',
  '.project-pane-item',
  '.project-pane-unregistered-item',
  '.project-pane-materials-filter',
  '.project-pane-fold-toggle',
  '.project-pane-book-btn',
  '.project-pane-book-input',
  '.project-pane-book-select',
  '.project-pane-book-trigger',
  '.project-pane-book-edit-trigger',
  '.project-pane-create-button',
  '.project-pane-create-input',
  '.project-pane-create-cancel',
] as const

function isDomElement(target: EventTarget | null): target is Element {
  return (
    target !== null &&
    typeof target === 'object' &&
    'closest' in target &&
    typeof (target as Element).closest === 'function'
  )
}

export function shouldClearPreviewOnProjectPaneBackgroundClick(
  target: EventTarget | null,
): boolean {
  if (!isDomElement(target)) return false
  if (!target.closest('.project-pane-index')) return false
  for (const selector of PREVIEW_CLEAR_BLOCK_SELECTORS) {
    if (target.closest(selector)) return false
  }
  return true
}
