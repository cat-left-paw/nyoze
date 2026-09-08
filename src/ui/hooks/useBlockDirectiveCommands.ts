import { useMemo, type RefObject } from "react";
import type { EditorCoreHandle } from "../../editor-core/types";
import { runLocalImeHostCommand } from "../utils/localImeHostCommandPreflight";

/**
 * 独自ブロック装飾 (custom block directive) の toolbar 操作を editor core handle へ
 * 橋渡しする薄い hook。internal read-only doc では適用 / 解除を無効化する。
 * 実際の transaction / gating は editor core 側 (commands + controller) が担う。
 *
 * LOCAL-WINDOW-HOSTCOMMAND1: caret-based な apply / remove / pageBreak / blankPage は
 * 既存 document-action barrier を通してから 1 回だけ実行する。deletePageBreak は
 * node selection 必須のため barrier 対象外。
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
        runLocalImeHostCommand("host-command-block-directive", () => {
          coreRef.current?.applyCustomBlockDirective(token);
        });
      },
      remove: () => {
        if (internalDocActive) return;
        runLocalImeHostCommand("host-command-block-directive", () => {
          coreRef.current?.removeCustomBlockDirective();
        });
      },
      insertPageBreak: () => {
        if (internalDocActive) return;
        runLocalImeHostCommand("host-command-block-directive", () => {
          coreRef.current?.insertPageBreak();
        });
      },
      deletePageBreak: () => {
        if (internalDocActive) return;
        coreRef.current?.deletePageBreak();
      },
      insertBlankPage: (count?: number) => {
        if (internalDocActive) return;
        runLocalImeHostCommand("host-command-block-directive", () => {
          coreRef.current?.insertBlankPage(count);
        });
      },
    }),
    [coreRef, internalDocActive],
  );
}
