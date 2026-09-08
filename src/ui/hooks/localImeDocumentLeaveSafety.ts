export type LocalImeDocumentLeaveOperation =
  | "save-before-close"
  | "active-tab-load"
  | "tab-close-active"
  | "tab-close-background-activation"
  | "tab-switch"
  | "tab-add"
  | "open-file-new-tab"
  | "shortcut-reference"
  | "snapshot-active-tab";

export type LocalImeDocumentLeaveDisposition =
  | "destructive"
  | "non-destructive";

export type LocalImeDocumentLeaveDirtyNotice = {
  readonly dirty: boolean;
  readonly documentIdentity: string | null;
};

export type LocalImeDocumentLeaveCapture =
  | {
      readonly kind: "none";
      readonly operation: LocalImeDocumentLeaveOperation;
      readonly activeTabId: string;
      readonly documentIdentity: string | null;
    }
  | {
      readonly kind: "captured";
      readonly operation: LocalImeDocumentLeaveOperation;
      readonly activeTabId: string;
      readonly ownerTabId: string;
      readonly documentIdentity: string;
    };

export type LocalImeDocumentLeaveFailureReason =
  | "dirty-owner-missing"
  | "dirty-owner-mismatch"
  | "dirty-document-identity-missing"
  | "stale-dirty-owner"
  | "barrier-blocked"
  | "document-action-pending"
  | "document-identity-changed"
  | "draft-still-dirty"
  | "post-barrier-owner-mismatch"
  | "active-tab-changed"
  | "active-tab-missing"
  | "active-tab-duplicated"
  | "captured-tab-missing"
  | "captured-tab-duplicated";

export type LocalImeDocumentLeaveState<T extends { id: string }> = {
  readonly activeTabId: string;
  readonly dirtyOwnerTabId: string | null;
  readonly dirtyNotice: LocalImeDocumentLeaveDirtyNotice;
  readonly tabs: readonly T[];
  readonly documentActionPending: boolean;
};

export type LocalImeDocumentLeaveProof<T extends { id: string }> =
  | {
      readonly ok: true;
      readonly capture: LocalImeDocumentLeaveCapture;
      readonly activeTab: T;
      readonly tabs: readonly T[];
    }
  | {
      readonly ok: false;
      readonly reason: LocalImeDocumentLeaveFailureReason;
    };

export function captureLocalImeDocumentLeave(input: {
  readonly operation: LocalImeDocumentLeaveOperation;
  readonly activeTabId: string;
  readonly dirtyOwnerTabId: string | null;
  readonly dirtyNotice: LocalImeDocumentLeaveDirtyNotice;
}):
  | { readonly ok: true; readonly capture: LocalImeDocumentLeaveCapture }
  | { readonly ok: false; readonly reason: LocalImeDocumentLeaveFailureReason } {
  if (input.dirtyNotice.dirty) {
    if (input.dirtyOwnerTabId === null) {
      return { ok: false, reason: "dirty-owner-missing" };
    }
    if (input.dirtyOwnerTabId !== input.activeTabId) {
      return { ok: false, reason: "dirty-owner-mismatch" };
    }
    if (input.dirtyNotice.documentIdentity === null) {
      return { ok: false, reason: "dirty-document-identity-missing" };
    }
    return {
      ok: true,
      capture: {
        kind: "captured",
        operation: input.operation,
        activeTabId: input.activeTabId,
        ownerTabId: input.dirtyOwnerTabId,
        documentIdentity: input.dirtyNotice.documentIdentity,
      },
    };
  }
  if (input.dirtyOwnerTabId !== null) {
    return { ok: false, reason: "stale-dirty-owner" };
  }
  return {
    ok: true,
    capture: {
      kind: "none",
      operation: input.operation,
      activeTabId: input.activeTabId,
      documentIdentity: input.dirtyNotice.documentIdentity,
    },
  };
}

export function proveLocalImeDocumentLeaveAfterBarrier<T extends { id: string }>(input: {
  readonly capture: LocalImeDocumentLeaveCapture;
  readonly state: LocalImeDocumentLeaveState<T>;
}): LocalImeDocumentLeaveProof<T> {
  const { capture, state } = input;
  if (state.documentActionPending) {
    return { ok: false, reason: "document-action-pending" };
  }
  if (state.activeTabId !== capture.activeTabId) {
    return { ok: false, reason: "active-tab-changed" };
  }
  if (state.dirtyNotice.dirty) {
    return { ok: false, reason: "draft-still-dirty" };
  }
  if (
    capture.documentIdentity !== null &&
    state.dirtyNotice.documentIdentity !== capture.documentIdentity
  ) {
    return { ok: false, reason: "document-identity-changed" };
  }
  if (capture.kind === "captured") {
    if (
      state.dirtyOwnerTabId !== null &&
      state.dirtyOwnerTabId !== capture.ownerTabId
    ) {
      return { ok: false, reason: "post-barrier-owner-mismatch" };
    }
    const ownerCount = state.tabs.reduce(
      (count, tab) => count + (tab.id === capture.ownerTabId ? 1 : 0),
      0,
    );
    if (ownerCount === 0) return { ok: false, reason: "captured-tab-missing" };
    if (ownerCount !== 1) return { ok: false, reason: "captured-tab-duplicated" };
  } else if (state.dirtyOwnerTabId !== null) {
    return { ok: false, reason: "post-barrier-owner-mismatch" };
  }
  const activeTabs = state.tabs.filter((tab) => tab.id === capture.activeTabId);
  if (activeTabs.length === 0) return { ok: false, reason: "active-tab-missing" };
  if (activeTabs.length !== 1) return { ok: false, reason: "active-tab-duplicated" };
  return { ok: true, capture, activeTab: activeTabs[0], tabs: state.tabs };
}

/** capture → barrier exact 1 → post-proof を同じ同期call内で完了する唯一の入口。 */
export function prepareLocalImeDocumentLeave<T extends { id: string }>(input: {
  readonly operation: LocalImeDocumentLeaveOperation;
  readonly readBeforeBarrier: () => Omit<
    LocalImeDocumentLeaveState<T>,
    "tabs" | "documentActionPending"
  >;
  readonly prepareDocumentAction: (
    reason: LocalImeDocumentLeaveOperation,
  ) => { readonly status: string };
  readonly readAfterBarrier: () => LocalImeDocumentLeaveState<T>;
}): LocalImeDocumentLeaveProof<T> {
  const before = input.readBeforeBarrier();
  const captured = captureLocalImeDocumentLeave({
    operation: input.operation,
    activeTabId: before.activeTabId,
    dirtyOwnerTabId: before.dirtyOwnerTabId,
    dirtyNotice: before.dirtyNotice,
  });
  if (!captured.ok) return captured;
  const preparation = input.prepareDocumentAction(input.operation);
  if (preparation.status !== "ready") {
    return { ok: false, reason: "barrier-blocked" };
  }
  return proveLocalImeDocumentLeaveAfterBarrier({
    capture: captured.capture,
    state: input.readAfterBarrier(),
  });
}

export function resolveLocalImeDocumentLeaveDerivedDirty(input: {
  readonly canonicalDirty: boolean;
  readonly capture: LocalImeDocumentLeaveCapture;
  readonly tabId: string;
  readonly internalDocument: boolean;
}): boolean {
  if (input.internalDocument) return false;
  return (
    input.canonicalDirty ||
    (input.capture.kind === "captured" && input.capture.ownerTabId === input.tabId)
  );
}

export function resolveLocalImeDocumentLeavePromptAuthority(input: {
  readonly disposition: LocalImeDocumentLeaveDisposition;
  readonly derivedDirty: boolean;
}): {
  readonly mustPrompt: boolean;
  readonly forcePrompt: boolean;
  readonly mustPersistSnapshot: boolean;
} {
  if (input.disposition === "destructive") {
    return {
      mustPrompt: input.derivedDirty,
      forcePrompt: input.derivedDirty,
      mustPersistSnapshot: true,
    };
  }
  return {
    mustPrompt: false,
    forcePrompt: false,
    mustPersistSnapshot: true,
  };
}
