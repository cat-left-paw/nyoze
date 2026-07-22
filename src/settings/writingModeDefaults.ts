import type {
  DocumentTypeWritingModeDefaults,
  SettingsJson,
  WritingMode,
} from './types'
import {
  DEFAULT_ARTICLE_WRITING_MODE,
  DEFAULT_NOVEL_WRITING_MODE,
  DEFAULT_UNSET_DOCUMENT_WRITING_MODE,
} from './defaults'

/** 有効な WritingMode（`vertical-rl` / `horizontal-tb`）か判定する。 */
export function isWritingMode(value: unknown): value is WritingMode {
  return value === 'vertical-rl' || value === 'horizontal-tb'
}

/** 不正値を fallback へ正規化する WritingMode。 */
export function normalizeWritingMode(
  value: unknown,
  fallback: WritingMode,
): WritingMode {
  return isWritingMode(value) ? value : fallback
}

/** 互換の初期既定（novel=縦書き / article=横書き / unset=縦書き）。 */
export const DEFAULT_DOCUMENT_TYPE_WRITING_MODE_DEFAULTS: DocumentTypeWritingModeDefaults =
  {
    novel: DEFAULT_NOVEL_WRITING_MODE,
    article: DEFAULT_ARTICLE_WRITING_MODE,
    unset: DEFAULT_UNSET_DOCUMENT_WRITING_MODE,
  }

/**
 * settings.json から Document Type 別の既定表示方向を取り出して正規化する。
 * 3 キーがいずれも未指定なら null（既定維持）を返す。
 */
export function resolveDocumentTypeWritingModeDefaultsFromSettings(
  settings: Pick<
    SettingsJson,
    | 'defaultNovelWritingMode'
    | 'defaultArticleWritingMode'
    | 'defaultUnsetDocumentWritingMode'
  >,
): DocumentTypeWritingModeDefaults | null {
  if (
    settings.defaultNovelWritingMode === undefined &&
    settings.defaultArticleWritingMode === undefined &&
    settings.defaultUnsetDocumentWritingMode === undefined
  ) {
    return null
  }
  return {
    novel: normalizeWritingMode(
      settings.defaultNovelWritingMode,
      DEFAULT_DOCUMENT_TYPE_WRITING_MODE_DEFAULTS.novel,
    ),
    article: normalizeWritingMode(
      settings.defaultArticleWritingMode,
      DEFAULT_DOCUMENT_TYPE_WRITING_MODE_DEFAULTS.article,
    ),
    unset: normalizeWritingMode(
      settings.defaultUnsetDocumentWritingMode,
      DEFAULT_DOCUMENT_TYPE_WRITING_MODE_DEFAULTS.unset,
    ),
  }
}
