import type { ReactNode } from 'react'
import type { ExperimentalInputSurfacePreeditDisplay } from '../../settings/types'
import type { UiTextKey, UiTextVariant } from '../i18n/uiText'
import { InputSurfacePreeditDisplaySetting } from './InputSurfacePreeditDisplaySetting'

/** 製品の入力設定。classicInputOnは設定の希望値ではなく、実際の方式から受け取る。 */
export function InputSettingsSection({ heading, isOpen, classicInputOn, onChangeClassicInput, interactive, preeditDisplay, onChangePreeditDisplay, platform, t }: {
  heading: ReactNode
  isOpen: boolean
  classicInputOn: boolean
  onChangeClassicInput(next: boolean): void
  interactive: boolean
  preeditDisplay: ExperimentalInputSurfacePreeditDisplay
  onChangePreeditDisplay(next: ExperimentalInputSurfacePreeditDisplay): void
  platform: string
  t(key: UiTextKey, variant?: UiTextVariant): string
}) {
  return <div className="settings-section">
    {heading}
    {isOpen && <div className="settings-section-body" data-testid="settings-input">
      <div className="setting-item"><div className="setting-item-info">
        <label className="setting-checkbox-label">
          <input type="checkbox" data-testid="settings-classic-input-toggle" checked={classicInputOn} disabled={!interactive} onChange={e => onChangeClassicInput(e.target.checked)} />
          {t('displaySettings.classicInput.enabled')}
        </label>
        <div className="setting-item-desc setting-item-desc-multiline" data-testid="settings-classic-input-description">{t('displaySettings.classicInput.enabled', 'helper')}</div>
        {platform === 'linux' && <div className="setting-item-desc" data-testid="settings-input-linux">{t('displaySettings.input.linuxUnsupported')}</div>}
      </div></div>
      {!classicInputOn && <InputSurfacePreeditDisplaySetting value={preeditDisplay} onChange={onChangePreeditDisplay} t={t} />}
    </div>}
  </div>
}
