/**
 * APP-MAC-DIRTY-QUIT-CONTINUATION1: 明示的な「アプリ終了」要求の bounded state（pure）。
 *
 * macOS では「ウインドウを閉じる」と「アプリを終了する」が別の操作である。
 * 赤い close button は window だけを閉じ、app process は常駐するのが正しい。
 * 一方 Cmd+Q / アプリメニューの「Nyoze を終了」は、未保存確認のあとで
 * **process まで終了する**のが正しい。
 *
 * Electron では、quit 中の BrowserWindow `close` を `preventDefault()` すると
 * quit sequence 全体が中止される。dirty guard は必ず `preventDefault()` するので、
 * quit intent を main 側で覚えておかないと「保存したのに window だけ閉じて
 * process が残る」状態になる。このモジュールはその intent だけを表す。
 *
 * 不変条件:
 * - quit intent の authority は **main process だけ**。renderer は関与しない。
 * - intent は実 Electron lifecycle signal（`before-quit` / `will-quit`）と
 *   dirty dialog の結果だけで遷移する。timer や推測では遷移しない。
 * - 1 回の attempt は `attemptId` で識別し、古い attempt の結果で
 *   新しい attempt を壊さない（stale intent を残さない）。
 */

export type AppQuitIntentState =
  | { readonly kind: "idle" }
  /** 明示 quit を受け取り、dirty guard の結論待ち。 */
  | { readonly kind: "quit-requested"; readonly attemptId: number }
  /** 保存成功 / 明示破棄のあと、同じ attempt の quit を再開中。 */
  | { readonly kind: "quit-resuming"; readonly attemptId: number };

export type AppQuitIntentEvent =
  /** Electron `before-quit`。 */
  | { readonly type: "quit-requested"; readonly attemptId: number }
  /** キャンセル / 保存失敗 / Save As キャンセル / conflict キャンセル / 再入抑止。 */
  | { readonly type: "attempt-abandoned"; readonly attemptId: number }
  /** 保存成功または明示破棄。ここでだけ app quit を再開してよい。 */
  | { readonly type: "resume-quit"; readonly attemptId: number }
  /** Electron `will-quit`（quit が実際に確定した）。 */
  | { readonly type: "quit-settled" };

export const IDLE_APP_QUIT_INTENT: AppQuitIntentState = { kind: "idle" };

export function reduceAppQuitIntent(
  state: AppQuitIntentState,
  event: AppQuitIntentEvent,
): AppQuitIntentState {
  switch (event.type) {
    case "quit-requested":
      // 再開中の `app.quit()` も `before-quit` を再発火する。進行中の attempt は
      // 上書きしない（同じ dialog / save request を二重に開始しないため）。
      return state.kind === "idle"
        ? { kind: "quit-requested", attemptId: event.attemptId }
        : state;
    case "attempt-abandoned":
      return state.kind !== "idle" && state.attemptId === event.attemptId
        ? IDLE_APP_QUIT_INTENT
        : state;
    case "resume-quit":
      return state.kind === "quit-requested" && state.attemptId === event.attemptId
        ? { kind: "quit-resuming", attemptId: event.attemptId }
        : state;
    case "quit-settled":
      return IDLE_APP_QUIT_INTENT;
  }
}

/**
 * この dirty guard が「明示 app quit」の途中かどうか。
 *
 * `quit-resuming` は既に latch 経由で close を通す段階なので false を返す
 * （再開後にもう一度 dialog / save request を始めないため）。
 */
export function isExplicitQuitAttempt(state: AppQuitIntentState): boolean {
  return state.kind === "quit-requested";
}

/** 進行中 attempt の id（なければ null）。 */
export function currentQuitAttemptId(state: AppQuitIntentState): number | null {
  return state.kind === "idle" ? null : state.attemptId;
}

/**
 * `attemptId` の resume が実際に受理され、いま再開段階にあるか。
 *
 * `resume-quit` は失効した attempt（再入 close で破棄された / 別 attempt へ
 * 交代した）に対して黙って拒否される。呼び出し側は dispatch 後に必ずこれで
 * 確認し、**受理されたときだけ** force-close latch と `app.quit()` を実行する。
 */
export function isQuitResumingAttempt(
  state: AppQuitIntentState,
  attemptId: number,
): boolean {
  return state.kind === "quit-resuming" && state.attemptId === attemptId;
}

export type DirtyCloseIntent = "app-quit" | "window-close";

/**
 * dirty dialog をどちらの語彙で出すか。
 *
 * - 明示 quit（Cmd+Q / メニュー「終了」）は常に `app-quit`。
 * - macOS の通常 window close は `window-close`（app は常駐する）。
 * - Windows / Linux で最後の window を閉じる場合は `window-all-closed` が
 *   そのまま `app.quit()` するので、実挙動どおり `app-quit` のままにする
 *   （既存の Windows / Linux 文言・意味論を変えない）。
 */
export function resolveDirtyCloseIntent(input: {
  readonly explicitQuitRequested: boolean;
  readonly platform: NodeJS.Platform;
  readonly otherOpenWindowCount: number;
}): DirtyCloseIntent {
  if (input.explicitQuitRequested) return "app-quit";
  if (input.platform !== "darwin" && input.otherOpenWindowCount === 0) {
    return "app-quit";
  }
  return "window-close";
}

/** dirty dialog の button index（文字列に依存させない）。 */
export const DIRTY_CLOSE_DIALOG_BUTTON_INDEX = {
  cancel: 0,
  save: 1,
  discard: 2,
} as const;

export type DirtyCloseDialogCopy = {
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly buttons: readonly string[];
  readonly defaultId: number;
  readonly cancelId: number;
};

/**
 * intent 別の dialog 文言。
 *
 * `title` は intent によらず同一に保つ（既存の E2E dialog 差し替え helper と
 * main 側 dialog の識別子を安定させるため）。button の意味は index が正本で、
 * 文字列一致で判定しない。
 */
export function buildDirtyCloseDialogCopy(
  intent: DirtyCloseIntent,
): DirtyCloseDialogCopy {
  const buttons =
    intent === "app-quit"
      ? ["キャンセル", "保存して終了", "破棄して終了"]
      : ["キャンセル", "保存して閉じる", "破棄して閉じる"];
  return {
    title: "未保存の変更があります",
    message:
      intent === "app-quit"
        ? "未保存の変更があります。終了しますか？"
        : "未保存の変更があります。ウインドウを閉じますか？",
    detail: "保存していない内容は失われます。",
    buttons,
    defaultId: DIRTY_CLOSE_DIALOG_BUTTON_INDEX.cancel,
    cancelId: DIRTY_CLOSE_DIALOG_BUTTON_INDEX.cancel,
  };
}
