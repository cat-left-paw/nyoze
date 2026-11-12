import { useCallback, type RefObject } from "react";
import type { EditorCoreHandle } from "../../editor-core/types";
import { createUiTextGetter } from "../i18n/uiText";
import type { UiLanguageMode } from "../../settings/types";

/**
 * EDITOR-PARAGRAPH-REPARSE1: 「この段落の記法を反映」（Cmd/Ctrl+Shift+M と右クリックのメニュー）を、editor core の
 * handle へ橋渡しする薄い hook。実際の読み直し・transaction は editor core 側（features/paragraphReparse）が担う。
 *
 * 反映するものがないとき（'nothing'）だけ、既存の inline hint で短く知らせる（transaction は出ない）。使えない場面
 * （'unavailable': 変換中・Paragraph Plain・Source Mode・read-only など）は、何も起きない（メニューは無効、shortcut は
 * plain mode の gate が通知する）。internal read-only doc では何もしない。
 */
export function useParagraphReparseCommand({
  coreRef,
  internalDocActive,
  uiLanguageMode,
  showEditorInlineHint,
}: {
  coreRef: RefObject<EditorCoreHandle | null>;
  internalDocActive: boolean;
  uiLanguageMode: UiLanguageMode;
  showEditorInlineHint: (message: string) => void;
}): () => void {
  return useCallback(() => {
    if (internalDocActive) return;
    const result = coreRef.current?.reparseCurrentParagraph();
    if (result === "nothing") {
      showEditorInlineHint(createUiTextGetter(uiLanguageMode)("editor.paragraphReparse.nothing"));
    }
  }, [coreRef, internalDocActive, uiLanguageMode, showEditorInlineHint]);
}
