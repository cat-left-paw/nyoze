/** HOSTINPUT-REARM1: DOM hintと実PM batchを結ぶimport-0 bounded token。 */
export type LocalImeHostInputSource = 'host-direct-input' | 'host-ime-input'

export type LocalImeHostInputCycleToken = {
  readonly source: LocalImeHostInputSource
  readonly cycleId: number
}
