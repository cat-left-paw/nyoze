import { useEffect, useRef, useState } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter, type UiTextKey } from '../i18n/uiText'
import { useFocusTrap } from '../hooks/useFocusTrap'
import {
  DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION,
  type ExternalExportOptionsPromptState,
  type ExternalExportOptionsSelection,
} from '../hooks/useExternalExportOptionsPrompt'

type ExportOptionsModalProps = {
  prompt: ExternalExportOptionsPromptState | null
  uiLanguageMode: UiLanguageMode
  resolveInitialSelection?: (
    prompt: ExternalExportOptionsPromptState,
  ) => ExternalExportOptionsSelection
  onConfirm: (selection: ExternalExportOptionsSelection) => void
  onCancel: () => void
}

const HEADING_LEVEL_OPTIONS = [1, 2, 3, 4, 5, 6] as const
const TCY_DIGIT_OPTIONS = [1, 2, 3, 4] as const

function headingLevelOptionLabel(t: (key: UiTextKey) => string, level: number): string {
  if (level === 1) return t('export.optionsHeadingLevelH1Only')
  return t('export.optionsHeadingLevelUpTo').replace('{level}', String(level))
}

/**
 * active document export (LeME / でんでん / 青空文庫風 / HTML / Web Book) と Book 全体 export
 * （LeME / でんでん / 青空文庫風 / HTML / Web Book）の両方で共有する options 確認 UI（MVP）。
 * `pageBreak` / `pageBreakBeforeHeading` / `pageBreakBeforeHeadingMaxLevel` は
 * scope に関わらず共通。`insertPageBreakBetweenChapters`（章の境界に改ページを
 * 入れる）は `scope === 'book'` のときだけ表示する（章という概念が Book にしか
 * 無いため）。
 *
 * 「目次を表示」（`includeTableOfContents`）は Web Book（`webBook`）のときだけ
 * 表示する。Web BookのReader設定・auto TCYはここへ追加しない。
 *
 * 「文書情報を表示」（`includeDocumentInfo`、frontmatter 由来）は
 * `!isBookScope`（単独文書 export 全 format：html / leme / denden / aozora）の
 * ときだけ表示する。
 *
 * 「作品情報を表示」（`includeBookInfo`）「章ファイル情報を表示」
 * （`includeChapterInfo`）は `isBookScope`（LeME / でんでん / 青空文庫風 / HTML
 * の 4 形式共通。Book には他の format が無いため `format` 判定は不要）のときだけ
 * 表示する（2026-07-09、`docs/book-export-design-2026-07.md` §7.4）。単独文書
 * export（LeME / でんでん / 青空文庫風含む）には一切表示しない。
 *
 * 「役割ラベルを表示」（`showRoleLabels`）は checked 状態・payload の option 名を
 * scope 間で共有しつつ、説明文言（label/helper）と disabled 条件だけ scope で
 * 出し分ける（`roleLabelsTextKey`）。単独文書 export では「文書情報を表示」
 * が、Book 全体 export では「作品情報を表示」または「章ファイル情報を表示」の
 * どちらかが ON のときだけ有効にする。
 *
 * 「文書情報／作品情報の後ろで改ページ」（`breakAfterDocumentInfo`）は
 * `format === 'webBook'` のときだけ表示する。単独は `includeDocumentInfo`、
 * Book は `includeBookInfo` が OFF のとき disabled。HTML slot には保存しない。
 *
 * 「文書情報／作品情報を簡易表紙として表示」（`documentInfoTitlePage`、WB-R9）も
 * `format === 'webBook'` のときだけ表示し、disabled 条件は breakAfter と同じ。
 * ON にした瞬間に `breakAfterDocumentInfo` を自動で ON にし、ON の間は改ページを
 * OFF にできない（簡易表紙は常に独立ページ）。OFF へ戻すと、ON にする直前の
 * `breakAfterDocumentInfo` のユーザー選択を復元する。レイアウト（通常 / 中央）・
 * 書字方向の従属 select はチェック ON のときだけ表示する。
 *
 * 「自動 TCY を反映する」系（`autoTcy` / `tcyMinDigits` / `tcyMaxDigits` /
 * `tcyNumbersOnly`）は `format === 'leme' | 'denden'` のときだけ表示する。
 * Display Settings の auto TCY とは独立で、OFF の間は従属設定を disabled にする。
 * helper 文言は形式別に出し分ける（LeME は記号3種を span.tcy、でんでんは `^...^`）。
 */
export function ExportOptionsModal({
  prompt,
  uiLanguageMode,
  resolveInitialSelection,
  onConfirm,
  onCancel,
}: ExportOptionsModalProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, prompt !== null)

  const [selection, setSelection] = useState<ExternalExportOptionsSelection>(
    DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION,
  )
  // WB-R9: 簡易表紙 ON 直前の breakAfterDocumentInfo のユーザー選択。OFF へ戻す
  // ときに復元する（modal を開き直したら破棄する）。
  const breakAfterBeforeTitlePageRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (prompt) {
      setSelection(resolveInitialSelection?.(prompt) ?? DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION)
      breakAfterBeforeTitlePageRef.current = null
    }
  }, [prompt, resolveInitialSelection])

  if (!prompt) return null

  const isBookScope = prompt.scope === 'book'
  const isHtmlFormat = prompt.format === 'webBook'
  const isWebBookFormat = prompt.format === 'webBook'
  const isAutoTcyFormat = prompt.format === 'leme' || prompt.format === 'denden'
  const autoTcyHelperKey =
    prompt.format === 'leme' ? 'export.optionsAutoTcyLeme' : 'export.optionsAutoTcyDenden'
  // 役割ラベルの説明文言・disabled 条件だけ scope で出し分ける。checked 状態・
  // payload の option 名（`showRoleLabels`）自体は共通のまま変更しない。
  const roleLabelsTextKey = isBookScope
    ? 'export.htmlOptionsShowRoleLabelsBook'
    : 'export.htmlOptionsShowRoleLabels'
  const roleLabelsDisabled = isBookScope
    ? !selection.includeBookInfo && !selection.includeChapterInfo
    : !selection.includeDocumentInfo
  const breakAfterInfoTextKey = isBookScope
    ? 'export.webBookOptionsBreakAfterBookInfo'
    : 'export.webBookOptionsBreakAfterDocumentInfo'
  const breakAfterInfoDisabled = isBookScope
    ? !selection.includeBookInfo
    : !selection.includeDocumentInfo
  const titlePageTextKey = isBookScope
    ? 'export.webBookOptionsBookInfoTitlePage'
    : 'export.webBookOptionsDocumentInfoTitlePage'
  const titlePageDisabled = breakAfterInfoDisabled

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={onCancel}>
      <section
        className='prompt-dialog export-options-dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby='export-options-modal-title'
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id='export-options-modal-title' className='prompt-title'>
          {t(isBookScope ? 'export.optionsTitleBook' : 'export.optionsTitleDocument')}
        </h2>

        <div className='export-options-body'>
          <label className='setting-checkbox-label export-options-row'>
            <input
              type='checkbox'
              checked={selection.pageBreak}
              onChange={(event) =>
                setSelection((current) => ({ ...current, pageBreak: event.target.checked }))
              }
            />
            {t('export.optionsPageBreak')}
          </label>
          <p className='setting-item-note'>{t('export.optionsPageBreak', 'helper')}</p>

          <label className='setting-checkbox-label export-options-row'>
            <input
              type='checkbox'
              checked={selection.pageBreakBeforeHeading}
              disabled={!selection.pageBreak}
              onChange={(event) =>
                setSelection((current) => ({
                  ...current,
                  pageBreakBeforeHeading: event.target.checked,
                }))
              }
            />
            {t('export.optionsPageBreakBeforeHeading')}
          </label>
          <p className='setting-item-note'>
            {t('export.optionsPageBreakBeforeHeading', 'helper')}
          </p>

          <label className='export-options-row export-options-select-row'>
            <span>{t('export.optionsPageBreakBeforeHeadingMaxLevel')}</span>
            <select
              value={selection.pageBreakBeforeHeadingMaxLevel}
              disabled={!selection.pageBreakBeforeHeading}
              onChange={(event) =>
                setSelection((current) => ({
                  ...current,
                  pageBreakBeforeHeadingMaxLevel: Number(event.target.value),
                }))
              }
            >
              {HEADING_LEVEL_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {headingLevelOptionLabel(t, level)}
                </option>
              ))}
            </select>
          </label>
          <p className='setting-item-note'>
            {t('export.optionsPageBreakBeforeHeadingMaxLevel', 'helper')}
          </p>

          {isAutoTcyFormat && (
            <>
              <label className='setting-checkbox-label export-options-row'>
                <input
                  type='checkbox'
                  checked={selection.autoTcy}
                  onChange={(event) =>
                    setSelection((current) => ({ ...current, autoTcy: event.target.checked }))
                  }
                />
                {t('export.optionsAutoTcy')}
              </label>
              <p className='setting-item-note'>{t(autoTcyHelperKey, 'helper')}</p>

              <label className='setting-checkbox-label export-options-row'>
                <input
                  type='checkbox'
                  checked={selection.tcyNumbersOnly}
                  disabled={!selection.autoTcy}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      tcyNumbersOnly: event.target.checked,
                    }))
                  }
                />
                {t('export.optionsTcyNumbersOnly')}
              </label>
              <p className='setting-item-note'>{t('export.optionsTcyNumbersOnly', 'helper')}</p>

              <label className='export-options-row export-options-select-row'>
                <span>{t('export.optionsTcyMinDigits')}</span>
                <select
                  value={selection.tcyMinDigits}
                  disabled={!selection.autoTcy}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      tcyMinDigits: Number(event.target.value),
                    }))
                  }
                >
                  {TCY_DIGIT_OPTIONS.map((digits) => (
                    <option key={digits} value={digits}>
                      {digits}
                    </option>
                  ))}
                </select>
              </label>
              <p className='setting-item-note'>{t('export.optionsTcyMinDigits', 'helper')}</p>

              <label className='export-options-row export-options-select-row'>
                <span>{t('export.optionsTcyMaxDigits')}</span>
                <select
                  value={selection.tcyMaxDigits}
                  disabled={!selection.autoTcy}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      tcyMaxDigits: Number(event.target.value),
                    }))
                  }
                >
                  {TCY_DIGIT_OPTIONS.map((digits) => (
                    <option key={digits} value={digits}>
                      {digits}
                    </option>
                  ))}
                </select>
              </label>
              <p className='setting-item-note'>{t('export.optionsTcyMaxDigits', 'helper')}</p>
            </>
          )}

          {!isBookScope && (
            <>
              <label className='setting-checkbox-label export-options-row'>
                <input
                  type='checkbox'
                  checked={selection.includeDocumentInfo}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      includeDocumentInfo: event.target.checked,
                    }))
                  }
                />
                {t('export.htmlOptionsIncludeDocumentInfo')}
              </label>
              <p className='setting-item-note'>
                {t('export.htmlOptionsIncludeDocumentInfo', 'helper')}
              </p>
            </>
          )}

          {isHtmlFormat && (
            <>
              <label className='setting-checkbox-label export-options-row'>
                <input
                  type='checkbox'
                  checked={selection.includeTableOfContents}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      includeTableOfContents: event.target.checked,
                    }))
                  }
                />
                {t('export.htmlOptionsIncludeTableOfContents')}
              </label>
              <p className='setting-item-note'>
                {t('export.htmlOptionsIncludeTableOfContents', 'helper')}
              </p>

              <label className='export-options-row export-options-select-row'>
                <span>{t('export.htmlOptionsTableOfContentsMaxLevel')}</span>
                <select
                  value={selection.tableOfContentsMaxLevel}
                  disabled={!selection.includeTableOfContents}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      tableOfContentsMaxLevel: Number(event.target.value),
                    }))
                  }
                >
                  {HEADING_LEVEL_OPTIONS.map((level) => (
                    <option key={level} value={level}>
                      {headingLevelOptionLabel(t, level)}
                    </option>
                  ))}
                </select>
              </label>
              <p className='setting-item-note'>
                {t('export.htmlOptionsTableOfContentsMaxLevel', 'helper')}
              </p>
            </>
          )}

          {isBookScope && (
            <>
              <label className='setting-checkbox-label export-options-row'>
                <input
                  type='checkbox'
                  checked={selection.includeBookInfo}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      includeBookInfo: event.target.checked,
                    }))
                  }
                />
                {t('export.htmlOptionsIncludeBookInfo')}
              </label>
              <p className='setting-item-note'>
                {t('export.htmlOptionsIncludeBookInfo', 'helper')}
              </p>

              <label className='setting-checkbox-label export-options-row'>
                <input
                  type='checkbox'
                  checked={selection.includeChapterInfo}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      includeChapterInfo: event.target.checked,
                    }))
                  }
                />
                {t('export.htmlOptionsIncludeChapterInfo')}
              </label>
              <p className='setting-item-note'>
                {t('export.htmlOptionsIncludeChapterInfo', 'helper')}
              </p>
            </>
          )}

          <>
            <label className='setting-checkbox-label export-options-row'>
              <input
                type='checkbox'
                checked={selection.showRoleLabels}
                disabled={roleLabelsDisabled}
                onChange={(event) =>
                  setSelection((current) => ({
                    ...current,
                    showRoleLabels: event.target.checked,
                  }))
                }
              />
              {t(roleLabelsTextKey)}
            </label>
            <p className='setting-item-note'>{t(roleLabelsTextKey, 'helper')}</p>
          </>

          {isWebBookFormat && (
            <>
              <label className='export-options-row export-options-select-row'>
                <span>{t('export.webBookOutputProfile')}</span>
                <select
                  value={selection.webBookOutputProfile}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      webBookOutputProfile: event.target.value as ExternalExportOptionsSelection['webBookOutputProfile'],
                    }))
                  }
                >
                  <option value='singleHtml'>{t('export.webBookOutputProfileSingleHtml')}</option>
                  <option value='package'>{t('export.webBookOutputProfilePackage')}</option>
                </select>
              </label>
              <p className='setting-item-note'>{t('export.webBookOutputProfile', 'helper')}</p>
              <label className='setting-checkbox-label export-options-row'>
                <input
                  type='checkbox'
                  checked={selection.breakAfterDocumentInfo}
                  disabled={breakAfterInfoDisabled || selection.documentInfoTitlePage}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      breakAfterDocumentInfo: event.target.checked,
                    }))
                  }
                />
                {t(breakAfterInfoTextKey)}
              </label>
              <p className='setting-item-note'>{t(breakAfterInfoTextKey, 'helper')}</p>

              <label className='setting-checkbox-label export-options-row'>
                <input
                  type='checkbox'
                  checked={selection.documentInfoTitlePage}
                  disabled={titlePageDisabled}
                  onChange={(event) => {
                    const checked = event.target.checked
                    setSelection((current) => {
                      if (checked) {
                        breakAfterBeforeTitlePageRef.current = current.breakAfterDocumentInfo
                        return {
                          ...current,
                          documentInfoTitlePage: true,
                          breakAfterDocumentInfo: true,
                        }
                      }
                      const restored = breakAfterBeforeTitlePageRef.current
                      breakAfterBeforeTitlePageRef.current = null
                      return {
                        ...current,
                        documentInfoTitlePage: false,
                        breakAfterDocumentInfo: restored ?? current.breakAfterDocumentInfo,
                      }
                    })
                  }}
                />
                {t(titlePageTextKey)}
              </label>
              <p className='setting-item-note'>{t(titlePageTextKey, 'helper')}</p>

              {selection.documentInfoTitlePage && (
                <>
                  <label className='export-options-row export-options-select-row'>
                    <span>{t('export.webBookOptionsTitlePageLayout')}</span>
                    <select
                      value={selection.documentInfoTitlePageLayout}
                      disabled={titlePageDisabled}
                      onChange={(event) =>
                        setSelection((current) => ({
                          ...current,
                          documentInfoTitlePageLayout:
                            event.target.value as ExternalExportOptionsSelection['documentInfoTitlePageLayout'],
                        }))
                      }
                    >
                      <option value='normal'>
                        {t('export.webBookOptionsTitlePageLayoutNormal')}
                      </option>
                      <option value='center'>
                        {t('export.webBookOptionsTitlePageLayoutCenter')}
                      </option>
                    </select>
                  </label>
                  <p className='setting-item-note'>
                    {t('export.webBookOptionsTitlePageLayout', 'helper')}
                  </p>

                  <label className='export-options-row export-options-select-row'>
                    <span>{t('export.webBookOptionsTitlePageWritingMode')}</span>
                    <select
                      value={selection.documentInfoTitlePageWritingMode}
                      disabled={titlePageDisabled}
                      onChange={(event) =>
                        setSelection((current) => ({
                          ...current,
                          documentInfoTitlePageWritingMode:
                            event.target.value as ExternalExportOptionsSelection['documentInfoTitlePageWritingMode'],
                        }))
                      }
                    >
                      <option value='inherit'>
                        {t('export.webBookOptionsTitlePageWritingModeInherit')}
                      </option>
                      <option value='vertical-rl'>
                        {t('export.webBookOptionsTitlePageWritingModeVertical')}
                      </option>
                      <option value='horizontal-tb'>
                        {t('export.webBookOptionsTitlePageWritingModeHorizontal')}
                      </option>
                    </select>
                  </label>
                  <p className='setting-item-note'>
                    {t('export.webBookOptionsTitlePageWritingMode', 'helper')}
                  </p>
                </>
              )}
            </>
          )}

          {isBookScope && (
            <>
              <label className='setting-checkbox-label export-options-row'>
                <input
                  type='checkbox'
                  checked={selection.insertPageBreakBetweenChapters}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      insertPageBreakBetweenChapters: event.target.checked,
                    }))
                  }
                />
                {t('export.bookOptionsInsertBetweenChapters')}
              </label>
              <p className='setting-item-note'>
                {t('export.bookOptionsInsertBetweenChapters', 'helper')}
              </p>
            </>
          )}
        </div>

        <div className='prompt-buttons'>
          <button type='button' onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type='button' onClick={() => onConfirm(selection)}>
            {t('export.optionsConfirm')}
          </button>
        </div>
      </section>
    </div>
  )
}
