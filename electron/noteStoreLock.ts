/**
 * notes.json の project root 単位排他制御。
 *
 * `.nyoze/notes.json` の read-modify-write（File Explorer rename / move の note.file 追従など）と
 * 通常の write を同じ lock で直列化し、書き込み同士のレースで一方の更新が消えるのを防ぐ。
 * 異なる project は並行可能。
 *
 * 注意: renderer 主導の付箋編集は readNotes → renderer で編集 → writeNotes と IPC をまたぐため、
 * この main 側 lock だけでは renderer 側の read-modify-write 全体は直列化できない。ここで直列化するのは
 * あくまで disk write の critical section であり、relocate の read-modify-write を他の disk write と
 * 不可分にするためのもの。
 */

import path from "node:path";

const tailByProjectRoot = new Map<string, Promise<unknown>>();

export function runExclusiveForNotes<T>(
  projectRoot: string,
  task: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(projectRoot);
  const previous = tailByProjectRoot.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => task());
  tailByProjectRoot.set(key, next);
  const cleanup = (): void => {
    if (tailByProjectRoot.get(key) === next) {
      tailByProjectRoot.delete(key);
    }
  };
  void next.then(cleanup, cleanup);
  return next;
}
