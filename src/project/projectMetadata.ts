/**
 * `.nyoze/project.json` の最小メタデータ (Task 3A-2 前段)。
 *
 * workspace root と project root は別概念:
 * - workspace root: Nyoze で現在開いている大きなルートフォルダ
 * - project root: `.nyoze/project.json` を持つ個別作品のルートフォルダ
 *
 * 付箋・ブック管理データは常に project root 配下の `.nyoze/` に保存し、
 * workspace root 直下へ一括保存しない。
 *
 * このモジュールは I/O を持たない pure helper のみ。
 * ファイル読み書きは main process 側 (electron/projectStore.ts) が担当する。
 */

export const NYOZE_DIR_NAME = '.nyoze'
export const PROJECT_METADATA_FILENAME = 'project.json'
export const PROJECT_METADATA_VERSION = 1
/** project.json `title` の最大文字数（main IPC と UI 検証で共有）。 */
export const MAX_PROJECT_TITLE_LENGTH = 200

export type ProjectMetadata = {
  version: typeof PROJECT_METADATA_VERSION
  /** `crypto.randomUUID()` で生成。UI では通常見せない。 */
  id: string
  title: string
}

/**
 * unknown 値を ProjectMetadata として検証する。
 * - version は数値 1 に厳密一致
 * - id は非空文字列
 * - title は文字列 (欠損時は '' に正規化、型不一致は invalid)
 * invalid な shape は null を返し、呼び出し側はその `.nyoze/project.json` を
 * project root の証拠として扱わない。
 */
export function normalizeProjectMetadata(raw: unknown): ProjectMetadata | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (record.version !== PROJECT_METADATA_VERSION) return null
  if (typeof record.id !== 'string' || record.id.trim().length === 0) return null
  if (record.title !== undefined && typeof record.title !== 'string') return null
  return {
    version: PROJECT_METADATA_VERSION,
    id: record.id,
    title: typeof record.title === 'string' ? record.title : '',
  }
}

/** JSON テキストを検証付きで parse する。invalid JSON / invalid shape は null。 */
export function parseProjectMetadata(jsonText: string): ProjectMetadata | null {
  try {
    return normalizeProjectMetadata(JSON.parse(jsonText))
  } catch {
    return null
  }
}

/** 新規 project metadata を生成する。ID は UUID v4。 */
export function createProjectMetadata(title?: string): ProjectMetadata {
  return {
    version: PROJECT_METADATA_VERSION,
    id: crypto.randomUUID(),
    title: title ?? '',
  }
}

/** project.json として書き出す正規 JSON 形式 (2-space indent + 末尾改行)。 */
export function serializeProjectMetadata(metadata: ProjectMetadata): string {
  return JSON.stringify(metadata, null, 2) + '\n'
}

export type ProjectTitleValidationResult =
  | { ok: true; title: string }
  | { ok: false; reason: 'empty' | 'too-long' }

/**
 * 保存前の project title 検証。
 * - trim 後空は invalid（フォルダ名 fallback はしない）
 * - 制御文字 `\0` は除去、長さは {@link MAX_PROJECT_TITLE_LENGTH} まで
 */
export function validateProjectTitle(raw: string): ProjectTitleValidationResult {
  const title = raw.replace(/\0/g, '').trim()
  if (title.length === 0) return { ok: false, reason: 'empty' }
  if (title.length > MAX_PROJECT_TITLE_LENGTH) return { ok: false, reason: 'too-long' }
  return { ok: true, title }
}
