/** PV-READ-3B: CSS Columnsの計測対象外となる固定1ページの簡易表紙。 */

import { useLayoutEffect, useRef, useState } from 'react'
import type { PageViewFixedSyntheticPageItem } from '../../editor-core/io/pageModelView'
import type {
  PageViewerReadingSimpleCoverLayout,
  PageViewerReadingSimpleCoverWritingMode,
} from '../../settings/pageViewerReadingSurfaceSettings'
import type { WritingMode } from '../../settings/types'

function effectiveWritingMode(value: PageViewerReadingSimpleCoverWritingMode, viewer: WritingMode): WritingMode {
  return value === 'inherit' ? viewer : value
}

export function PageViewerSimpleCoverFrame({ item, itemIndex, isActive, viewerWritingMode, coverWritingMode, layout, showRoleLabels }: {
  item: PageViewFixedSyntheticPageItem
  itemIndex: number
  isActive: boolean
  viewerWritingMode: WritingMode
  coverWritingMode: PageViewerReadingSimpleCoverWritingMode
  layout: PageViewerReadingSimpleCoverLayout
  showRoleLabels: boolean
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const groupRef = useRef<HTMLDivElement | null>(null)
  const titleProbeRef = useRef<HTMLDivElement | null>(null)
  const authorProbeRef = useRef<HTMLDivElement | null>(null)
  const [centerAuthorFallback, setCenterAuthorFallback] = useState(false)
  const mode = effectiveWritingMode(coverWritingMode, viewerWritingMode)
  const shouldProbeCenterAuthor =
    mode === 'vertical-rl' && layout === 'center' && Boolean(item.entry.title && item.entry.author)

  useLayoutEffect(() => {
    // 縦書きcenter以外へ一時的に切り替えた間も最後の判定を保持する。戻した
    // 最初のcommitで既知のfallbackを再利用でき、vertical-flowとの往復を挟まない。
    if (!shouldProbeCenterAuthor) return
    const frame = frameRef.current
    const group = groupRef.current
    const titleProbe = titleProbeRef.current
    const authorProbe = authorProbeRef.current
    if (!frame || !group || !titleProbe || !authorProbe) return
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      const availableInlineSize = frame.clientHeight
      const titleInlineSize = titleProbe.scrollHeight
      const authorInlineSize = authorProbe.scrollHeight
      const gap = Number.parseFloat(window.getComputedStyle(group).columnGap) || 0
      if (availableInlineSize <= 0 || titleInlineSize <= 0 || authorInlineSize <= 0) return
      const next = titleInlineSize + gap + authorInlineSize > availableInlineSize + 0.5
      setCenterAuthorFallback((current) => (current === next ? current : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(titleProbe)
    observer.observe(authorProbe)
    void document.fonts?.ready.then(measure).catch(() => undefined)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [item.entry.author, item.entry.title, layout, mode, shouldProbeCenterAuthor])

  const useHorizontalAuthorFallback = shouldProbeCenterAuthor && centerAuthorFallback
  const authorLayout = useHorizontalAuthorFallback
    ? 'horizontal-footer'
    : mode === 'vertical-rl'
      ? 'vertical-flow'
      : 'horizontal-flow'
  const authorText = `${showRoleLabels ? '著　' : ''}${item.entry.author ?? ''}`

  return (
    <div ref={frameRef} className="page-viewer-window__page-frame page-viewer-window__page-frame--fixed-synthetic" data-page-sequence-active={isActive ? 'true' : 'false'} data-page-sequence-kind="fixedSyntheticPage" data-page-sequence-item-index={itemIndex} data-section-id={item.sectionId} aria-hidden={!isActive}>
      <section
        className="page-viewer-window__simple-cover"
        data-simple-cover-layout={layout}
        data-simple-cover-writing-mode={mode}
        data-simple-cover-author-layout={authorLayout}
        aria-label="簡易表紙"
      >
        <div ref={groupRef} className="page-viewer-window__simple-cover-group">
          {item.entry.title ? <div className="page-viewer-window__simple-cover-title-group" data-simple-cover-region="title"><h1 className="page-viewer-window__simple-cover-title">{item.entry.title}</h1></div> : null}
          {item.entry.author ? <div className="page-viewer-window__simple-cover-credit-group" data-simple-cover-region="author"><p className="page-viewer-window__simple-cover-credit">{authorText}</p></div> : null}
        </div>
        {shouldProbeCenterAuthor ? (
          <div className="page-viewer-window__simple-cover-probes" aria-hidden="true">
            <div ref={titleProbeRef} className="page-viewer-window__simple-cover-probe page-viewer-window__simple-cover-probe--title">{item.entry.title}</div>
            <div ref={authorProbeRef} className="page-viewer-window__simple-cover-probe page-viewer-window__simple-cover-probe--author">{authorText}</div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
