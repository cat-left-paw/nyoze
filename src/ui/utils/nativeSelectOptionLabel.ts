/**
 * Windows の native `<select>` は選択中項目のチェックマークが出ないことがあるため、
 * 選択中のみ表示用ラベルへプレフィックスを付ける。macOS ではネイティブ表示と二重にならないよう付けない。
 */
export const NATIVE_SELECT_SELECTED_PREFIX = "\u2713 ";

export function shouldShowSelectedOptionPrefix(platform: string): boolean {
  return platform === "win32";
}

export function formatNativeSelectOptionLabel(
  label: string,
  isSelected: boolean,
  platform: string,
): string {
  if (!shouldShowSelectedOptionPrefix(platform) || !isSelected) {
    return label;
  }
  return `${NATIVE_SELECT_SELECTED_PREFIX}${label}`;
}
