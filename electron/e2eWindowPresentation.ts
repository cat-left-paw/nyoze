/**
 * E2E-UX1: Electron E2E の window presentation policy（pure）。
 *
 * **状態: `background` mode は macOS で診断 No-Go・調査 park。**
 * 2026-07-31 の観測環境（macOS 15.7.7 arm64 / Electron 41.3.0）では、
 * `show: false` の BrowserWindow で Electron main process（`CrBrowserMain`）の
 * SIGSEGV が反復した。したがって **既定は `visible`（従来どおりの表示・focus 動作）**
 * とし、`background` は manual diagnostic からの明示指定でしか到達できない。
 * 既定 suite・npm script からは到達しない。詳細は `docs/work-log.md` の
 * E2E-UX1 節を参照。
 *
 * このモジュールは Electron / Node の API を一切呼ばない純粋な決定関数だけを
 * 持ち、main 側と test launcher 側の双方から決定的に検証できるようにする。
 *
 * 不変条件:
 * - **正本は常に `MAIN_E2E_ENABLED`（`NYOZE_E2E === "1"` かつ非 packaged）**。
 *   E2E 無効時は要求 mode に関わらず必ず production と同じ visible policy を返す。
 * - packaged build では絶対に有効化しない（呼び出し側が `e2eEnabled: false` を渡す）。
 * - **未指定 / malformed / 通常の E2E はすべて `visible`**。production・通常
 *   development・E2E visible のいずれも従来と完全に同じ表示・focus 動作になる。
 * - E2E-UX1b: E2E visible のときだけ初期 `backgroundColor` を暗色へ寄せる
 *   （表示・focus 意味論は不変）。production / packaged / 通常 development の
 *   外観は一切変えない。
 * - settings.json / preload / renderer bridge へは一切露出しない。
 */

/** E2E 専用 env（main 側が読む）。E2E 無効時は main が削除する。 */
export const E2E_WINDOW_MODE_ENV = "NYOZE_E2E_WINDOW_MODE";

export type E2eWindowMode = "background" | "visible";

/** production / 通常 development と同じ明色初期背景。 */
export const PRODUCTION_WINDOW_BACKGROUND_COLOR = "#f4f1e7";

/**
 * parked な background mode だけで使う暗色初期背景。
 * accidental presentation（何かの拍子に window が現れる）時に、
 * 夜間の白い点滅にならないようにするための防御。
 * 既定経路では使われない（既定は `visible`）。
 */
export const E2E_BACKGROUND_WINDOW_BACKGROUND_COLOR = "#101014";

/**
 * E2E-UX1b: **E2E visible mode だけ**で使う暗色初期背景。
 *
 * background 化（`show: false`）は SIGSEGV のため park のままで、通常 E2E は
 * visible（window が表示され OS focus も取る）。focus 奪取は未解決だが、
 * 起動のたびに明色 window が点く「白い点滅」は初期背景と既定テーマを暗色へ
 * 寄せることで軽減できる。
 *
 * 値は dark UI theme の実 `baseBg`（`src/settings/defaults.ts` の
 * `dark.baseBg`）と同一。renderer が dark theme を適用するまでの初期塗りが
 * 本文表示と連続するようにするためで、**production の既定テーマは変更しない**。
 */
export const E2E_VISIBLE_WINDOW_BACKGROUND_COLOR = "#22252c";

export type WindowPresentationPolicy = {
  /** 実効 mode。E2E 無効時は常に `visible`。 */
  mode: E2eWindowMode;
  /** `new BrowserWindow({ show })` へ渡す値。 */
  show: boolean;
  /** `new BrowserWindow({ backgroundColor })` へ渡す値。 */
  backgroundColor: string;
  /**
   * Page Viewer の reuse 時に `restore()` / `show()` / `focus()` を行ってよいか。
   * background mode では OS focus を要求しないため false。
   */
  allowReuseActivation: boolean;
};

/** 既知の mode 文字列だけを受理する（unknown / malformed は null）。 */
export function normalizeE2eWindowMode(
  value: string | undefined | null,
): E2eWindowMode | null {
  if (value === "background") return "background";
  if (value === "visible") return "visible";
  return null;
}

/** production / packaged / 通常 development。従来と完全に同一。 */
const PRODUCTION_VISIBLE_POLICY: WindowPresentationPolicy = {
  mode: "visible",
  show: true,
  backgroundColor: PRODUCTION_WINDOW_BACKGROUND_COLOR,
  allowReuseActivation: true,
};

/**
 * E2E-UX1b: E2E visible mode。表示・focus 意味論は production と同一で、
 * 初期 backgroundColor だけを暗色へ寄せる。
 */
const E2E_VISIBLE_POLICY: WindowPresentationPolicy = {
  mode: "visible",
  show: true,
  backgroundColor: E2E_VISIBLE_WINDOW_BACKGROUND_COLOR,
  allowReuseActivation: true,
};

const BACKGROUND_POLICY: WindowPresentationPolicy = {
  mode: "background",
  show: false,
  backgroundColor: E2E_BACKGROUND_WINDOW_BACKGROUND_COLOR,
  allowReuseActivation: false,
};

/**
 * main / Page Viewer 双方の window 生成へ適用する policy を決める。
 *
 * - `e2eEnabled: false`（production / packaged / 通常 development）→ 常に
 *   production visible policy（`show: true` + 明色 `#f4f1e7`）。
 *   要求 mode は完全に無視するので、E2E 用の暗色が製品へ漏れることはない。
 * - `e2eEnabled: true` + `background` → parked hidden policy。
 * - `e2eEnabled: true` + `visible` / 未指定 / malformed → E2E visible policy
 *   （`show: true` のまま初期背景だけ暗色。E2E-UX1b）。
 */
export function resolveWindowPresentationPolicy(input: {
  /** `MAIN_E2E_ENABLED`（`NYOZE_E2E === "1"` かつ `!app.isPackaged`）。 */
  e2eEnabled: boolean;
  /** `process.env[E2E_WINDOW_MODE_ENV]`。 */
  requestedMode: string | undefined | null;
}): WindowPresentationPolicy {
  if (!input.e2eEnabled) return PRODUCTION_VISIBLE_POLICY;
  const mode = normalizeE2eWindowMode(input.requestedMode);
  if (mode === "background") return BACKGROUND_POLICY;
  return E2E_VISIBLE_POLICY;
}

/**
 * test launcher 側（`launchNyoze()`）で、実際に main へ渡す mode を決める。
 *
 * - **既定は `visible`**。通常の Electron E2E は従来どおり表示・focus する。
 * - `background` は spec が明示的に要求したときだけ。現状これを使うのは
 *   manual diagnostic の
 *   `tests/e2e/e2e-background-window-mode-diagnostic.spec.ts` のみで、
 *   通常 config・共用 diagnostic config のどちらからも到達せず、
 *   専用 `playwright.unsafe-diagnostic.config.ts` と
 *   `NYOZE_RUN_UNSAFE_BACKGROUND_DIAGNOSTIC=1` が揃ったときだけ実行される。
 *
 * malformed な要求は無視して既定（`visible`）へ倒す。
 */
export function resolveLaunchWindowMode(input: {
  /** spec が `launchNyoze({ windowMode })` で明示した値。 */
  requested?: E2eWindowMode | undefined;
}): E2eWindowMode {
  const requested = normalizeE2eWindowMode(input.requested);
  if (requested) return requested;
  return "visible";
}
