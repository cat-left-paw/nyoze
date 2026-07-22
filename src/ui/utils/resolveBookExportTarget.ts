/**
 * Book 全体 export の対象 Book を active file から解決する。
 *
 * `project:resolveBookExportTarget`（read-only v3 manifest）を使う。
 * Book export は export 専用の read-only main operation だけを使う。
 * renderer から projectRoot は渡さない。
 */

import type { BookExportChapterLoadFailure } from '../../../electron/bookExportChapterLoader'

type ProjectBridge = NonNullable<typeof window.nyozeBridge>['project']

export type BookExportTarget =
  | { ok: true; bookId: string; bookDisplayName: string }
  | { ok: false; reason: 'not-in-project' | 'no-current-book' | 'unavailable' }
  | { ok: false; reason: 'loader-failed'; failure: BookExportChapterLoadFailure }

export function isBookExportMenuAvailable(target: BookExportTarget): boolean {
  return target.ok
}

export async function resolveBookExportTarget(
  bridge: ProjectBridge,
  activeFilePath: string,
): Promise<BookExportTarget> {
  const result = await bridge.resolveBookExportTarget(activeFilePath)
  if (!result.ok) {
    if (result.reason === 'invalid-path') return { ok: false, reason: 'unavailable' }
    return { ok: false, reason: 'unavailable' }
  }
  if (result.kind === 'not-in-project') return { ok: false, reason: 'not-in-project' }
  if (result.kind === 'no-current-book') return { ok: false, reason: 'no-current-book' }
  if (result.kind === 'loader-failed') {
    return { ok: false, reason: 'loader-failed', failure: result.failure }
  }
  return {
    ok: true,
    bookId: result.bookId,
    bookDisplayName: result.bookDisplayName,
  }
}
