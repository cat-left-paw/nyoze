import {
  DEFAULT_AUTO_TCY_ENABLED,
  DEFAULT_AUTO_TCY_NUMBERS_ONLY,
  resolveAutoTcyDigitRange,
  type AutoTcyDigitRange,
} from './autoTcy'

export type AutoTcyRuntimeOptions = {
  enabled: boolean
  numbersOnly: boolean
  minDigits: number
  maxDigits: number
}

export type AutoTcyRefreshPayload = {
  enabled: boolean
  numbersOnly: boolean
  minDigits: number
  maxDigits: number
}

export type AutoTcyRefreshRequest = {
  payload: AutoTcyRefreshPayload
  addToHistory: false
}

export type AutoTcyRuntimeController = {
  isEnabled(): boolean
  getNumbersOnly(): boolean
  getDigitRange(): AutoTcyDigitRange
  getExtensionOptions(beginPerfSpan: () => (() => void) | null): {
    isEnabled: () => boolean
    getNumbersOnly: () => boolean
    getDigitRange: () => AutoTcyDigitRange
    beginPerfSpan: () => (() => void) | null
  }
  setOptions(options: AutoTcyRuntimeOptions): AutoTcyRefreshRequest | null
}

export function createAutoTcyRuntimeController(): AutoTcyRuntimeController {
  let enabled = DEFAULT_AUTO_TCY_ENABLED
  let numbersOnly = DEFAULT_AUTO_TCY_NUMBERS_ONLY
  let digitRange = resolveAutoTcyDigitRange()

  const isEnabled = () => enabled
  const getNumbersOnly = () => numbersOnly
  const getDigitRange = () => digitRange

  return {
    isEnabled,
    getNumbersOnly,
    getDigitRange,
    getExtensionOptions(beginPerfSpan) {
      return { isEnabled, getNumbersOnly, getDigitRange, beginPerfSpan }
    },
    setOptions(options) {
      const nextDigitRange = resolveAutoTcyDigitRange(options)
      const nextNumbersOnly = options.numbersOnly === true
      const changed =
        enabled !== options.enabled ||
        numbersOnly !== nextNumbersOnly ||
        digitRange.minDigits !== nextDigitRange.minDigits ||
        digitRange.maxDigits !== nextDigitRange.maxDigits

      if (!changed) return null

      enabled = options.enabled
      numbersOnly = nextNumbersOnly
      digitRange = nextDigitRange
      return {
        payload: {
          enabled,
          numbersOnly,
          minDigits: digitRange.minDigits,
          maxDigits: digitRange.maxDigits,
        },
        addToHistory: false,
      }
    },
  }
}
