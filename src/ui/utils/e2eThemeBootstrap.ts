/**
 * E2E-UX1b: 初回 paint 前の theme / document color bootstrap（renderer 側）。
 *
 * `settings.json` への seed は `useAppUiState` の mount 後に非同期 IPC で読まれる。
 * それより前の初期 state は空の localStorage から
 * - `loadUiTheme()` → 既定 `mist`（明色）
 * - `loadDocColorSettings()` → `DEFAULT_DOC_COLOR_SETTINGS`（`#e9e6e1` 等の明色）
 * になるため、
 *
 *   native 暗色背景 → React 初期化 → `mist` / 明色 docColor → 非同期 read → dark
 *
 * という明色 flash が起き得る。ここで `ReactDOM.createRoot()` **より前**に
 * localStorage と `data-theme` を同期適用して、その中間 paint を無くす。
 *
 * **初版は `uiTheme` / `documentTheme` だけを適用していたため app chrome の
 * flash しか塞げておらず、`docColorSettings` 由来のエディタ本文 surface の
 * 初回明色 paint（`--source-mode-bg` / `--bg-surface` = `pageColor`）を
 * 見逃していた。** 現在は 3 者すべてを同期適用する。
 *
 * 不変条件:
 * - 値の正本は main（`MAIN_E2E_ENABLED` gate 内で検証済みの theme enum と
 *   3 値そろった `#RRGGBB`）。非 E2E / packaged では
 *   `window.nyozeBridge.e2e` 自体が存在せず、この関数は何もしない
 *   （production の既定テーマは一切変えない）。
 * - 書くのは既存 storage key 3 つと `data-theme` だけ。任意 settings は扱わない。
 * - 既に localStorage に値がある場合は**上書きしない**。
 * - `data-theme` の正本は **書き込み後の実効 localStorage 値**（製品と同じ
 *   `loadUiTheme()` で解決）。bootstrap 値を無条件に当てると、同一 userData で
 *   テーマ変更後に reload したとき「DOM だけ dark → React effect で既存 theme へ
 *   戻る」という別の点滅を作ってしまう。
 * - 呼び出すのは**メインエディタ window だけ**。Page Viewer は独立 window に
 *   `data-theme` を持たせない既存契約なので対象外（`src/main.tsx` で分岐）。
 */

import {
  DOCUMENT_THEME_STORAGE_KEY,
  DOC_COLOR_SETTINGS_STORAGE_KEY,
  UI_THEME_STORAGE_KEY,
} from '../../settings/defaults'
import { loadUiTheme } from '../../settings/storage'

/** 同期適用済みであることを E2E から観測するための marker。 */
export const E2E_THEME_BOOTSTRAP_MARKER_ATTRIBUTE = 'e2eThemeBootstrap'

export type E2eThemeBootstrapResult = 'applied' | 'not-available'

/**
 * `ReactDOM.createRoot()` の直前に 1 回だけ呼ぶ。
 * E2E gate 外では常に `not-available` を返して何もしない。
 */
export function applyE2eThemeBootstrap(): E2eThemeBootstrapResult {
  const bootstrap = window.nyozeBridge?.e2e?.bootstrapTheme
  if (!bootstrap) return 'not-available'

  try {
    const storage = window.localStorage
    if (storage.getItem(UI_THEME_STORAGE_KEY) === null) {
      storage.setItem(UI_THEME_STORAGE_KEY, bootstrap.uiTheme)
    }
    if (storage.getItem(DOCUMENT_THEME_STORAGE_KEY) === null) {
      storage.setItem(DOCUMENT_THEME_STORAGE_KEY, bootstrap.documentTheme)
    }
    // docColor は main が 3 値そろった `#RRGGBB` として検証済みのときだけ来る。
    // 既存保存形式（`loadDocColorSettings()` が読む JSON）と同じ形で書く。
    if (
      bootstrap.docColor &&
      storage.getItem(DOC_COLOR_SETTINGS_STORAGE_KEY) === null
    ) {
      storage.setItem(
        DOC_COLOR_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          pageColor: bootstrap.docColor.pageColor,
          textColor: bootstrap.docColor.textColor,
          headingColor: bootstrap.docColor.headingColor,
        }),
      )
    }
  } catch {
    // localStorage が使えなくても data-theme だけは当てる。
  }

  try {
    // React の初回 effect より前に当てることが本質。
    // 値は書き込み後の実効 localStorage 値を製品と同じ経路で解決する
    // （既存 theme を上書きしない契約と `data-theme` を一致させる。
    //  不正値は `loadUiTheme()` 自身が安全に fallback する）。
    document.documentElement.setAttribute('data-theme', loadUiTheme())
    document.documentElement.dataset[E2E_THEME_BOOTSTRAP_MARKER_ATTRIBUTE] =
      'applied'
  } catch {
    // best effort
  }
  return 'applied'
}

/** 初回 editor render 観測器が書き込む window key（E2E gate 内のみ）。 */
export const E2E_FIRST_EDITOR_PAINT_KEY = '__NYOZE_E2E_FIRST_EDITOR_PAINT__'

export type E2eFirstEditorPaintRecord = {
  /** `.editor-panel` が最初に DOM へ入った時点の pageColor token。 */
  firstPageColor: string | null
  /** 観測した distinct な pageColor の並び（本文・HTML は記録しない）。 */
  observedPageColors: string[]
}

/**
 * E2E-UX1b: **最初の editor render** の document color token を記録する。
 *
 * 「settled 後」の状態だけを見る E2E では、明色 → dark の中間 paint を検出できない。
 * `.editor-panel` が最初に DOM へ追加された時点の `--source-mode-bg`
 * （= `docColorSettings.pageColor` そのもの）を記録し、以後の変化も distinct 値
 * として残す。
 *
 * 記録するのは色 token だけで、本文・HTML・その他 settings 値は一切記録しない。
 * `createRoot()` より前に、E2E gate 内でだけ設置する。
 */
export function installE2eFirstEditorPaintProbe(): 'installed' | 'not-available' {
  if (!window.nyozeBridge?.e2e) return 'not-available'
  if (typeof MutationObserver !== 'function') return 'not-available'

  const record: E2eFirstEditorPaintRecord = {
    firstPageColor: null,
    observedPageColors: [],
  }
  ;(window as unknown as Record<string, unknown>)[E2E_FIRST_EDITOR_PAINT_KEY] =
    record

  const readPageColor = (panel: HTMLElement): string =>
    panel.style.getPropertyValue('--source-mode-bg').trim()

  const push = (value: string) => {
    if (!value) return
    if (
      record.observedPageColors[record.observedPageColors.length - 1] === value
    ) {
      return
    }
    record.observedPageColors.push(value)
  }

  const attach = (panel: HTMLElement) => {
    const initial = readPageColor(panel)
    if (record.firstPageColor === null) record.firstPageColor = initial
    push(initial)
    const panelObserver = new MutationObserver(() => push(readPageColor(panel)))
    panelObserver.observe(panel, {
      attributes: true,
      attributeFilter: ['style'],
    })
  }

  const treeObserver = new MutationObserver(() => {
    const panel = document.querySelector('.editor-panel')
    if (!(panel instanceof HTMLElement)) return
    treeObserver.disconnect()
    attach(panel)
  })
  treeObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
  return 'installed'
}
