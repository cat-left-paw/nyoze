/**
 * PIS-S10-ENTRY1a: 入力の方式の **正本**（pure）。
 *
 * mainだけが判定し、rendererへは同期IPC 1 channelで固定値を渡す。rendererだけでは偽装できない。
 * - `productStrategy`: 製品の入口（「長文編集モード（実験的）」の設定）が選ぶ方式。
 *   `input-surface`はPersistent Input Surface、`local-window`は開発用の指定で戻したLocal Window、
 *   `none`は製品の入口なし（利用できないplatform、作者Pilot）。
 * - `authorPilot`: 作者Pilot（Local Windowの明示Start）。製品の入口と同時に成立しない。
 * - `forced`: 開発用の強制ON。設定によらずPISで動く。設定へ保存しない。
 *
 * これは「出してよいか」だけを決める。有効化はrendererのpureな決定関数
 * （`src/editor-core/features/inputPathDecision.ts`）が、この値と設定（既定OFF）から決める。
 *
 * 開発用の指定（`NYOZE_INPUT_SURFACE=1`、`NYOZE_INPUT_STRATEGY=local-window`）は非packagedだけで効く。
 * packagedではすべて無視する。作者Pilotと同時に指定された場合はPilotを優先する。
 * `productStrategy !== 'none'`は公式サポートを意味しない（Linuxは利用可能だがサポート対象外）。
 */
import {
  resolveLocalImeLocalWindowPlatformPolicy,
  resolveLocalImePilotAvailability,
} from "./localImePilotGate";

/** rendererがpreload越しに読む同期channel。{@link InputStrategyCapability}だけを返す。 */
export const INPUT_STRATEGY_CHANNEL = "inputStrategy:get";
/** 開発用の強制ON（非packaged、exact `"1"`）。 */
export const INPUT_SURFACE_ENV = "NYOZE_INPUT_SURFACE";
/** 開発用: 製品の入口をLocal Windowへ戻す（非packaged、exact `"local-window"`）。 */
export const INPUT_STRATEGY_ENV = "NYOZE_INPUT_STRATEGY";
export const INPUT_STRATEGY_LOCAL_WINDOW_VALUE = "local-window";
/** Legacy E2E launch option。どの判定にも使わない。mainが起動時に必ず落とす。 */
export const LOCAL_IME_EXPERIMENTAL_PREVIEW_TEST_CAPABILITY_ENV =
  "NYOZE_LOCAL_IME_EXPERIMENTAL_PREVIEW_TEST_CAPABILITY";

export type InputProductStrategy = "input-surface" | "local-window" | "none";
export type InputStrategyCapability = {
  productStrategy: InputProductStrategy;
  authorPilot: boolean;
  forced: boolean;
};

export const INPUT_STRATEGY_NONE: InputStrategyCapability = Object.freeze({
  productStrategy: "none",
  authorPilot: false,
  forced: false,
});

export function resolveInputStrategyCapability(input: {
  /** `process.platform`。 */
  platform: string;
  /** `app.isPackaged`。 */
  isPackaged: boolean;
  /** `process.env[LOCAL_IME_PILOT_ENV]`。 */
  pilotFlagValue: string | undefined | null;
  /** `process.env[INPUT_SURFACE_ENV]`。 */
  forceFlagValue: string | undefined | null;
  /** `process.env[INPUT_STRATEGY_ENV]`。 */
  strategyFlagValue: string | undefined | null;
}): InputStrategyCapability {
  const authorPilot = resolveLocalImePilotAvailability({
    isPackaged: input.isPackaged,
    flagValue: input.pilotFlagValue,
  });
  if (!resolveLocalImeLocalWindowPlatformPolicy(input.platform).available) {
    return { productStrategy: "none", authorPilot, forced: false };
  }
  // 作者Pilotと製品の入口を同時に成立させない。開発用の指定よりPilotを優先する。
  if (authorPilot) return { productStrategy: "none", authorPilot: true, forced: false };
  if (!input.isPackaged) {
    if (input.forceFlagValue === "1") {
      return { productStrategy: "input-surface", authorPilot: false, forced: true };
    }
    if (input.strategyFlagValue === INPUT_STRATEGY_LOCAL_WINDOW_VALUE) {
      return { productStrategy: "local-window", authorPilot: false, forced: false };
    }
  }
  return { productStrategy: "input-surface", authorPilot: false, forced: false };
}

/** preload / rendererが受け取った値の形を確かめる。形が違えば安全側（製品の入口なし）。 */
export function normalizeInputStrategyCapability(value: unknown): InputStrategyCapability {
  if (!value || typeof value !== "object") return INPUT_STRATEGY_NONE;
  const v = value as Record<string, unknown>;
  const strategy = v.productStrategy;
  if (strategy !== "input-surface" && strategy !== "local-window" && strategy !== "none") {
    return INPUT_STRATEGY_NONE;
  }
  if (typeof v.authorPilot !== "boolean" || typeof v.forced !== "boolean") return INPUT_STRATEGY_NONE;
  // 矛盾する組は受け取らない（Pilotと製品の入口、input-surface以外の強制ON）。
  if (v.authorPilot && strategy !== "none") return INPUT_STRATEGY_NONE;
  if (v.forced && strategy !== "input-surface") return INPUT_STRATEGY_NONE;
  return { productStrategy: strategy, authorPilot: v.authorPilot, forced: v.forced };
}
