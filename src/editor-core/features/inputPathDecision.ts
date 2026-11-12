/**
 * PIS-S10-ENTRY1a: 入力の方式（Persistent Input Surface / 従来の入力）を決めるpureな決定。
 *
 * 入力は、mainの固定値（`electron/inputStrategyGate.ts`）と、設定から読んだ希望の方式だけ。
 * DOM・Electron・storeに依存しない。**DEFAULT-ON1で変えるのは、`DEFAULT_INPUT_PATH`と
 * 設定の読み方（`readClassicInputPathPreference`）だけ**にする。
 */
export type InputPath = 'input-surface' | 'host'

export type InputStrategyCapabilityView = {
  readonly productStrategy: 'input-surface' | 'local-window' | 'none'
  readonly authorPilot: boolean
  readonly forced: boolean
  /** mainが起動時に読んだ互換設定。renderer生成前に確定する。 */
  readonly startupClassicInputEnabled?: boolean
}

export const INPUT_STRATEGY_CAPABILITY_NONE: InputStrategyCapabilityView = Object.freeze({
  productStrategy: 'none', authorPilot: false, forced: false,
})

/** 設定がない・不正のときは新しい方式。読み込み前の互換設定はmainから受け取る。 */
export const DEFAULT_INPUT_PATH: InputPath = 'input-surface'

/** rendererが受け取ったbridgeの値の形を確かめる。形が違えば製品の入口なし。 */
export function normalizeInputStrategyCapabilityView(value: unknown): InputStrategyCapabilityView {
  if (!value || typeof value !== 'object') return INPUT_STRATEGY_CAPABILITY_NONE
  const v = value as Record<string, unknown>
  const strategy = v.productStrategy
  if (strategy !== 'input-surface' && strategy !== 'local-window' && strategy !== 'none') return INPUT_STRATEGY_CAPABILITY_NONE
  if (typeof v.authorPilot !== 'boolean' || typeof v.forced !== 'boolean') return INPUT_STRATEGY_CAPABILITY_NONE
  if (v.authorPilot && strategy !== 'none') return INPUT_STRATEGY_CAPABILITY_NONE
  if (v.forced && strategy !== 'input-surface') return INPUT_STRATEGY_CAPABILITY_NONE
  return { productStrategy: strategy, authorPilot: v.authorPilot, forced: v.forced, ...(typeof v.startupClassicInputEnabled === 'boolean' ? { startupClassicInputEnabled: v.startupClassicInputEnabled } : {}) }
}

/** DEFAULT-ON1: trueだけが従来の入力。旧実験設定は製品の決定には使わない。 */
export function readClassicInputPathPreference(classicInputEnabled: unknown): InputPath | null {
  return classicInputEnabled === true ? 'host' : null
}

export type InputPathDecisionReason =
  | 'no-product-entry'
  | 'local-window-product-entry'
  | 'forced'
  | 'preference'
  | 'default'

export type InputPathDecision = {
  /** 設定から決まる、あるべき方式。実際の方式は`inputPathRuntime`が持つ。 */
  readonly path: InputPath
  /** 設定UI（checkbox・switch・状態icon）を出してよいか。 */
  readonly settingVisible: boolean
  /** 設定UIの操作が方式を変えるか。 */
  readonly settingInteractive: boolean
  readonly reason: InputPathDecisionReason
}

export function resolveInputPathDecision(input: {
  capability: InputStrategyCapabilityView
  /** 設定から読んだ希望の方式。なければnull。 */
  preferredPath: InputPath | null
  defaultPath?: InputPath
}): InputPathDecision {
  const { capability } = input
  if (capability.productStrategy === 'none') {
    return { path: 'host', settingVisible: false, settingInteractive: false, reason: 'no-product-entry' }
  }
  // 開発用の指定で製品の入口をLocal Windowへ戻した起動。PISは作らない。
  if (capability.productStrategy === 'local-window') {
    return { path: 'host', settingVisible: true, settingInteractive: true, reason: 'local-window-product-entry' }
  }
  if (capability.forced) {
    return { path: 'input-surface', settingVisible: true, settingInteractive: false, reason: 'forced' }
  }
  if (input.preferredPath) {
    return { path: input.preferredPath, settingVisible: true, settingInteractive: true, reason: 'preference' }
  }
  return { path: input.defaultPath ?? DEFAULT_INPUT_PATH, settingVisible: true, settingInteractive: true, reason: 'default' }
}
