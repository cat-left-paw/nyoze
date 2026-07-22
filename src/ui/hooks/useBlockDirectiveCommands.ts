import { useMemo, type RefObject } from "react";
import type { EditorCoreHandle } from "../../editor-core/types";

/**
 * 独自ブロック装飾 (custom block directive) の toolbar 操作を editor core handle へ
 * 橋渡しする薄い hook。internal read-only doc では適用 / 解除を無効化する。
 * 実際の transaction / gating は editor core 側 (commands + controller) が担う。
 */
export function useBlockDirectiveCommands(
  coreRef: RefObject<EditorCoreHandle | null>,
  internalDocActive: boolean,
): {
  apply: (token: string) => void;
  remove: () => void;
  insertPageBreak: () => void;
  deletePageBreak: () => void;
  insertBlankPage: (count?: number) => void;
} {
  return useMemo(
    () => ({
      apply: (token: string) => {
        if (internalDocActive) return;
        coreRef.current?.applyCustomBlockDirective(token);
      },
      remove: () => {
        if (internalDocActive) return;
        coreRef.current?.removeCustomBlockDirective();
      },
      insertPageBreak: () => {
        if (internalDocActive) return;
        coreRef.current?.insertPageBreak();
      },
      deletePageBreak: () => {
        if (internalDocActive) return;
        coreRef.current?.deletePageBreak();
      },
      insertBlankPage: (count?: number) => {
        if (internalDocActive) return;
        coreRef.current?.insertBlankPage(count);
      },
    }),
    [coreRef, internalDocActive],
  );
}
