import type { ProjectDocumentStartFile } from "../../project/projectDocumentStartInfo";
import { hasRenderableProjectFileStartContent } from "../../project/projectDocumentStartRenderable";

/**
 * Project 内 body item の file metadata 表示（display-only / v3）。
 *
 * v3 `title` / `authors` / `translators` を表示する。frontmatter 形式へ偽装しない。
 */
type ProjectFileStartViewProps = {
  file: ProjectDocumentStartFile | null;
  visible: boolean;
  showTitle: boolean;
  showAuthors: boolean;
  showTranslators: boolean;
  showRoleLabels: boolean;
  authorLabel: string;
  coAuthorLabel: string;
  translatorLabel: string;
  coTranslatorLabel: string;
};

function PersonLine({
  label,
  name,
  showRoleLabels,
}: {
  label: string;
  name: string;
  showRoleLabels: boolean;
}) {
  return (
    <p className="frontmatter-person">
      <span className="frontmatter-person-label">
        {showRoleLabels ? label : "\u00A0"}
      </span>
      <span className="frontmatter-person-name">{name}</span>
    </p>
  );
}

function PersonListLines({
  label,
  names,
  showRoleLabels,
}: {
  label: string;
  names: string[];
  showRoleLabels: boolean;
}) {
  if (names.length === 0) return null;
  return (
    <>
      {names.map((name, i) => (
        <p key={i} className="frontmatter-person">
          {i === 0 && (
            <span className="frontmatter-person-label">
              {showRoleLabels ? label : "\u00A0"}
            </span>
          )}
          {i > 0 && (
            <span className="frontmatter-person-label" aria-hidden="true">
              {"\u00A0"}
            </span>
          )}
          <span className="frontmatter-person-name">{name}</span>
        </p>
      ))}
    </>
  );
}

function trimCredits(values: readonly string[]): string[] {
  return values.map((v) => v.trim()).filter((v) => v.length > 0);
}

export function ProjectFileStartView({
  file,
  visible,
  showTitle,
  showAuthors,
  showTranslators,
  showRoleLabels,
  authorLabel,
  coAuthorLabel,
  translatorLabel,
  coTranslatorLabel,
}: ProjectFileStartViewProps) {
  if (
    !hasRenderableProjectFileStartContent({
      file,
      visible,
      showTitle,
      showAuthors,
      showTranslators,
    })
  ) {
    return null;
  }

  const title = showTitle ? file!.title.trim() : "";
  const authors = showAuthors ? trimCredits(file!.authors) : [];
  const translators = showTranslators ? trimCredits(file!.translators) : [];

  const hasTitle = title.length > 0;
  const hasCredits = authors.length > 0 || translators.length > 0;

  const [primaryAuthor, ...coAuthors] = authors;
  const [primaryTranslator, ...coTranslators] = translators;

  return (
    <div
      className="frontmatter-view project-file-start-view"
      data-source="books-json-v3"
    >
      {hasTitle && (
        <div className="frontmatter-top">
          <h1 className="frontmatter-title project-file-start-title">{title}</h1>
        </div>
      )}
      {hasCredits && (
        <div className="frontmatter-bottom">
          {primaryAuthor && (
            <PersonLine
              label={authorLabel}
              name={primaryAuthor}
              showRoleLabels={showRoleLabels}
            />
          )}
          {coAuthors.length > 0 && (
            <PersonListLines
              label={coAuthorLabel}
              names={coAuthors}
              showRoleLabels={showRoleLabels}
            />
          )}
          {primaryTranslator && (
            <PersonLine
              label={translatorLabel}
              name={primaryTranslator}
              showRoleLabels={showRoleLabels}
            />
          )}
          {coTranslators.length > 0 && (
            <PersonListLines
              label={coTranslatorLabel}
              names={coTranslators}
              showRoleLabels={showRoleLabels}
            />
          )}
        </div>
      )}
    </div>
  );
}
