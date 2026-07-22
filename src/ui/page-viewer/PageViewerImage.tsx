import { useState } from 'react'
import type { PageViewerImageScope } from './pageViewerTypes'
import { buildPageViewerImageDisplayUrl } from './pageViewerImageUrl'

function PageViewerImagePlaceholder({ alt }: { alt: string }) {
  const label = alt.trim() ? `画像を表示できません: ${alt}` : '画像を表示できません'
  return (
    <span className="page-viewer-window__image-placeholder" data-page-viewer-image-placeholder="true" role="img" aria-label={label}>
      {label}
    </span>
  )
}

export function PageViewerImage({
  src,
  alt,
  title,
  imageScope,
  imageBaseToken,
  onImageSettled,
}: {
  src: string
  alt: string
  title: string | undefined
  imageScope?: PageViewerImageScope
  imageBaseToken?: string
  onImageSettled?: () => void
}) {
  const [failed, setFailed] = useState(false)
  const displayUrl = buildPageViewerImageDisplayUrl(src, imageScope, imageBaseToken)
  if (!displayUrl || failed) return <PageViewerImagePlaceholder alt={alt} />
  return (
    <span className="page-viewer-window__image-wrapper" data-page-viewer-image="true">
      <img
        className="page-viewer-window__image"
        src={displayUrl}
        alt={alt}
        title={title}
        draggable={false}
        onLoad={onImageSettled}
        onError={() => {
          setFailed(true)
          onImageSettled?.()
        }}
      />
    </span>
  )
}
