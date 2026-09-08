import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { PageViewerWindowRoot } from './ui/page-viewer/PageViewerWindowRoot.tsx'
import { parsePageViewerWindowQuery } from './ui/page-viewer/pageViewerTypes'
import {
  applyE2eThemeBootstrap,
  installE2eFirstEditorPaintProbe,
} from './ui/utils/e2eThemeBootstrap'
import './styles.css'

const pageViewerQuery = parsePageViewerWindowQuery(window.location.search)

// E2E-UX1b: E2E gate 内の theme / document color bootstrap を `createRoot()` より
// 前に同期適用し、初回 paint で明色既定（`mist` と `#e9e6e1` 系 docColor）が
// 一瞬描かれるのを防ぐ。観測器も同じ gate 内で createRoot 前に設置する。
// 非 E2E / packaged では bridge 自体が無いのでどちらも何もしない。
//
// **メインエディタ window だけ**が対象。Page Viewer は「独立 window には
// `data-theme` を持たせず、snapshot と専用 fallback で描画する」という既存契約
// なので、ここで E2E 専用の `data-theme` / CSS 変数を注入すると production と
// 異なる状態になり、fallback の不具合を E2E が隠してしまう。
// Page Viewer は native 暗色背景と payload 由来の reader theme に任せる。
if (!pageViewerQuery) {
  applyE2eThemeBootstrap()
  installE2eFirstEditorPaintProbe()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {pageViewerQuery ? (
      <PageViewerWindowRoot payloadId={pageViewerQuery.payloadId} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
