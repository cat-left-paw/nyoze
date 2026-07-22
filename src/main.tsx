import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { PageViewerWindowRoot } from './ui/page-viewer/PageViewerWindowRoot.tsx'
import { parsePageViewerWindowQuery } from './ui/page-viewer/pageViewerTypes'
import './styles.css'

const pageViewerQuery = parsePageViewerWindowQuery(window.location.search)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {pageViewerQuery ? (
      <PageViewerWindowRoot payloadId={pageViewerQuery.payloadId} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
