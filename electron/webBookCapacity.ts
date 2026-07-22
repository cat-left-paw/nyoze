/**
 * WB-IMG-3A: main-side Web Book capacity evaluation.
 *
 * Size measurements are authoritative only here (or in callers that pass
 * already-materialized UTF-8 byte lengths / registry.assets). The renderer
 * never measures image bytes, hashes, or realpaths.
 *
 * Soft-warning confirmation does not bypass SEC-5, per-image 25 MiB, or the
 * single-HTML 100 MiB hard cap — those always re-run on every export attempt.
 */

import type { WebBookOutputProfile } from "../src/editor-core/export/webBookAssetPlan";
import type { ResolvedWebBookAssetRegistry } from "./webBookAssetResolution";
import {
  MAX_WEB_BOOK_HTML_BYTES,
  WEB_BOOK_IMAGE_WARN_BYTES,
} from "./webBookAssetResolution";

const MIB = 1024 * 1024;

export { WEB_BOOK_IMAGE_WARN_BYTES };
/** Soft warn: single HTML final UTF-8 size above this (hard reject at 100 MiB). */
export const WEB_BOOK_SINGLE_HTML_WARN_BYTES = 50 * MIB;
/** Soft warn: package unique image byte total above this. */
export const WEB_BOOK_PACKAGE_ASSET_WARN_BYTES = 200 * MIB;
/** Soft warn: package unique image count above this. */
export const WEB_BOOK_PACKAGE_ASSET_WARN_COUNT = 1000;

/**
 * Safe display row for a unique asset over the soft image size threshold.
 * Same boundary as `WebBookAssetFailure`: no absolute path / hash / staging.
 */
export type WebBookCapacityLargeImage = {
  originLabel: string;
  rawSrc: string;
  byteLength: number;
};

export type WebBookCapacityReport = {
  requestedProfile: WebBookOutputProfile;
  /** Present only for `singleHtml` (actual materialized UTF-8 length). */
  singleHtmlByteLength?: number;
  /** Dedupe-after unique asset byte total (always from registry.assets). */
  packageAssetByteTotal: number;
  /** Dedupe-after unique asset count. */
  packageAssetCount: number;
  largeImages: readonly WebBookCapacityLargeImage[];
  largeImageWarn: boolean;
  /** `singleHtml` only: 50 MiB < size ≤ 100 MiB. */
  singleHtmlStrongWarn: boolean;
  packageSizeWarn: boolean;
  packageCountWarn: boolean;
  /** True when any soft warning applies for the requested profile. */
  needsSoftConfirm: boolean;
};

export type EvaluateWebBookCapacityInput = {
  profile: WebBookOutputProfile;
  /** Required for `singleHtml`; ignored for package hard-cap decisions. */
  htmlByteLength?: number;
  registry: ResolvedWebBookAssetRegistry;
  largeImages: readonly WebBookCapacityLargeImage[];
};

/**
 * Evaluate soft / strong capacity warnings for the requested profile.
 * Does not apply the single-HTML 100 MiB hard reject — callers check that
 * separately and only for `singleHtml`.
 */
export function evaluateWebBookCapacity(input: EvaluateWebBookCapacityInput): WebBookCapacityReport {
  const packageAssetByteTotal = input.registry.assets.reduce((sum, asset) => sum + asset.byteLength, 0);
  const packageAssetCount = input.registry.assets.length;
  const largeImages = input.largeImages.filter((row) => row.byteLength > WEB_BOOK_IMAGE_WARN_BYTES);
  const largeImageWarn = largeImages.length > 0;

  if (input.profile === "singleHtml") {
    const singleHtmlByteLength = input.htmlByteLength ?? 0;
    const singleHtmlStrongWarn =
      singleHtmlByteLength > WEB_BOOK_SINGLE_HTML_WARN_BYTES &&
      singleHtmlByteLength <= MAX_WEB_BOOK_HTML_BYTES;
    return {
      requestedProfile: "singleHtml",
      singleHtmlByteLength,
      packageAssetByteTotal,
      packageAssetCount,
      largeImages,
      largeImageWarn,
      singleHtmlStrongWarn,
      packageSizeWarn: false,
      packageCountWarn: false,
      needsSoftConfirm: largeImageWarn || singleHtmlStrongWarn,
    };
  }

  const packageSizeWarn = packageAssetByteTotal > WEB_BOOK_PACKAGE_ASSET_WARN_BYTES;
  const packageCountWarn = packageAssetCount > WEB_BOOK_PACKAGE_ASSET_WARN_COUNT;
  return {
    requestedProfile: "package",
    packageAssetByteTotal,
    packageAssetCount,
    largeImages,
    largeImageWarn,
    singleHtmlStrongWarn: false,
    packageSizeWarn,
    packageCountWarn,
    needsSoftConfirm: largeImageWarn || packageSizeWarn || packageCountWarn,
  };
}

/** True when single-HTML materialized UTF-8 length exceeds the hard ceiling. */
export function isSingleHtmlHardCapExceeded(profile: WebBookOutputProfile, htmlByteLength: number): boolean {
  return profile === "singleHtml" && htmlByteLength > MAX_WEB_BOOK_HTML_BYTES;
}
