import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type {
  LineBreakPolicy,
  MarkdownDocumentOptions,
} from "../types";
import type { FrontmatterFields } from "./frontmatter";
import {
  resolveDocumentMarkdownOptions,
  resolveDocumentType,
} from "./frontmatterDocumentSettings";

export type TopLevelMarkdownBlockDescriptor = {
  startLine: number;
  endLine: number;
  typeName: string;
};

const md = MarkdownIt("commonmark", { html: true });
md.enable("strikethrough");

export function supportsPreservedEmptyParagraphBoundary(
  typeName: string,
): boolean {
  return typeName === "paragraph" || typeName === "heading";
}

function mapTopLevelTokenTypeToBlockName(tokenType: string): string | null {
  switch (tokenType) {
    case "paragraph_open":
      return "paragraph";
    case "heading_open":
      return "heading";
    case "blockquote_open":
      return "blockquote";
    case "bullet_list_open":
      return "bulletList";
    case "ordered_list_open":
      return "orderedList";
    case "fence":
    case "code_block":
      return "codeBlock";
    case "hr":
      return "horizontalRule";
    case "html_block":
      return "htmlBlock";
    default:
      return null;
  }
}

export function collectTopLevelMarkdownBlockDescriptors(
  tokens: Token[],
): TopLevelMarkdownBlockDescriptor[] {
  const descriptors: TopLevelMarkdownBlockDescriptor[] = [];

  for (const token of tokens) {
    if (token.level !== 0 || !token.map || token.map.length < 2) continue;
    const typeName = mapTopLevelTokenTypeToBlockName(token.type);
    if (typeName === null) continue;
    descriptors.push({
      startLine: token.map[0],
      endLine: token.map[1],
      typeName,
    });
  }

  return descriptors;
}

export function markdownHasPreservableEmptyParagraphs(markdown: string): boolean {
  const descriptors = collectTopLevelMarkdownBlockDescriptors(md.parse(markdown, {}));
  for (let index = 0; index < descriptors.length - 1; index += 1) {
    const current = descriptors[index];
    const next = descriptors[index + 1];
    if (
      !supportsPreservedEmptyParagraphBoundary(current.typeName) ||
      !supportsPreservedEmptyParagraphBoundary(next.typeName)
    ) {
      continue;
    }
    if (next.startLine - current.endLine - 1 > 0) {
      return true;
    }
  }
  return false;
}

export function resolveEffectiveDocumentMarkdownOptionsForLoad(
  frontmatterFields: Pick<
    FrontmatterFields,
    "documentType" | "nyozeType" | "type" | "nyozePreserveEmptyParagraphs"
  >,
  markdownBody: string,
  lineBreakPolicy: LineBreakPolicy,
): MarkdownDocumentOptions {
  const canonicalOptions = resolveDocumentMarkdownOptions(frontmatterFields);
  if (canonicalOptions.preserveEmptyParagraphs) {
    return canonicalOptions;
  }
  if (lineBreakPolicy !== "commonmark-strict") {
    return canonicalOptions;
  }
  if (resolveDocumentType(frontmatterFields) !== "article") {
    return canonicalOptions;
  }
  return {
    preserveEmptyParagraphs: markdownHasPreservableEmptyParagraphs(markdownBody),
  };
}
