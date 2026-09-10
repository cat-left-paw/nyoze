import path from "node:path";
import {
  EDITOR_SESSION_SCHEMA_VERSION,
  type EditorSessionPersistRequest,
} from "../src/session/editorSessionTypes";

export const EDITOR_SESSION_FILE_NAME = "editor-session-state.json";
export const MAX_EDITOR_SESSION_FILE_BYTES = 64 * 1024;
export const MAX_EDITOR_SESSION_TABS = 12;
export const MAX_EDITOR_SESSION_PATH_LENGTH = 4096;

export type EditorSessionPlatform = "darwin" | "linux" | "win32";

export type SanitizedEditorSessionState = EditorSessionPersistRequest;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function platformPath(platform: EditorSessionPlatform): typeof path.posix | typeof path.win32 {
  return platform === "win32" ? path.win32 : path.posix;
}

export function normalizeEditorSessionPath(
  value: unknown,
  platform: EditorSessionPlatform,
): string | null {
  if (typeof value !== "string") return null;
  if (
    value.length === 0 ||
    value.length > MAX_EDITOR_SESSION_PATH_LENGTH ||
    value.includes("\0")
  ) {
    return null;
  }
  const implementation = platformPath(platform);
  if (!implementation.isAbsolute(value)) return null;
  return implementation.normalize(value);
}

export function editorSessionPathKey(
  value: string,
  platform: EditorSessionPlatform,
): string {
  const normalized = platformPath(platform).normalize(value);
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export function isSameEditorSessionPath(
  left: string,
  right: string,
  platform: EditorSessionPlatform,
): boolean {
  return editorSessionPathKey(left, platform) === editorSessionPathKey(right, platform);
}

/**
 * Strict top-level schema with tolerant entries: unknown fields are stripped and
 * invalid/duplicate paths are skipped. An unsupported version or non-array tabs
 * invalidates the whole file so startup falls back to a single untitled tab.
 */
export function sanitizeEditorSessionState(
  value: unknown,
  platform: EditorSessionPlatform,
): SanitizedEditorSessionState | null {
  if (!isPlainObject(value)) return null;
  if (value.version !== EDITOR_SESSION_SCHEMA_VERSION) return null;
  if (!Array.isArray(value.tabs)) return null;

  const revision =
    Number.isSafeInteger(value.revision) && Number(value.revision) >= 0
      ? Number(value.revision)
      : null;
  if (revision === null) return null;

  const tabs: Array<{ filePath: string }> = [];
  const seen = new Set<string>();
  for (const candidate of value.tabs) {
    if (tabs.length >= MAX_EDITOR_SESSION_TABS) break;
    if (!isPlainObject(candidate)) continue;
    const filePath = normalizeEditorSessionPath(candidate.filePath, platform);
    if (!filePath) continue;
    const key = editorSessionPathKey(filePath, platform);
    if (seen.has(key)) continue;
    seen.add(key);
    tabs.push({ filePath });
  }

  const rawActivePath = normalizeEditorSessionPath(value.activeFilePath, platform);
  const activePathIndex = rawActivePath
    ? tabs.findIndex((tab) => isSameEditorSessionPath(tab.filePath, rawActivePath, platform))
    : -1;
  const requestedActiveIndex = Number.isInteger(value.activeIndex)
    ? Number(value.activeIndex)
    : -1;
  const activeIndex =
    activePathIndex >= 0
      ? activePathIndex
      : requestedActiveIndex >= 0 && requestedActiveIndex < tabs.length
        ? requestedActiveIndex
        : 0;

  return {
    version: EDITOR_SESSION_SCHEMA_VERSION,
    revision,
    tabs,
    activeFilePath: activePathIndex >= 0 ? tabs[activePathIndex]!.filePath : null,
    activeIndex,
  };
}

export function parseEditorSessionJson(
  raw: string,
  platform: EditorSessionPlatform,
): SanitizedEditorSessionState | null {
  if (Buffer.byteLength(raw, "utf8") > MAX_EDITOR_SESSION_FILE_BYTES) return null;
  try {
    return sanitizeEditorSessionState(JSON.parse(raw), platform);
  } catch {
    return null;
  }
}

export function serializeEditorSessionState(state: SanitizedEditorSessionState): string {
  return JSON.stringify(state, null, 2);
}

export type RestoredPathCandidate = {
  filePath: string;
  originalIndex: number;
};

/** Prefer the original active file, then the next surviving tab at the same slot. */
export function selectRestoredActiveIndex(
  state: SanitizedEditorSessionState,
  restored: readonly RestoredPathCandidate[],
  platform: EditorSessionPlatform,
): number {
  if (restored.length === 0) return 0;
  if (state.activeFilePath) {
    const exact = restored.findIndex((candidate) =>
      isSameEditorSessionPath(candidate.filePath, state.activeFilePath!, platform),
    );
    if (exact >= 0) return exact;
  }

  const target = state.activeIndex;
  let best = 0;
  for (let index = 1; index < restored.length; index += 1) {
    const candidate = restored[index]!;
    const current = restored[best]!;
    const candidateDistance = Math.abs(candidate.originalIndex - target);
    const currentDistance = Math.abs(current.originalIndex - target);
    if (candidateDistance < currentDistance) {
      best = index;
      continue;
    }
    if (candidateDistance !== currentDistance) continue;
    const candidateIsPrevious = candidate.originalIndex < target;
    const currentIsPrevious = current.originalIndex < target;
    if (currentIsPrevious && !candidateIsPrevious) best = index;
  }
  return best;
}

export type RevisionedWriteQueue = {
  observeRevision: (revision: number) => void;
  enqueue: <T>(
    revision: number,
    write: () => Promise<T>,
  ) => Promise<{ accepted: boolean; value?: T }>;
  latestRevision: () => number;
};

/**
 * Accept revisions synchronously and serialize the actual writes. A late older
 * request is rejected; an already-running older write is always followed by the
 * queued newer write, so it cannot remain as the final on-disk state.
 */
export function createRevisionedWriteQueue(initialRevision = 0): RevisionedWriteQueue {
  let latest = initialRevision;
  let tail: Promise<void> = Promise.resolve();
  return {
    observeRevision(revision) {
      if (Number.isSafeInteger(revision) && revision > latest) latest = revision;
    },
    enqueue<T>(revision: number, write: () => Promise<T>) {
      if (!Number.isSafeInteger(revision) || revision <= latest) {
        return Promise.resolve({ accepted: false });
      }
      latest = revision;
      const run = tail.then(write, write);
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run.then((value) => ({ accepted: true, value }));
    },
    latestRevision: () => latest,
  };
}
