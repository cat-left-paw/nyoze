/**
 * Book manifest v3 の project root 単位排他制御。
 *
 * v3 loader と update store が同じ lock を共有し、同一 project への
 * 並行 read / write を直列化する。異なる project は並行可能。
 */

import path from "node:path";

/** project root ごとの直列化キュー末尾 Promise。 */
const tailByProjectRoot = new Map<string, Promise<unknown>>();

/**
 * 同一 project root に対する Book manifest v3 操作を直列化する。
 * 先行 task の成否にかかわらず後続 task は実行する（`.catch` で queue を継続）。
 *
 * lock 内から uncached loader を呼ぶこと。public loader / update store は
 * この helper で包み、二重 lock を避ける。
 */
export function runExclusiveForBookManifestV3<T>(
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
