/**
 * WB-IMG-1: main side operation for the active-document Web Book export
 * (`dialog:exportWebBook`).
 *
 * Unlike Book export (`bookExportOperation.ts`, which reads chapters
 * read-only from disk and runs entirely in main), the active document's PM
 * doc only exists in the renderer. The renderer therefore sends a template
 * artifact (`HtmlTemplatePart[]`) + `WebBookAssetRequest[]` instead of a
 * plain HTML string — main never trusts renderer-reported project root,
 * absolute paths, MIME, or image bytes
 * (`docs/web-book-assets-design-2026-07.md`).
 *
 * Invariants:
 * - Zero asset requests: an unsaved (no `documentPath`) active document can
 *   still export (no image, no origin needed) — unchanged from before WB-IMG-1.
 * - One or more asset requests but `documentPath` cannot be resolved to a
 *   real, boundary-safe file: the whole export is rejected as
 *   `source-document-unavailable` before any Save dialog / write.
 * - Any single asset validation failure aborts the whole export
 *   (`asset-error`) before any Save dialog / write.
 * - Materialized single-HTML over the 100 MiB hard cap aborts as
 *   `html-too-large` before any Save dialog / write (package profile is
 *   exempt; WB-IMG-3A).
 * - Soft capacity warnings return `needs-capacity-confirm` before any
 *   Save / folder dialog / write unless `capacityWarningsAcknowledged`
 *   is true (UX-only; never bypasses validation).
 */

import path from "node:path";
import type { SaveErrorKind } from "./atomicSave";
import { validatePathArg, MAX_CONTENT_LENGTH } from "./ipcSecurity";
import { resolveProjectRootWithFs } from "./projectStore";
import { resolveBoundedDocumentPath } from "./bookExportOperation";
import type { ProjectIpcBoundary } from "./projectIpc";
import {
  materializeWebBookDataUrls,
  resolveWebBookAssets,
  type ResolvedWebBookAssetRegistry,
  type ResolveWebBookAssetOriginContext,
  type WebBookResolvedLargeImageWarning,
} from "./webBookAssetResolution";
import {
  evaluateWebBookCapacity,
  isSingleHtmlHardCapExceeded,
  type WebBookCapacityReport,
} from "./webBookCapacity";
import {
  materializeWebBookTemplate,
  type HtmlTemplatePart,
  type WebBookAssetFailure,
  type WebBookAssetOrigin,
  type WebBookAssetRequest,
} from "../src/editor-core/export/webBookAssetPlan";
import { DEFAULT_WEB_BOOK_OUTPUT_PROFILE, type WebBookOutputProfile } from "../src/editor-core/export/webBookAssetPlan";
import { packageAssetUrlByRefId, webBookPackageWriteErrorMessage, writeWebBookPackage } from "./webBookPackageWrite";

const MAX_TEMPLATE_PARTS = 200_000;
const MAX_ASSET_REQUESTS = 20_000;
const MAX_ASSET_REF_ID_LENGTH = 128;
const MAX_ASSET_RAW_SRC_LENGTH = 4096;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseHtmlTemplatePart(raw: unknown): HtmlTemplatePart | null {
  if (!isPlainObject(raw)) return null;
  if (raw.kind === "html") {
    if (typeof raw.value !== "string") return null;
    return { kind: "html", value: raw.value };
  }
  if (raw.kind === "asset") {
    if (
      typeof raw.refId !== "string" ||
      raw.refId.length === 0 ||
      raw.refId.length > MAX_ASSET_REF_ID_LENGTH
    ) {
      return null;
    }
    return { kind: "asset", refId: raw.refId };
  }
  return null;
}

/** Bounds total array length and cumulative literal text length before touching the filesystem. */
function parseWebBookTemplate(raw: unknown): HtmlTemplatePart[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_TEMPLATE_PARTS) return null;
  const parts: HtmlTemplatePart[] = [];
  let totalTextLength = 0;
  for (const item of raw) {
    const part = parseHtmlTemplatePart(item);
    if (!part) return null;
    if (part.kind === "html") {
      totalTextLength += part.value.length;
      if (totalTextLength > MAX_CONTENT_LENGTH) return null;
    }
    parts.push(part);
  }
  return parts;
}

/** The active-document export channel only ever carries `active-document` origins. */
function parseActiveDocumentAssetOrigin(raw: unknown): WebBookAssetOrigin | null {
  if (!isPlainObject(raw)) return null;
  if (raw.kind === "active-document") return { kind: "active-document" };
  return null;
}

function parseWebBookAssetRequest(raw: unknown): WebBookAssetRequest | null {
  if (!isPlainObject(raw)) return null;
  if (
    typeof raw.refId !== "string" ||
    raw.refId.length === 0 ||
    raw.refId.length > MAX_ASSET_REF_ID_LENGTH
  ) {
    return null;
  }
  if (raw.kind !== "image") return null;
  if (
    typeof raw.rawSrc !== "string" ||
    raw.rawSrc.length === 0 ||
    raw.rawSrc.length > MAX_ASSET_RAW_SRC_LENGTH
  ) {
    return null;
  }
  const origin = parseActiveDocumentAssetOrigin(raw.origin);
  if (!origin) return null;
  return { refId: raw.refId, kind: "image", rawSrc: raw.rawSrc, origin };
}

function parseWebBookAssetRequests(raw: unknown): WebBookAssetRequest[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ASSET_REQUESTS) return null;
  const requests: WebBookAssetRequest[] = [];
  for (const item of raw) {
    const request = parseWebBookAssetRequest(item);
    if (!request) return null;
    requests.push(request);
  }
  return requests;
}

export type ParsedWebBookDocumentExportPayload = {
  documentPath: string | undefined;
  template: HtmlTemplatePart[];
  assetRequests: WebBookAssetRequest[];
  suggestedPath: string | undefined;
  outputProfile: WebBookOutputProfile;
  /** UX-only: skip soft capacity confirm UI on this attempt. Never bypasses hard limits. */
  capacityWarningsAcknowledged: boolean;
};

/**
 * Validate the raw IPC payload shape for `template` / `assetRequests` /
 * `documentPath` / `suggestedPath`. Palette / typography snapshot validation
 * stays in `main.ts` (unchanged from before WB-IMG-1). Returns `null` on any
 * structural violation.
 */
export function parseWebBookDocumentExportPayload(
  raw: Record<string, unknown>,
): ParsedWebBookDocumentExportPayload | null {
  const template = parseWebBookTemplate(raw.template);
  if (!template) return null;
  const assetRequests = parseWebBookAssetRequests(raw.assetRequests);
  if (!assetRequests) return null;

  // Defensive integrity check: every asset hole in the template must be
  // backed by a request (the reverse isn't required — a request whose hole
  // was trimmed away, e.g. trailing empty paragraph cleanup, is fine).
  const refIds = new Set(assetRequests.map((request) => request.refId));
  for (const part of template) {
    if (part.kind === "asset" && !refIds.has(part.refId)) return null;
  }

  const rawDocumentPath = raw.documentPath;
  let documentPath: string | undefined;
  if (rawDocumentPath !== undefined && rawDocumentPath !== null) {
    const validated = validatePathArg(rawDocumentPath);
    if (!validated) return null;
    documentPath = validated;
  }

  const rawSuggested = raw.suggestedPath;
  let suggestedPath: string | undefined;
  if (rawSuggested !== undefined && rawSuggested !== null) {
    const validated = validatePathArg(rawSuggested);
    if (!validated) return null;
    suggestedPath = validated;
  }

  let outputProfile: WebBookOutputProfile;
  if (raw.outputProfile === undefined) {
    outputProfile = DEFAULT_WEB_BOOK_OUTPUT_PROFILE;
  } else if (raw.outputProfile === "singleHtml" || raw.outputProfile === "package") {
    outputProfile = raw.outputProfile;
  } else {
    return null;
  }

  const capacityWarningsAcknowledged = raw.capacityWarningsAcknowledged === true;

  return {
    documentPath,
    template,
    assetRequests,
    suggestedPath,
    outputProfile,
    capacityWarningsAcknowledged,
  };
}

export type WebBookDocumentContentResolutionResult =
  | {
      kind: "ok";
      html: string;
      registry: ResolvedWebBookAssetRegistry;
      capacity: WebBookCapacityReport;
    }
  | { kind: "source-document-unavailable" }
  | { kind: "asset-error"; failures: readonly WebBookAssetFailure[] }
  | { kind: "html-too-large" }
  | { kind: "needs-capacity-confirm"; capacity: WebBookCapacityReport };

/**
 * Resolve every asset request (if any) against the active document's own
 * boundary, then materialize the final HTML string. Never opens a Save
 * dialog or writes a file, so it stays unit-testable without Electron.
 */
export function resolveWebBookDocumentExportContent(
  boundary: ProjectIpcBoundary,
  documentPath: string | undefined,
  template: readonly HtmlTemplatePart[],
  assetRequests: readonly WebBookAssetRequest[],
  outputProfile: WebBookOutputProfile = DEFAULT_WEB_BOOK_OUTPUT_PROFILE,
  capacityWarningsAcknowledged = false,
): WebBookDocumentContentResolutionResult {
  let registry: ResolvedWebBookAssetRegistry = { assetByRefId: new Map(), assets: [] };
  let largeImageWarnings: readonly WebBookResolvedLargeImageWarning[] = [];

  if (assetRequests.length > 0) {
    if (!documentPath) return { kind: "source-document-unavailable" };
    const realPath = resolveBoundedDocumentPath(boundary, documentPath);
    if (!realPath) return { kind: "source-document-unavailable" };

    const baseDir = path.dirname(realPath);
    const projectResolution = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
    const allowedRoot = projectResolution ? projectResolution.projectRoot : baseDir;
    const originLabel = path.basename(realPath);

    const resolveOrigin: ResolveWebBookAssetOriginContext = (origin) => {
      if (origin.kind !== "active-document") return null;
      return { baseDir, allowedRoot, originLabel };
    };

    const resolved = resolveWebBookAssets(assetRequests, resolveOrigin);
    if (!resolved.ok) return { kind: "asset-error", failures: resolved.failures };
    registry = resolved.registry;
    largeImageWarnings = resolved.largeImageWarnings;
  }

  const values = payloadProfileValues(registry, outputProfile);
  const html = materializeWebBookTemplate(template, values);
  const htmlByteLength = Buffer.byteLength(html, "utf8");

  if (isSingleHtmlHardCapExceeded(outputProfile, htmlByteLength)) {
    return { kind: "html-too-large" };
  }

  const capacity = evaluateWebBookCapacity({
    profile: outputProfile,
    htmlByteLength,
    registry,
    largeImages: largeImageWarnings,
  });

  if (capacity.needsSoftConfirm && !capacityWarningsAcknowledged) {
    return { kind: "needs-capacity-confirm", capacity };
  }

  return { kind: "ok", html, registry, capacity };
}

function payloadProfileValues(registry: ResolvedWebBookAssetRegistry, profile: WebBookOutputProfile): ReadonlyMap<string, string> {
  return profile === "package" ? packageAssetUrlByRefId(registry) : materializeWebBookDataUrls(registry);
}

export type WebBookDocumentExportErrorKind =
  | "validation"
  | "canceled"
  | "parent-missing"
  | "permission"
  | "disk-full"
  | "write-failed"
  | "source-document-unavailable"
  | "asset-error"
  | "html-too-large"
  | "needs-capacity-confirm";

export type WebBookDocumentExportIpcResult =
  | { saved: true; filePath: string; backupWarning?: string }
  | {
      saved: false;
      errorKind: WebBookDocumentExportErrorKind;
      errorMessage?: string;
      assetFailures?: readonly WebBookAssetFailure[];
      capacity?: WebBookCapacityReport;
      backupWarning?: string;
    };

export type WebBookDocumentExportOperationDeps = {
  createBackupBeforeOverwrite: (filePath: string) => Promise<void>;
  showSaveDialog: (
    opts: Electron.SaveDialogOptions,
  ) => Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog?: (opts: Electron.OpenDialogOptions) => Promise<{ canceled: boolean; filePaths: string[] }>;
  writeHtmlExportFile: (filePath: string, html: string) => Promise<void>;
  classifySaveError: (error: unknown) => { errorKind: SaveErrorKind; errorMessage: string };
};

/**
 * Full active-document Web Book export flow: resolve assets, materialize,
 * show the Save dialog, back up, and write. Aborts before the Save dialog on
 * any asset / size failure / unacknowledged soft capacity warning.
 */
export async function runWebBookDocumentExportOperation(
  deps: WebBookDocumentExportOperationDeps,
  boundary: ProjectIpcBoundary,
  payload: ParsedWebBookDocumentExportPayload,
): Promise<WebBookDocumentExportIpcResult> {
  const contentResult = resolveWebBookDocumentExportContent(
    boundary,
    payload.documentPath,
    payload.template,
    payload.assetRequests,
    payload.outputProfile,
    payload.capacityWarningsAcknowledged,
  );

  if (contentResult.kind === "source-document-unavailable") {
    return {
      saved: false,
      errorKind: "source-document-unavailable",
      errorMessage: "画像を含む文書を書き出すには、先に文書を保存してください。",
    };
  }
  if (contentResult.kind === "asset-error") {
    return {
      saved: false,
      errorKind: "asset-error",
      errorMessage: "一部の画像を埋め込めなかったため、Web Book の書き出しを中止しました。",
      assetFailures: contentResult.failures,
    };
  }
  if (contentResult.kind === "html-too-large") {
    return {
      saved: false,
      errorKind: "html-too-large",
      errorMessage:
        "画像を埋め込んだ結果、単一 HTML のサイズが上限（100 MiB）を超えました。Web 公開用パッケージを選んでください。",
    };
  }
  if (contentResult.kind === "needs-capacity-confirm") {
    return {
      saved: false,
      errorKind: "needs-capacity-confirm",
      errorMessage: "書き出し前に容量の確認が必要です。",
      capacity: contentResult.capacity,
    };
  }

  if (payload.outputProfile === "package") {
    if (!deps.showOpenDialog) {
      return { saved: false, errorKind: "write-failed", errorMessage: "Web 公開用パッケージを書き出せませんでした。" };
    }
    const directoryResult = await deps.showOpenDialog({
      defaultPath: payload.suggestedPath?.replace(/\.html$/i, ""),
      properties: ["openDirectory", "createDirectory"],
    });
    if (directoryResult.canceled || directoryResult.filePaths.length !== 1) {
      return { saved: false, errorKind: "canceled" };
    }
    const html = materializeWebBookTemplate(
      payload.template,
      payloadProfileValues(contentResult.registry, "package"),
    );
    try {
      await writeWebBookPackage(directoryResult.filePaths[0], html, contentResult.registry);
      return { saved: true, filePath: directoryResult.filePaths[0] };
    } catch (error) {
      return { saved: false, errorKind: "write-failed", errorMessage: webBookPackageWriteErrorMessage(error) };
    }
  }

  const opts: Electron.SaveDialogOptions = {
    defaultPath: payload.suggestedPath,
    filters: [{ name: "HTML", extensions: ["html"] }, { name: "All Files", extensions: ["*"] }],
  };
  const dialogResult = await deps.showSaveDialog(opts);
  if (dialogResult.canceled || !dialogResult.filePath) {
    return { saved: false, errorKind: "canceled" };
  }

  let backupWarning: string | undefined;
  try {
    await deps.createBackupBeforeOverwrite(dialogResult.filePath);
  } catch (error) {
    backupWarning = `pre-save backup failed: ${error instanceof Error ? error.message : String(error)}`;
    console.warn("[Nyoze]", backupWarning);
  }

  try {
    await deps.writeHtmlExportFile(dialogResult.filePath, contentResult.html);
    return { saved: true, filePath: dialogResult.filePath, backupWarning };
  } catch (error) {
    const { errorKind, errorMessage } = deps.classifySaveError(error);
    return { saved: false, errorKind, errorMessage, backupWarning };
  }
}
