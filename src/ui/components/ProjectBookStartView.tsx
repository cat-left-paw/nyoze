import type { ProjectDocumentStartBook } from "../../project/projectDocumentStartInfo";
import { hasRenderableProjectBookStartContent } from "../../project/projectDocumentStartRenderable";

/**
 * Project 内 Book 先頭 body item の Book metadata 表示（display-only / v3）。
 *
 * source of truth は `.nyoze/books.json` v3 の Book `name` / `authors`。
 * frontmatter とは別 source。Markdown / books.json は読み取りのみ。
 */
type ProjectBookStartViewProps = {
  book: ProjectDocumentStartBook | null;
  visible: boolean;
  /** master ON 時は true（Book title を出す）。 */
  showTitle: boolean;
  /** Book authors（`frontmatterShowAuthors`）。 */
  showAuthors: boolean;
  showRoleLabels: boolean;
  authorsLabel: string;
};

export function ProjectBookStartView({
  book,
  visible,
  showTitle,
  showAuthors,
  showRoleLabels,
  authorsLabel,
}: ProjectBookStartViewProps) {
  if (
    !hasRenderableProjectBookStartContent({
      book,
      visible,
      showTitle,
      showAuthors,
    })
  ) {
    return null;
  }

  const bookTitle = showTitle ? book!.title.trim() : "";
  const authors = showAuthors
    ? book!.authors.map((a) => a.trim()).filter((a) => a.length > 0)
    : [];

  return (
    <div
      className="frontmatter-view project-book-start-view"
      data-source="books-json-v3"
    >
      {bookTitle.length > 0 && (
        <div className="frontmatter-top">
          <h1 className="frontmatter-title project-book-start-title">{bookTitle}</h1>
        </div>
      )}
      {authors.length > 0 && (
        <div className="frontmatter-bottom">
          <p className="frontmatter-person">
            <span className="frontmatter-person-label">
              {showRoleLabels ? authorsLabel : "\u00A0"}
            </span>
            <span className="frontmatter-person-name">{authors.join("、")}</span>
          </p>
        </div>
      )}
    </div>
  );
}
