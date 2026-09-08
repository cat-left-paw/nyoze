/**
 * APP-WINDOW-BOUNDS-RESTORE1: メイン Editor window の起動 bounds 決定と
 * 前回終了時 state の復元を担う純粋関数群。
 *
 * このモジュールは Electron / Node の API を一切呼ばない。main process 側は
 * `screen` から読んだ work area と、userData 上の `window-state.json` の生文字列を
 * 渡すだけで、display 選択・validation・clamp・中央配置はすべてここで決まる。
 * そのため小型・高DPI環境（例: Windows FHD 150% の論理 1280x720 / work area 1280x680）
 * の判定を実値 unit test で決定的に確認できる。
 *
 * 不変条件:
 * - 座標・サイズはすべて DIP（Electron `screen` / `BrowserWindow` と同じ単位）。
 *   物理解像度や scaleFactor はここへ持ち込まない。
 * - 起動時は原則として window 全体が対象 display の `workArea` 内に収まる。
 *   「一部だけ見えていれば良い」とはしない。
 * - work area が最小サイズより小さい場合は、最小サイズより work area 内配置を優先する
 *   （effective minimum を work area まで引き下げる）。
 * - 保存 state が壊れている / 未知 version / 非有限 / 非正 / 過大なら採用せず、
 *   初回起動規則（primary display 中央配置）へ fail-safe する。
 * - 最大化は「通常時 bounds」とは別に持つ。最大化中の bounds を通常 bounds として
 *   保存しない（呼び出し側が `getNormalBounds()` を渡す前提）。
 * - 最小化・fullscreen は復元対象外。ここでは扱わない。
 */

/** userData 直下の window state ファイル名。 */
export const WINDOW_STATE_FILE_NAME = "window-state.json";

/** 保存 schema の既知 version。これ以外は採用しない。 */
export const WINDOW_STATE_VERSION = 1;

/** 保存値なしのときに目標とする既定サイズ。 */
export const DEFAULT_WINDOW_SIZE: WindowSize = { width: 1400, height: 900 };

/**
 * 通常環境での最小サイズ。work area がこれより小さい場合だけ、
 * `resolveEffectiveMinimumSize()` が work area まで引き下げる。
 */
export const MINIMUM_WINDOW_SIZE: WindowSize = { width: 900, height: 600 };

/** 明らかに不正な保存値を弾くための上限（DIP）。 */
export const MAX_WINDOW_DIMENSION = 32_000;
/** 座標の絶対値上限（DIP）。負座標 display があるので符号は問わない。 */
export const MAX_WINDOW_COORDINATE = 100_000;

export type WindowRect = { x: number; y: number; width: number; height: number };
export type WindowSize = { width: number; height: number };

/** `screen.getAllDisplays()` から main が写し取る最小限の情報。 */
export type DisplayWorkArea = {
  id: number;
  /** taskbar / dock を除いた作業領域（DIP）。画面全体 bounds ではない。 */
  workArea: WindowRect;
  isPrimary: boolean;
};

/** `window-state.json` の内容。 */
export type PersistedWindowState = {
  version: number;
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
};

/** main が in-memory に保持する通常時 state。 */
export type WindowRuntimeState = {
  /** 通常時（非最大化・非最小化・非fullscreen）の bounds。未取得なら null。 */
  normalBounds: WindowRect | null;
  maximized: boolean;
};

export type StartupWindowBounds = {
  /** `new BrowserWindow()` へ渡す通常時 bounds。 */
  bounds: WindowRect;
  /** true なら window 生成後に `maximize()` する。 */
  maximized: boolean;
  /** `new BrowserWindow()` へ渡す `minWidth` / `minHeight`。 */
  minimumSize: WindowSize;
  /** 選択した display の id。display 情報が無ければ null。 */
  targetDisplayId: number | null;
  /** 保存 state を採用したか（false なら初回起動規則）。 */
  restoredFromSavedState: boolean;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** 有限・正サイズの矩形か。 */
export function isValidWindowRect(value: unknown): value is WindowRect {
  if (!value || typeof value !== "object") return false;
  const rect = value as Partial<WindowRect>;
  if (!isFiniteNumber(rect.x) || !isFiniteNumber(rect.y)) return false;
  if (!isFiniteNumber(rect.width) || !isFiniteNumber(rect.height)) return false;
  if (rect.width <= 0 || rect.height <= 0) return false;
  return true;
}

function roundRect(rect: WindowRect): WindowRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

/**
 * 丸めたうえで「有限・正サイズ」を再証明する。
 *
 * `width: 0.4` のような正の小数は `isValidWindowRect()` を通過するが、
 * `Math.round()` 後は 0 になる。整数 bounds を返す通常の Electron では起こらないが、
 * 「非正サイズは採用しない」fail-safe 契約を丸めの後でも成立させるため、
 * 採用値を作る経路はすべてここを通す。
 */
function toValidRoundedRect(value: unknown): WindowRect | null {
  if (!isValidWindowRect(value)) return null;
  const rounded = roundRect(value);
  if (!isValidWindowRect(rounded)) return null;
  return rounded;
}

function isWithinSanityLimits(rect: WindowRect): boolean {
  if (rect.width > MAX_WINDOW_DIMENSION || rect.height > MAX_WINDOW_DIMENSION) return false;
  if (Math.abs(rect.x) > MAX_WINDOW_COORDINATE) return false;
  if (Math.abs(rect.y) > MAX_WINDOW_COORDINATE) return false;
  return true;
}

/**
 * 未知の値を `PersistedWindowState` として受理できるか検証する。
 * object / 既知 version / 有限 x,y,width,height / 正の width,height /
 * boolean maximized / 過大値でないこと、をすべて満たす場合だけ返す。
 */
export function normalizePersistedWindowState(value: unknown): PersistedWindowState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== WINDOW_STATE_VERSION) return null;
  if (typeof raw.maximized !== "boolean") return null;
  const rounded = toValidRoundedRect({
    x: raw.x,
    y: raw.y,
    width: raw.width,
    height: raw.height,
  });
  if (!rounded) return null;
  if (!isWithinSanityLimits(rounded)) return null;
  return {
    version: WINDOW_STATE_VERSION,
    ...rounded,
    maximized: raw.maximized,
  };
}

/**
 * `window-state.json` の生文字列を検証済み state へ変換する。
 * 破損 JSON / 未読み込み（null）/ 不正内容はすべて null（＝保存値なし扱い）。
 */
export function parseWindowStateJson(raw: string | null | undefined): PersistedWindowState | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return normalizePersistedWindowState(parsed);
}

/** in-memory の通常時 state を保存 schema へ変換する（不正なら null で書かない）。 */
export function buildWindowStateForPersist(
  runtime: WindowRuntimeState,
): PersistedWindowState | null {
  const rounded = toValidRoundedRect(runtime.normalBounds);
  if (!rounded) return null;
  if (!isWithinSanityLimits(rounded)) return null;
  return {
    version: WINDOW_STATE_VERSION,
    ...rounded,
    maximized: runtime.maximized === true,
  };
}

function rectsEqual(a: WindowRect | null, b: WindowRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * resize / move / maximize / unmaximize / close 時の観測値から in-memory state を更新する。
 *
 * - 最小化中・fullscreen 中は通常時 state を一切更新しない（最大化 bounds や
 *   fullscreen bounds を通常 bounds として保存しないための fail-safe）。
 * - `normalBounds` が不正なら直前の通常 bounds を保持する。最大化中でも
 *   通常 bounds を失わない。
 * - 変化が無ければ `prev` をそのまま返す（呼び出し側の dirty 判定用）。
 */
export function reduceWindowRuntimeState(
  prev: WindowRuntimeState,
  event: {
    /** `BrowserWindow.getNormalBounds()` の観測値。 */
    normalBounds: WindowRect | null | undefined;
    maximized: boolean;
    minimized: boolean;
    fullScreen: boolean;
  },
): WindowRuntimeState {
  if (event.minimized || event.fullScreen) return prev;
  // 丸めた後に 0 サイズになる観測値も「不正」として直前 bounds を保持する。
  const nextBounds = toValidRoundedRect(event.normalBounds) ?? prev.normalBounds;
  const nextMaximized = event.maximized === true;
  if (nextMaximized === prev.maximized && rectsEqual(nextBounds, prev.normalBounds)) {
    return prev;
  }
  return { normalBounds: nextBounds, maximized: nextMaximized };
}

/** 2矩形の交差面積（DIP^2）。交差しなければ 0。 */
export function rectIntersectionArea(a: WindowRect, b: WindowRect): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

/** work area が有限・正の display だけを残す。 */
export function normalizeDisplayWorkAreas(displays: readonly DisplayWorkArea[]): DisplayWorkArea[] {
  const normalized: DisplayWorkArea[] = [];
  for (const display of displays) {
    if (!display) continue;
    // 丸めて 0 サイズになる work area も候補から外す。
    const workArea = toValidRoundedRect(display.workArea);
    if (!workArea) continue;
    normalized.push({ id: display.id, workArea, isPrimary: display.isPrimary === true });
  }
  return normalized;
}

function pickPrimaryDisplay(displays: readonly DisplayWorkArea[]): DisplayWorkArea | null {
  if (displays.length === 0) return null;
  return displays.find((display) => display.isPrimary) ?? displays[0];
}

/**
 * 保存 bounds を復元する display を決める。
 *
 * 1. 保存 bounds との交差面積が最大の display
 * 2. 交差する display が無ければ primary display
 *
 * monitor 名や display id は永続 authority にしない。取り外された外部 monitor 上の
 * 保存座標は交差 0 になるので primary へ落ちる。
 */
export function selectTargetDisplay(
  bounds: WindowRect | null,
  displays: readonly DisplayWorkArea[],
): DisplayWorkArea | null {
  const normalized = normalizeDisplayWorkAreas(displays);
  if (normalized.length === 0) return null;
  if (!bounds || !isValidWindowRect(bounds)) return pickPrimaryDisplay(normalized);
  let best: DisplayWorkArea | null = null;
  let bestArea = 0;
  for (const display of normalized) {
    const area = rectIntersectionArea(bounds, display.workArea);
    if (area > bestArea) {
      best = display;
      bestArea = area;
    }
  }
  return best ?? pickPrimaryDisplay(normalized);
}

/**
 * 実効最小サイズ。work area が通常最小サイズより小さい環境では、最小サイズ自体が
 * 画面内配置を不可能にしないよう work area まで引き下げる。
 */
export function resolveEffectiveMinimumSize(
  workArea: WindowRect,
  minimumSize: WindowSize = MINIMUM_WINDOW_SIZE,
): WindowSize {
  return {
    width: Math.max(1, Math.min(Math.round(minimumSize.width), Math.round(workArea.width))),
    height: Math.max(1, Math.min(Math.round(minimumSize.height), Math.round(workArea.height))),
  };
}

/**
 * bounds を work area 内へ収める。
 * サイズは実効最小サイズ以上・work area 以下、位置は window 全体が work area 内。
 * taskbar が上下左右どこにあっても `workArea.x / y / width / height` が正本。
 */
export function clampBoundsToWorkArea(
  bounds: WindowRect,
  workArea: WindowRect,
  minimumSize: WindowSize = MINIMUM_WINDOW_SIZE,
): WindowRect {
  const area = roundRect(workArea);
  const min = resolveEffectiveMinimumSize(area, minimumSize);
  const width = clamp(Math.round(bounds.width), min.width, area.width);
  const height = clamp(Math.round(bounds.height), min.height, area.height);
  const x = clamp(Math.round(bounds.x), area.x, area.x + area.width - width);
  const y = clamp(Math.round(bounds.y), area.y, area.y + area.height - height);
  return { x, y, width, height };
}

/** work area 内でサイズを中央配置する（初回起動規則）。 */
export function centerSizeInWorkArea(size: WindowSize, workArea: WindowRect): WindowRect {
  const area = roundRect(workArea);
  // 丸めた結果が 0 にならないよう、どの経路でも最低 1 DIP を保証する。
  const width = Math.max(1, Math.min(Math.round(size.width), area.width));
  const height = Math.max(1, Math.min(Math.round(size.height), area.height));
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  };
}

/**
 * 起動時に `new BrowserWindow()` へ渡す bounds / minimum size / 最大化フラグを決める。
 *
 * 保存値なし: primary display の work area 内で既定サイズを上限に縮小し中央配置。
 * 保存値あり: 交差最大 display（無ければ primary）の work area へ clamp し、
 *             最大化フラグだけ別に返す（通常 bounds は最大化中も保持する）。
 */
export function resolveStartupWindowBounds(input: {
  saved: PersistedWindowState | null;
  displays: readonly DisplayWorkArea[];
  defaultSize?: WindowSize;
  minimumSize?: WindowSize;
}): StartupWindowBounds {
  const defaultSize = input.defaultSize ?? DEFAULT_WINDOW_SIZE;
  const minimumSize = input.minimumSize ?? MINIMUM_WINDOW_SIZE;
  const displays = normalizeDisplayWorkAreas(input.displays);
  const saved = input.saved ? normalizePersistedWindowState(input.saved) : null;

  if (displays.length === 0) {
    // display 情報が取れない異常系。既定サイズを原点付近へ置く以上のことはしない。
    return {
      bounds: { x: 0, y: 0, ...roundSize(defaultSize) },
      maximized: saved?.maximized === true,
      minimumSize: roundSize(minimumSize),
      targetDisplayId: null,
      restoredFromSavedState: saved != null,
    };
  }

  const savedBounds: WindowRect | null = saved
    ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
    : null;
  const target = selectTargetDisplay(savedBounds, displays) ?? displays[0];
  const workArea = target.workArea;
  const effectiveMinimum = resolveEffectiveMinimumSize(workArea, minimumSize);

  const bounds = savedBounds
    ? clampBoundsToWorkArea(savedBounds, workArea, minimumSize)
    : clampBoundsToWorkArea(
        centerSizeInWorkArea(defaultSize, workArea),
        workArea,
        minimumSize,
      );

  return {
    bounds,
    maximized: saved?.maximized === true,
    minimumSize: effectiveMinimum,
    targetDisplayId: target.id,
    restoredFromSavedState: savedBounds != null,
  };
}

/** 丸めた結果が 0 にならないよう最低 1 DIP を保証する。 */
function roundSize(size: WindowSize): WindowSize {
  return {
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
  };
}
