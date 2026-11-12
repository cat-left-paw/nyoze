/**
 * PIS-S10-PREEDIT-DISPLAY1: 表示設定「入力」の、変換中の文字の表示（押し出す / 重ねる）。
 *
 * 新しい入力方式を使っているときだけ出す（出し分けは`InputSettingsSection`）。
 * 切り替えは次の変換から効く（入力面が`compositionstart`の時点の値で、その変換の間は固定する）。
 */
import type { ExperimentalInputSurfacePreeditDisplay } from "../../settings/types";
import type { UiTextKey, UiTextVariant } from "../i18n/uiText";

const OPTIONS: readonly { value: ExperimentalInputSurfacePreeditDisplay; key: UiTextKey }[] = [
  { value: "inline", key: "displaySettings.experimentalLocalIme.preeditDisplay.inline" },
  { value: "overlay", key: "displaySettings.experimentalLocalIme.preeditDisplay.overlay" },
];

export function InputSurfacePreeditDisplaySetting({
  value,
  onChange,
  t,
}: {
  value: ExperimentalInputSurfacePreeditDisplay;
  onChange: (next: ExperimentalInputSurfacePreeditDisplay) => void;
  t: (key: UiTextKey, variant?: UiTextVariant) => string;
}) {
  // 説明文が長いので、選択肢と説明文を見出しの下へ縦に並べる（右の列に置くと説明文が細い列に押し込まれる）。
  return (
    <div className="setting-item" data-testid="settings-experimental-preedit-display">
      <div className="setting-item-info">
        <div className="setting-item-name">
          {t("displaySettings.experimentalLocalIme.preeditDisplay")}
        </div>
        <div className="setting-options">
          {OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name="experimentalInputSurfacePreeditDisplay"
                data-testid={`settings-experimental-preedit-display-${option.value}`}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              {t(option.key)}
            </label>
          ))}
        </div>
        <div className="setting-item-desc">
          {t("displaySettings.experimentalLocalIme.preeditDisplay", "helper")}
        </div>
      </div>
    </div>
  );
}
