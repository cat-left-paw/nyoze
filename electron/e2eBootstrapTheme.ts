/**
 * E2E-UX1b: renderer の**初回 paint 前**に適用する theme bootstrap（pure）。
 *
 * settings.json への seed だけでは足りない。renderer の初期 state は同期的な
 * `loadUiTheme()` / `loadDocColorSettings()` で決まり、新しい userData では
 * localStorage が空なので既定 `mist`（明色）/ `DEFAULT_DOC_COLOR_SETTINGS`
 * （`pageColor: #e9e6e1` 等の明色）になる。settings.json は非同期 IPC で
 * 読まれるため、
 *
 *   native 暗色背景 → React 初期化 → `mist` / 明色 docColor → 非同期 read → dark
 *
 * という明色 flash が残り得る。**初版は theme enum だけを渡していたため
 * app chrome の flash しか塞げておらず、`docColorSettings` 由来のエディタ本文
 * surface の初回明色 paint を見逃していた。** そのため theme enum に加えて
 * 検証済みの document color も渡し、`ReactDOM.createRoot()` より前に同期適用する。
 *
 * 不変条件:
 * - 正本は `MAIN_E2E_ENABLED`（`NYOZE_E2E === "1"` かつ非 packaged）。
 *   packaged / 通常 development では **bootstrap 値自体を提供しない**。
 * - 渡すのは検証済み `Theme` / `DocumentTheme` の enum 2 つと、3 値そろった
 *   `#RRGGBB` の document color だけ。任意 settings・本文・パスは一切渡さない。
 * - `product-default`（env 未設定）では何もしない。
 */

import type { DocumentTheme, Theme } from "../src/settings/types";
import {
  normalizeDocumentTheme,
  normalizeTheme,
} from "../src/settings/themeUtils";

/** E2E 専用 env（main 側が読む）。E2E 無効時は main が削除する。 */
export const E2E_BOOTSTRAP_UI_THEME_ENV = "NYOZE_E2E_BOOTSTRAP_UI_THEME";
export const E2E_BOOTSTRAP_DOCUMENT_THEME_ENV =
  "NYOZE_E2E_BOOTSTRAP_DOCUMENT_THEME";
export const E2E_BOOTSTRAP_DOC_PAGE_COLOR_ENV =
  "NYOZE_E2E_BOOTSTRAP_DOC_PAGE_COLOR";
export const E2E_BOOTSTRAP_DOC_TEXT_COLOR_ENV =
  "NYOZE_E2E_BOOTSTRAP_DOC_TEXT_COLOR";
export const E2E_BOOTSTRAP_DOC_HEADING_COLOR_ENV =
  "NYOZE_E2E_BOOTSTRAP_DOC_HEADING_COLOR";

/** 全 bootstrap env（親 process からの継承を落とすときに使う）。 */
export const E2E_BOOTSTRAP_ENV_NAMES = [
  E2E_BOOTSTRAP_UI_THEME_ENV,
  E2E_BOOTSTRAP_DOCUMENT_THEME_ENV,
  E2E_BOOTSTRAP_DOC_PAGE_COLOR_ENV,
  E2E_BOOTSTRAP_DOC_TEXT_COLOR_ENV,
  E2E_BOOTSTRAP_DOC_HEADING_COLOR_ENV,
] as const;

/** `nyoze.docColorSettings` の既存保存形式と同じ 3 値。 */
export type E2eDocColorBootstrap = {
  pageColor: string;
  textColor: string;
  headingColor: string;
};

export type E2eThemeBootstrap = {
  uiTheme: Theme;
  documentTheme: DocumentTheme;
  /**
   * 3 値すべてが完全な `#RRGGBB` のときだけ非 null。
   * **一部欠落 / 不正値を補完・推測して受理しない**（group 単位で all-or-nothing）。
   * null のときは theme だけ適用し、document color は製品既定のままにする。
   */
  docColor: E2eDocColorBootstrap | null;
};

/** 完全な `#RRGGBB` だけを受理する（短縮形・名前付き色・関数記法は拒否）。 */
const FULL_HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function normalizeDocColorBootstrap(input: {
  pageColor: string | undefined | null;
  textColor: string | undefined | null;
  headingColor: string | undefined | null;
}): E2eDocColorBootstrap | null {
  const { pageColor, textColor, headingColor } = input;
  if (typeof pageColor !== "string") return null;
  if (typeof textColor !== "string") return null;
  if (typeof headingColor !== "string") return null;
  if (!FULL_HEX_COLOR.test(pageColor)) return null;
  if (!FULL_HEX_COLOR.test(textColor)) return null;
  if (!FULL_HEX_COLOR.test(headingColor)) return null;
  return { pageColor, textColor, headingColor };
}

/**
 * renderer へ渡す bootstrap 値を決める。
 *
 * - `e2eEnabled: false` → 常に `null`（packaged / 通常 development へ漏らさない）
 * - どちらかの enum が不正 / 未設定 → `null`（推測で片方だけ当てない）
 */
export function resolveE2eThemeBootstrap(input: {
  /** `MAIN_E2E_ENABLED`。 */
  e2eEnabled: boolean;
  uiTheme: string | undefined | null;
  documentTheme: string | undefined | null;
  pageColor?: string | undefined | null;
  textColor?: string | undefined | null;
  headingColor?: string | undefined | null;
}): E2eThemeBootstrap | null {
  if (!input.e2eEnabled) return null;
  const uiTheme = normalizeTheme(input.uiTheme);
  const documentTheme = normalizeDocumentTheme(input.documentTheme);
  if (!uiTheme || !documentTheme) return null;
  const docColor = normalizeDocColorBootstrap({
    pageColor: input.pageColor ?? null,
    textColor: input.textColor ?? null,
    headingColor: input.headingColor ?? null,
  });
  return { uiTheme, documentTheme, docColor };
}
