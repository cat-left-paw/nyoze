import type { createUiTextGetter } from "../i18n/uiText";
import type { ProjectDocumentStartDisplay } from "../../project/projectDocumentStartDisplay";
import {
  hasRenderableProjectBookStartContent,
  hasRenderableProjectFileStartContent,
} from "../../project/projectDocumentStartRenderable";
import { ProjectBookStartView } from "./ProjectBookStartView";
import { ProjectFileStartView } from "./ProjectFileStartView";

type TextGetter = ReturnType<typeof createUiTextGetter>;

type ProjectDocumentStartViewsProps = {
  display: ProjectDocumentStartDisplay;
  hidden: boolean;
  showRoleLabels: boolean;
  t: TextGetter;
};

/** Project 内 body の Book / file 冒頭 block（v3 display-only）。 */
export function ProjectDocumentStartViews({
  display,
  hidden,
  showRoleLabels,
  t,
}: ProjectDocumentStartViewsProps) {
  const bookVisible = display.book.visible && !hidden;
  const fileVisible = display.file.visible && !hidden;
  const hasBook = hasRenderableProjectBookStartContent({
    book: display.book.payload,
    visible: bookVisible,
    showTitle: display.book.showTitle,
    showAuthors: display.book.showAuthors,
  });
  const hasFile = hasRenderableProjectFileStartContent({
    file: display.file.payload,
    visible: fileVisible,
    showTitle: display.file.showTitle,
    showAuthors: display.file.showAuthors,
    showTranslators: display.file.showTranslators,
  });
  const views = (
    <>
      <ProjectBookStartView
        book={display.book.payload}
        visible={bookVisible}
        showTitle={display.book.showTitle}
        showAuthors={display.book.showAuthors}
        showRoleLabels={showRoleLabels}
        authorsLabel={t("frontmatterCredit.author", "body")}
      />
      <ProjectFileStartView
        file={display.file.payload}
        visible={fileVisible}
        showTitle={display.file.showTitle}
        showAuthors={display.file.showAuthors}
        showTranslators={display.file.showTranslators}
        showRoleLabels={showRoleLabels}
        authorLabel={t("frontmatterCredit.author", "body")}
        coAuthorLabel={t("frontmatterCredit.coAuthor", "body")}
        translatorLabel={t("frontmatterCredit.translator", "body")}
        coTranslatorLabel={t("frontmatterCredit.coTranslator", "body")}
      />
    </>
  );

  if (!hidden && (hasBook || hasFile)) {
    return <div className="project-document-start-group">{views}</div>;
  }
  return views;
}
