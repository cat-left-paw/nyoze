import type { FrontmatterFields } from "../../editor-core/io/frontmatter";
import {
  parseFrontmatterFields,
  splitLeadingFrontmatter,
} from "../../editor-core/io/frontmatter";
import type { InternalDocId } from "../internalDocs/internalDocIds";
import { countBodyCharacters } from "../utils/countBodyCharacters";
import { isMarkdownDifferentFromClean } from "./dirtyTracking";

export function resolveTabLeaveDirtyState(args: {
  internalDocId?: InternalDocId;
  paragraphPlainOverlayChanged: boolean;
  currentDirty: boolean;
  cleanMarkdownSnapshot: string;
  currentMarkdown: string;
}): boolean {
  if (args.internalDocId) return false;
  if (args.paragraphPlainOverlayChanged) {
    return isMarkdownDifferentFromClean(
      args.cleanMarkdownSnapshot,
      args.currentMarkdown,
    );
  }
  return args.currentDirty;
}

export function buildTabLeaveContentFields(markdown: string): {
  frontmatterFields: FrontmatterFields;
  characterCount: number;
} {
  const { frontmatterPrefix } = splitLeadingFrontmatter(markdown);
  return {
    frontmatterFields: parseFrontmatterFields(frontmatterPrefix),
    characterCount: countBodyCharacters(markdown),
  };
}
