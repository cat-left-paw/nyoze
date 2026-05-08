import { DEFAULT_MACOS_ARROW_SCROLL_CLAMP_ENABLED } from './defaults'

export function normalizeMacosArrowScrollClampEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return DEFAULT_MACOS_ARROW_SCROLL_CLAMP_ENABLED
}
