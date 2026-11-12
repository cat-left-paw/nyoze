/**
 * EDITOR-RUBY-OVERLAY-P1: Ruby Overlay は packaged を含むすべての起動で既定の表示。
 * 比較・診断のため、非 packaged の exact "0" だけ従来の DOM の読みに戻す。
 * main が起動時に 1 回だけ決め、同期 IPC で渡す。設定には保存せず、途中で切り替えない。
 */
export const RUBY_OVERLAY_ENV = "NYOZE_RUBY_OVERLAY";
export const RUBY_OVERLAY_CHANNEL = "rubyOverlay:get";
export type RubyOverlayReadingMode = "hidden";

export function resolveRubyOverlayMode(input: {
  isPackaged: boolean;
  flagValue: string | undefined | null;
}): RubyOverlayReadingMode | null {
  if (!input.isPackaged && input.flagValue === "0") return null;
  return "hidden";
}

export function resolveRubyOverlayEnabled(input: { isPackaged: boolean; flagValue: string | undefined | null }): boolean {
  return resolveRubyOverlayMode(input) !== null;
}
