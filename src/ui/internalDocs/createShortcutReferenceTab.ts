import {
  parseFrontmatterFields,
  splitLeadingFrontmatter,
} from "../../editor-core/io/frontmatter";
import { resolveDocumentMarkdownOptions } from "../../editor-core/io/frontmatterDocumentSettings";
import type { LineBreakPolicy } from "../../editor-core/types";
import type { EditorTab } from "../hooks/useAppUiState";
import { generateTabId } from "../hooks/useAppUiState";
import { countBodyCharacters } from "../utils/countBodyCharacters";
import {
  SHORTCUT_REFERENCE_INTERNAL_DOC_ID,
  type InternalDocId,
} from "./internalDocIds";
import type { ShortcutBundleKey } from "./resolveShortcutBundleKey";

/** Shared snapshot fields for the shortcut reference tab (horizontal Article-like doc). */
export function deriveShortcutReferenceTabCore(
  title: string,
  fullMarkdown: string,
  lineBreakPolicy: LineBreakPolicy,
  bundleKey: ShortcutBundleKey,
): Pick<
  EditorTab,
  | "title"
  | "markdownSnapshot"
  | "cleanMarkdownSnapshot"
  | "frontmatterFields"
  | "documentMarkdownOptions"
  | "characterCount"
  | "writingMode"
  | "writingModeFollowsTypeRecommendation"
  | "lineBreakPolicy"
  | "internalShortcutBundleKey"
> {
  const { frontmatterPrefix } = splitLeadingFrontmatter(fullMarkdown);
  const frontmatterFields = parseFrontmatterFields(frontmatterPrefix);
  const documentMarkdownOptions =
    resolveDocumentMarkdownOptions(frontmatterFields);

  return {
    title,
    markdownSnapshot: fullMarkdown,
    cleanMarkdownSnapshot: fullMarkdown,
    frontmatterFields,
    documentMarkdownOptions,
    characterCount: countBodyCharacters(fullMarkdown),
    writingMode: "horizontal-tb",
    writingModeFollowsTypeRecommendation: false,
    lineBreakPolicy,
    internalShortcutBundleKey: bundleKey,
  };
}

export function createShortcutReferenceEditorTab(
  title: string,
  fullMarkdown: string,
  lineBreakPolicy: LineBreakPolicy,
  bundleKey: ShortcutBundleKey,
): EditorTab & { internalDocId: InternalDocId } {
  const core = deriveShortcutReferenceTabCore(
    title,
    fullMarkdown,
    lineBreakPolicy,
    bundleKey,
  );

  return {
    id: generateTabId(),
    dirty: false,
    filePath: null,
    savedStat: null,
    eol: "lf",
    scrollTop: 0,
    scrollLeft: 0,
    viewportAnchorPmPos: null,
    viewportAnchorTextOffset: null,
    viewportAnchorTextTotal: null,
    sourceModeTopOffset: null,
    internalDocId: SHORTCUT_REFERENCE_INTERNAL_DOC_ID,
    ...core,
  };
}
