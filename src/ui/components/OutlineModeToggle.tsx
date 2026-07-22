import { createUiTextGetter } from '../i18n/uiText'

/**
 * Outline 拡張: [現在の文書] / [Book全体] の表示切替トグル。
 *
 * Workspace を薄く保つため、小さな表示専用 component として切り出す。
 * 状態（outlineMode）は Workspace 側で保持し、ここは描画と通知のみを担う。
 */
export type OutlineMode = 'document' | 'book'

type OutlineModeToggleProps = {
  mode: OutlineMode
  onChange: (mode: OutlineMode) => void
  t: ReturnType<typeof createUiTextGetter>
}

export function OutlineModeToggle({ mode, onChange, t }: OutlineModeToggleProps) {
  return (
    <div className="outline-mode-toggle">
      <button
        type="button"
        className={`outline-mode-btn${mode === 'document' ? ' active' : ''}`}
        onClick={() => onChange('document')}
      >
        {t('workspace.outline.modeDocument')}
      </button>
      <button
        type="button"
        className={`outline-mode-btn${mode === 'book' ? ' active' : ''}`}
        onClick={() => onChange('book')}
      >
        {t('workspace.outline.modeBook')}
      </button>
    </div>
  )
}
