import { getInputPath, readInputStrategyCapability } from './inputPathRuntime'

/**
 * 起動時に決まる値: 製品の入口がPersistent Input Surfaceか（mainの固定値）。
 * 入力面を作ってよいか、`focus` commandの差し替えを登録するか、の判定に使う。
 */
export function isInputSurfaceCapable(): boolean {
  return readInputStrategyCapability().productStrategy === 'input-surface'
}

/** 実行中に変わる値: いまの入力の方式がPISか。入力面のeligibilityの条件。 */
export function isInputSurfacePathActive(): boolean {
  return getInputPath() === 'input-surface'
}
