import type { DocumentContextInfo } from "./documentContextRole";

/**
 * File Metadata パネル向けの Project 文脈（display-only / read-only）。
 *
 * 既存の `activeFileMembership` と `documentContextInfo` だけから導出する。
 * 新しい read IPC は追加しない。
 */
export type FileMetadataProjectContext =
  | { kind: "outside-project" }
  | { kind: "registered-body" }
  | { kind: "registered-material" }
  | { kind: "unregistered" }
  | { kind: "unresolved" };

export function resolveFileMetadataProjectContext(input: {
  inProject: boolean;
  membershipPending: boolean;
  documentContext: DocumentContextInfo;
}): FileMetadataProjectContext {
  if (input.membershipPending) {
    return { kind: "unresolved" };
  }
  if (!input.inProject) {
    return { kind: "outside-project" };
  }

  const { project, role } = input.documentContext;
  if (project.kind !== "in") {
    return { kind: "unresolved" };
  }
  if (role.kind === "body") {
    return { kind: "registered-body" };
  }
  if (role.kind === "material") {
    return { kind: "registered-material" };
  }
  if (role.kind === "unregistered") {
    return { kind: "unregistered" };
  }
  return { kind: "unresolved" };
}
