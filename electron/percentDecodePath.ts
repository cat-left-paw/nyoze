/**
 * WEB-BOOK-ASSET-DECODE1 / MD-ROUNDTRIP-PATH1: Markdown の画像パスを
 * ファイルとして探す前に percent-decode する、唯一の共有関数。
 *
 * Markdown のリンク先・画像パスは相対 URL なので、`my%20image.png` は
 * `my image.png` というファイルを指す。decode はファイルを探すときだけ
 * 行い、decode した後の値にすべての検査をかける（decode を検査より後に
 * 置くと、`..%2F` が decode で `../` になって境界の外へ出る）。
 *
 * 使う側（エディタの画像表示 `validateImageProtocolRequest`、
 * Web Book の asset 解決 `resolveOneAsset`）はどちらもこの関数だけを使い、
 * 2つ目の decode を書かないこと。
 *
 * 意味:
 * - `/` の区切りごとに1回だけ `decodeURIComponent` する。
 *   二重 encode（`%252F` など）は1回だけ decode して `%2F` という文字の
 *   ファイル名として扱い、2回 decode しない。
 * - 壊れた escape（`%` の後が16進でない、`100%.png` など）は元の文字のままにする。
 */
export function decodePercentEncodedPathSegment(segment: string): string {
  return segment.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}

/** `src` 全体を `/` の区切りごとに1回だけ decode する。基準 dir は decode しない。 */
export function decodePercentEncodedPath(src: string): string {
  return src.split("/").map(decodePercentEncodedPathSegment).join("/");
}
