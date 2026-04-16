export type RuntimePlatform = 'darwin' | 'win32' | 'linux' | 'unknown'

export function detectRuntimePlatform(): RuntimePlatform {
  const bridgePlatform = window.nyozeBridge?.platform
  if (bridgePlatform === 'darwin') return 'darwin'
  if (bridgePlatform === 'win32') return 'win32'
  if (bridgePlatform === 'linux') return 'linux'

  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }
  const navPlatform =
    (nav.userAgentData?.platform ?? navigator.platform ?? '').toLowerCase()
  const navUA = navigator.userAgent.toLowerCase()
  const source = `${navPlatform} ${navUA}`
  if (source.includes('mac')) return 'darwin'
  if (source.includes('win')) return 'win32'
  if (source.includes('linux')) return 'linux'
  return 'unknown'
}
