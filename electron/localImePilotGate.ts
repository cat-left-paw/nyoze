/** Local Window author Pilot capability and platform authority. */

export const LOCAL_IME_PILOT_ENV = "NYOZE_LOCAL_IME_PILOT";
export const LOCAL_IME_PILOT_AVAILABILITY_CHANNEL = "localImePilot:isAvailable";

export function resolveLocalImePilotAvailability(input: {
  isPackaged: boolean;
  flagValue: string | undefined | null;
}): boolean {
  if (input.isPackaged) return false;
  return input.flagValue === "1";
}

/**
 * LOCAL-WINDOW-LINUX-OPTIN1: runtime で Local Window を出してよい platform。
 * 公式サポート対象ではない。support tier は
 * {@link resolveLocalImeLocalWindowPlatformPolicy} が正本。
 */
export const LOCAL_IME_LOCAL_WINDOW_AVAILABLE_PLATFORMS = [
  "darwin",
  "win32",
  "linux",
] as const;

export type LocalImeLocalWindowSupportTier = "supported" | "unsupported";

export type LocalImeLocalWindowPlatformPolicyReason =
  | "available-supported-darwin"
  | "available-supported-win32"
  | "available-unsupported-linux"
  | "unavailable";

export type LocalImeLocalWindowPlatformPolicy = {
  /** runtime capability。公式サポートではない。 */
  available: boolean;
  /** 公式サポート対象か。Linux は available でも unsupported。 */
  supportTier: LocalImeLocalWindowSupportTier;
  reason: LocalImeLocalWindowPlatformPolicyReason;
};

/**
 * Local Window の platform policy。main の `process.platform` だけを入力にする。
 *
 * `available` は設定 / toolbar を出してよいか（runtime capability）。
 * `supportTier` は公式サポート対象か。Linux を supported とは呼ばない。
 */
export function resolveLocalImeLocalWindowPlatformPolicy(
  platform: string,
): LocalImeLocalWindowPlatformPolicy {
  if (platform === "darwin") {
    return {
      available: true,
      supportTier: "supported",
      reason: "available-supported-darwin",
    };
  }
  if (platform === "win32") {
    return {
      available: true,
      supportTier: "supported",
      reason: "available-supported-win32",
    };
  }
  if (platform === "linux") {
    return {
      available: true,
      supportTier: "unsupported",
      reason: "available-unsupported-linux",
    };
  }
  return {
    available: false,
    supportTier: "unsupported",
    reason: "unavailable",
  };
}
