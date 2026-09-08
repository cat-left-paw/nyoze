/**
 * LOCAL-WINDOW-PUBLIC-ENTRY1 / LOCAL-WINDOW-LINUX-OPTIN1:
 * 一般向け Experimental の **capability** gate（pure）。
 *
 * 位置づけ:
 * - これは「利用可能なplatformでユーザーが明示opt-inできる実験機能を **出してよいか**」だけを
 *   決める。`capable === true` は有効化ではない。実効有効化は
 *   `src/editor-core/features/localImeExperimentalPreviewState.ts` の pure policy が
 *   `capability × preference` から決め、preference の既定は必ず false である。
 * - 作者限定pilot（`electron/localImePilotGate.ts`）とは別のcapabilityで、同時に成立しない。
 * - platform判定はmain側の既存Local Window authorityだけを使う。
 * - `capable` は公式サポートを意味しない。Linux は available だが support tier は unsupported。
 *
 * 不変条件:
 * - `darwin | win32 | linux` で available。不明platformは false。
 * - 作者 pilot が available なら常に false（責務が混ざった状態を作らない）。
 * - dev / packagedで同じcapabilityを返すが、有効化は既定OFFのpersisted preferenceが正本。
 * - Pilot / PoC / E2E環境変数は製品capabilityにも有効化にも使わない。
 *
 * このモジュールは Electron / Node の API を呼ばず、main と unit test の双方から
 * 決定的に検証できる純粋関数だけを持つ。
 */

/** renderer が preload 越しに読む同期 channel。boolean 以外を返さない。 */
export const LOCAL_IME_EXPERIMENTAL_PREVIEW_CAPABILITY_CHANNEL =
  "localImeExperimentalPreview:isCapable";

/** Legacy E2E launch option。PUBLIC-ENTRY1の製品capability resolverは参照しない。 */
export const LOCAL_IME_EXPERIMENTAL_PREVIEW_TEST_CAPABILITY_ENV =
  "NYOZE_LOCAL_IME_EXPERIMENTAL_PREVIEW_TEST_CAPABILITY";

import { resolveLocalImeLocalWindowPlatformPolicy } from "./localImePilotGate";

export type LocalImeExperimentalPreviewCapabilityReason =
  /** Local Window を runtime として出せない platform。 */
  | "platform-unavailable"
  /** 作者限定 pilot が available。Preview capability とは排他。 */
  | "author-pilot-active"
  /** main authority が runtime 利用可能と認めた platform。dev/package共通。公式サポートではない。 */
  | "available-platform"
  /** Legacy reason。PUBLIC-ENTRY1 resolverは返さない。 */
  | "test-launch-boundary"
  /** Legacy reason。PUBLIC-ENTRY1 resolverは返さない。 */
  | "not-packaged";

export type LocalImeExperimentalPreviewCapability = {
  capable: boolean;
  reason: LocalImeExperimentalPreviewCapabilityReason;
};

export function resolveLocalImeExperimentalPreviewCapability(input: {
  /** `process.platform`。 */
  platform: string;
  /** `app.isPackaged`。 */
  isPackaged: boolean;
  /** `resolveLocalImePilotAvailability()` の結果。 */
  authorPilotAvailable: boolean;
  /** `MAIN_E2E_ENABLED`（`NYOZE_E2E === "1"` かつ非 packaged）。 */
  e2eEnabled: boolean;
  /** `process.env[LOCAL_IME_EXPERIMENTAL_PREVIEW_TEST_CAPABILITY_ENV]`。 */
  testCapabilityFlagValue: string | undefined | null;
}): LocalImeExperimentalPreviewCapability {
  if (!resolveLocalImeLocalWindowPlatformPolicy(input.platform).available) {
    return { capable: false, reason: "platform-unavailable" };
  }
  // 作者 pilot と製品 Preview を同時に成立させない（pure policy 上の排他）。
  if (input.authorPilotAvailable) {
    return { capable: false, reason: "author-pilot-active" };
  }
  // PUBLIC-ENTRY1: ordinary development and packaged builds share the same
  // main-process platform authority. Environment flags are deliberately not
  // consulted; persisted preference (default OFF) is the enable authority.
  return { capable: true, reason: "available-platform" };
}
