import { useMemo, type RefObject } from "react";
import type { IndentStepDirection } from "../../editor-core/io/customBlockDirective";
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
  /**
   * BLOCK-INDENT-LEVELS1: 字下げの増減の直後に、ツールバーが読む command availability（`blockDirectiveToken`）を
   * その場で同期する。本文の変更の全文同期は入力の後 400 ms 遅れる（EDITOR-INPUT-PERF3）ので、これが無いと、
   * 直後にメニューを開いたときの「（いま N 段）」と上限（20 段）の使えない状態が、遅れて古い段数のまま出る。
   * 右クリックのメニューは開くたびに live で読むので、この同期は要らない。command 自身は常に live の state で動く。
   */
  syncCommandAvailability?: () => void,
): {
  apply: (token: string) => void;
  remove: () => void;
  stepIndent: (direction: IndentStepDirection) => void;
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
      // BLOCK-INDENT-LEVELS1: 字下げを 1 段増やす / 減らす（apply / remove と同じ barrier を通す）。
      stepIndent: (direction: IndentStepDirection) => {
        if (internalDocActive) return;
        const preparation = runLocalImeHostCommand("host-command-block-directive", () => {
          coreRef.current?.stepCustomBlockIndent(direction);
        });
        if (preparation.status === "ready") syncCommandAvailability?.();
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
    [coreRef, internalDocActive, syncCommandAvailability],
  );
}
