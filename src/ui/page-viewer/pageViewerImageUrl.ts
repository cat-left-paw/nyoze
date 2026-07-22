/**
 * Page Viewer 用の scoped `nyoze-img://` URL builder。
 *
 * 実 path / base directory は main 側 scope store だけが持つ。renderer は同じ
 * SEC-5 の relative-image validation を通した src と opaque capability だけを
 * URL に載せる。editor 本体の `nyoze-img://img?src=...` 経路とは host を分ける。
 */

import { isSafeRelativeImageSrc } from '../../editor-core/io/imageSecurity'
import type { PageViewerImageScope } from './pageViewerTypes'

export function buildPageViewerImageDisplayUrl(
  src: string,
  imageScope: PageViewerImageScope | undefined,
  baseToken: string | undefined,
): string | null {
  if (!imageScope || !baseToken || !isSafeRelativeImageSrc(src)) return null
  const params = new URLSearchParams({
    scope: imageScope.scopeId,
    base: baseToken,
    src,
  })
  return `nyoze-img://viewer?${params.toString()}`
}
