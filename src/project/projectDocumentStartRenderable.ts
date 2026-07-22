import type {
  ProjectDocumentStartBook,
  ProjectDocumentStartFile,
} from "./projectDocumentStartInfo";

function trimCredits(values: readonly string[]): string[] {
  return values.map((v) => v.trim()).filter((v) => v.length > 0);
}

export function hasRenderableProjectBookStartContent(input: {
  book: ProjectDocumentStartBook | null;
  visible: boolean;
  showTitle: boolean;
  showAuthors: boolean;
}): boolean {
  if (!input.visible || input.book === null) return false;

  const title = input.showTitle ? input.book.title.trim() : "";
  const authors = input.showAuthors ? trimCredits(input.book.authors) : [];
  return title.length > 0 || authors.length > 0;
}

export function hasRenderableProjectFileStartContent(input: {
  file: ProjectDocumentStartFile | null;
  visible: boolean;
  showTitle: boolean;
  showAuthors: boolean;
  showTranslators: boolean;
}): boolean {
  if (!input.visible || input.file === null) return false;

  const title = input.showTitle ? input.file.title.trim() : "";
  const authors = input.showAuthors ? trimCredits(input.file.authors) : [];
  const translators = input.showTranslators
    ? trimCredits(input.file.translators)
    : [];
  return title.length > 0 || authors.length > 0 || translators.length > 0;
}
