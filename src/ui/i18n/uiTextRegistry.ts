export type UiTextLocale = 'ja' | 'en'
export type UiTextVariant = 'label' | 'tooltip' | 'helper' | 'body'

export type UiTextLocalizedValue = Record<UiTextLocale, string>

export type UiTextEntry = {
  label: UiTextLocalizedValue
  tooltip?: UiTextLocalizedValue
  helper?: UiTextLocalizedValue
  /**
   * 本文側の表示文字列。mixed モードでも日本語ラベルを使いたい箇所（役割ラベルなど）で
   * `t(key, 'body')` として参照する。エントリ側は定義不要（label にフォールバック）。
   * {@link resolveUiTextLocale} で mixed → 'ja' に解決される。
   */
  body?: UiTextLocalizedValue
}

export const UI_TEXT_REGISTRY = {
  'common.menu': {
    label: { ja: 'メニュー', en: 'Menu' },
  },
  'common.open': {
    label: { ja: '開く', en: 'Open' },
  },
  'common.close': {
    label: { ja: '閉じる', en: 'Close' },
  },
  'common.minimize': {
    label: { ja: '最小化', en: 'Minimize' },
  },
  'common.search': {
    label: { ja: '検索', en: 'Search' },
  },
  'common.load': {
    label: { ja: '読み込む', en: 'Load' },
  },
  'common.openFile': {
    // 書庫管理が主導線になったため、toolbar / File メニューの通常 open は
    // 「単独ファイルを開く」寄りにする。フォルダを書庫として使う導線は
    // 書庫管理 (library.menuOpen) 側に寄せ、ここでは folder open を主役にしない。
    label: { ja: 'ファイルを開く', en: 'Open File' },
    tooltip: {
      ja: 'ファイルを開く',
      en: 'Open File',
    },
  },
  'common.newDocument': {
    label: { ja: '新しい文書', en: 'New Document' },
  },
  'common.save': {
    label: { ja: '保存', en: 'Save' },
    tooltip: {
      ja: '現在の内容を保存します',
      en: 'Save the current content',
    },
  },
  'common.saveAs': {
    label: { ja: '名前を付けて保存', en: 'Save As' },
  },
  'common.unsaved': {
    label: { ja: '未保存', en: 'Unsaved' },
  },
  'common.undo': {
    label: { ja: '元に戻す', en: 'Undo' },
  },
  'common.redo': {
    label: { ja: 'やり直す', en: 'Redo' },
  },
  'common.cut': {
    label: { ja: '切り取り', en: 'Cut' },
  },
  'common.copy': {
    label: { ja: 'コピー', en: 'Copy' },
  },
  'common.paste': {
    label: { ja: '貼り付け', en: 'Paste' },
  },
  'common.selectAll': {
    label: { ja: 'すべて選択', en: 'Select All' },
  },
  'common.openInNewTab': {
    label: { ja: '新しいタブで開く', en: 'Open in New Tab' },
  },
  'common.rename': {
    label: { ja: '名前を変更', en: 'Rename' },
  },
  'common.delete': {
    label: { ja: '削除', en: 'Delete' },
  },
  'common.cancel': {
    label: { ja: 'キャンセル', en: 'Cancel' },
  },
  'common.quit': {
    label: { ja: '終了', en: 'Quit' },
  },
  'common.about': {
    label: { ja: 'About', en: 'About' },
  },
  'common.hide': {
    label: { ja: '隠す', en: 'Hide' },
  },
  'common.hideOthers': {
    label: { ja: 'ほかを隠す', en: 'Hide Others' },
  },
  'common.showAll': {
    label: { ja: 'すべて表示', en: 'Show All' },
  },
  'common.services': {
    label: { ja: 'サービス', en: 'Services' },
  },
  'common.zoom': {
    label: { ja: 'ズーム', en: 'Zoom' },
  },
  'common.reset': {
    label: { ja: 'リセット', en: 'Reset' },
  },
  'common.resetToDefault': {
    label: { ja: '標準に戻す', en: 'Reset to default' },
  },
  'common.resetToThemeDefault': {
    label: { ja: 'テーマ指定に戻す', en: 'Reset to theme default' },
  },
  'common.resetToThemeColor': {
    label: { ja: 'テーマ指定色に戻す', en: 'Reset to theme color' },
  },
  'common.register': {
    label: { ja: '登録', en: 'Register' },
  },
  'common.remove': {
    label: { ja: '削除', en: 'Remove' },
  },
  'common.standard': {
    label: { ja: '標準', en: 'Standard' },
  },
  'common.custom': {
    label: { ja: 'カスタム', en: 'Custom' },
  },
  'common.show': {
    label: { ja: '表示する', en: 'Show' },
  },
  'common.enable': {
    label: { ja: '有効', en: 'Enable' },
  },
  'common.check': {
    label: { ja: '確認', en: 'Check' },
  },
  'common.builtin': {
    label: { ja: '標準', en: 'Built-in' },
  },
  'font.mincho': {
    label: { ja: '明朝体', en: 'Mincho' },
  },
  'font.gothic': {
    label: { ja: 'ゴシック体', en: 'Gothic' },
  },
  'font.sameAsBody': {
    label: { ja: '本文と同じ', en: 'Same as body' },
  },
  'pane.outline': {
    label: { ja: 'アウトライン', en: 'Outline' },
  },
  'pane.document': {
    label: { ja: '文書メタデータ', en: 'Document Metadata' },
    helper: {
      ja: 'frontmatter のメタデータと文書単位の表示設定を編集します',
      en: 'Edit frontmatter metadata and document-specific display settings',
    },
  },
  'pane.notes': {
    label: { ja: '付箋', en: 'Notes' },
  },
  'pane.project': {
    label: { ja: '作品', en: 'Project' },
    helper: {
      ja: '同じ作品内のブックと資料を参照します',
      en: 'Browse books and materials in the same project',
    },
  },
  'pane.theme': {
    label: { ja: '表示', en: 'Theme' },
  },
  'projectPanel.heading': {
    label: { ja: '作品', en: 'Project' },
  },
  'projectPanel.refresh': {
    label: { ja: '更新', en: 'Refresh' },
  },
  'projectPanel.switcherToggle': {
    label: { ja: '作品を切り替える', en: 'Switch project' },
  },
  'projectPanel.switcherTitle': {
    label: { ja: '作品一覧', en: 'Projects' },
  },
  'projectPanel.switcherRefresh': {
    label: { ja: '一覧を更新', en: 'Refresh list' },
  },
  'projectPanel.switcherLoading': {
    label: { ja: '読み込み中…', en: 'Loading…' },
  },
  'projectPanel.switcherEmpty': {
    label: { ja: '作品が見つかりません', en: 'No projects found' },
  },
  'projectPanel.switcherUnavailable': {
    label: { ja: '作品一覧を表示できません', en: 'Project list is unavailable' },
  },
  'projectPanel.switcherError': {
    label: { ja: '作品一覧を取得できませんでした', en: 'Failed to load the project list' },
  },
  'projectPanel.switcherCurrent': {
    label: { ja: '現在', en: 'Current' },
  },
  'projectPanel.switcherManifestYes': {
    label: { ja: 'Book 構成あり', en: 'Has Book registry' },
  },
  'projectPanel.switcherManifestNo': {
    label: { ja: 'Book 構成なし', en: 'No Book registry' },
  },
  'projectPanel.loading': {
    label: { ja: '読み込み中…', en: 'Loading…' },
  },
  'projectPanel.unavailable': {
    label: {
      ja: 'この文書では作品情報を表示できません',
      en: 'Project info is unavailable for this document',
    },
  },
  'projectPanel.notInProject': {
    label: {
      ja: 'この文書は作品に属していません',
      en: 'This document is not in a project',
    },
  },
  'projectPanel.error': {
    label: {
      ja: '作品情報を読み込めませんでした',
      en: 'Could not load project info',
    },
  },
  'projectPanel.books': {
    label: { ja: 'ブック', en: 'Books' },
  },
  'projectPanel.booksEmpty': {
    label: {
      ja: 'この作品にはブックがありません',
      en: 'No books in this project',
    },
  },
  'projectPanel.bookBodyEmpty': {
    label: {
      ja: 'このBookには本文ファイルが登録されていません',
      en: 'No body files are registered in this book.',
    },
  },
  'projectPanel.currentBookMissing': {
    label: {
      ja: '現在のファイルはブックに属していません',
      en: 'The current file does not belong to a book',
    },
  },
  'registry.fileNotFound': {
    label: { ja: 'ファイルが見つかりません', en: 'File not found' },
    tooltip: {
      ja: '登録情報は残っていますが、ファイルが見つかりません',
      en: 'Registry entry remains but the file was not found',
    },
  },
  'projectPanel.missingBodyItemHint': {
    label: {
      ja: '登録は残っていますが、ファイルが見つかりません',
      en: 'Registered but file not found',
    },
    tooltip: {
      ja: '登録は残っていますが、ファイルが見つかりません。通常タブでは開けず、Outline / 前後章ナビの対象にもなりません。整理するには登録解除を使ってください。',
      en: 'Registered but file not found. Cannot open or use in outline/navigation. Use Unregister to remove the entry.',
    },
    helper: {
      ja: '登録は残っていますが、ファイルが見つかりません。通常タブでは開けず、Outline / 前後章ナビの対象にもなりません。整理するには登録解除を使ってください。',
      en: 'Registered but file not found. Cannot open or use in outline/navigation. Use Unregister to remove the entry.',
    },
  },
  'projectPanel.missingMaterialHint': {
    label: {
      ja: '登録は残っていますが、ファイルが見つかりません',
      en: 'Registered but file not found',
    },
    tooltip: {
      ja: '登録は残っていますが、ファイルが見つかりません。preview / 簡易編集は使えません。整理するには登録解除を使ってください。',
      en: 'Registered but file not found. Preview and editing are unavailable. Use Unregister to clean up.',
    },
    helper: {
      ja: '登録は残っていますが、ファイルが見つかりません。preview / 簡易編集は使えません。整理するには登録解除を使ってください。',
      en: 'Registered but file not found. Preview and editing are unavailable. Use Unregister to clean up.',
    },
  },
  'projectPanel.materialsHeading': {
    label: { ja: '資料', en: 'Materials' },
  },
  'projectPanel.materialsEmpty': {
    label: {
      ja: 'この作品には資料がありません',
      en: 'No materials in this project',
    },
  },
  'projectPanel.materialsFilterLabel': {
    label: { ja: '資料の絞り込み', en: 'Filter materials' },
  },
  'projectPanel.materialsFilterEmpty': {
    label: {
      ja: 'この条件に合う資料はありません',
      en: 'No materials match this filter',
    },
  },
  'projectPanel.filterAll': {
    label: { ja: '全て', en: 'All' },
  },
  'projectPanel.sectionEmpty': {
    label: { ja: '（なし）', en: '(none)' },
  },
  'projectPanel.role.synopsis': {
    label: { ja: '梗概', en: 'Synopsis' },
  },
  'projectPanel.role.character': {
    label: { ja: '人物', en: 'Characters' },
  },
  'projectPanel.role.setting': {
    label: { ja: '設定', en: 'Settings' },
  },
  'projectPanel.role.material': {
    label: { ja: '資料', en: 'Materials' },
  },
  'projectPanel.role.unsorted': {
    label: { ja: '未整理', en: 'Unsorted' },
  },
  'projectPanel.preview': {
    label: { ja: 'プレビュー', en: 'Preview' },
  },
  'projectPanel.resize': {
    label: {
      ja: 'ドラッグで一覧とプレビューの高さを調整',
      en: 'Drag to resize list and preview',
    },
  },
  'projectPanel.modePreview': {
    label: { ja: 'プレビュー', en: 'Preview' },
  },
  'projectPanel.modeEdit': {
    label: { ja: '編集', en: 'Edit' },
  },
  'projectPanel.save': {
    label: { ja: '保存', en: 'Save' },
  },
  'projectPanel.cancel': {
    label: { ja: 'キャンセル', en: 'Cancel' },
  },
  'projectPanel.editSaving': {
    label: { ja: '保存中…', en: 'Saving…' },
  },
  'projectPanel.editDirty': {
    label: { ja: '未保存', en: 'Unsaved' },
  },
  'projectPanel.editTextareaLabel': {
    label: { ja: '資料の Markdown 編集', en: 'Edit material Markdown' },
  },
  'projectPanel.editLeaveBlocked': {
    label: {
      ja: '未保存の変更があります。保存またはキャンセルしてください。',
      en: 'You have unsaved changes. Save or cancel first.',
    },
  },
  'projectPanel.editDisabledOpenInCenter': {
    label: {
      ja: '中央で開いているため簡易編集できません',
      en: 'Open in the center editor — simple edit disabled',
    },
    tooltip: {
      ja: 'この資料は中央エディタで開いています。二重編集を避けるため、ここでは編集できません。中央で編集してください。',
      en: 'This material is open in the center editor. To avoid editing it in two places, edit it there instead.',
    },
  },
  'projectPanel.editCenterLocked': {
    label: {
      ja: 'この資料は中央エディタで開かれました。二重編集を避けるため、ここでは編集できません。未保存の変更は保持しています。',
      en: 'This material is now open in the center editor. Editing here is disabled to avoid two edit surfaces. Your unsaved changes are kept.',
    },
  },
  'projectPanel.editLoadError': {
    label: {
      ja: '資料ファイルを読み込めませんでした。',
      en: 'Could not load the material file.',
    },
  },
  'projectPanel.editSaveError': {
    label: {
      ja: '保存に失敗しました。編集内容は保持されています。',
      en: 'Save failed. Your edits are kept.',
    },
  },
  'projectPanel.editConflict': {
    label: {
      ja: 'ファイルが外部で変更されています。上書きすると外部の変更が失われます。',
      en: 'The file changed outside the app. Overwriting will discard those changes.',
    },
  },
  'projectPanel.editReload': {
    label: { ja: '再読み込み', en: 'Reload' },
  },
  'projectPanel.editOverwrite': {
    label: { ja: '現在の編集で上書き保存', en: 'Overwrite with my edits' },
  },
  'projectPanel.previewEmpty': {
    label: {
      ja: '資料を選択するとプレビューを表示します',
      en: 'Select a material to preview it',
    },
  },
  'projectPanel.previewLoading': {
    label: { ja: 'プレビューを読み込み中…', en: 'Loading preview…' },
  },
  'projectPanel.previewError': {
    label: {
      ja: 'プレビューを読み込めませんでした',
      en: 'Could not load preview',
    },
  },
  'projectPanel.previewEmptyBody': {
    label: { ja: '（本文がありません）', en: '(no body text)' },
  },
  'projectPanel.openInCenter': {
    label: { ja: '中央で開く', en: 'Open' },
  },
  'projectPanel.untitledProject': {
    label: { ja: '無題の作品', en: 'Untitled project' },
  },
  'projectPanel.titleEditButton': {
    label: { ja: '編集', en: 'Edit' },
  },
  'projectPanel.titleEditInputLabel': {
    label: { ja: '作品タイトル', en: 'Project title' },
  },
  'projectPanel.titleEditSaving': {
    label: { ja: '保存中…', en: 'Saving…' },
  },
  'projectPanel.titleEditErrorEmpty': {
    label: {
      ja: 'タイトルを入力してください',
      en: 'Enter a project title',
    },
  },
  'projectPanel.titleEditErrorTooLong': {
    label: {
      ja: 'タイトルが長すぎます',
      en: 'Title is too long',
    },
  },
  'projectPanel.titleEditErrorSave': {
    label: {
      ja: 'タイトルを保存できませんでした',
      en: 'Could not save the project title',
    },
  },
  'projectPanel.titleEditLeaveBlocked': {
    label: {
      ja: '未保存のタイトル変更があります',
      en: 'Unsaved title changes',
    },
  },
  // Book 編集の共有文言。
  'projectPanel.bookEditButton': {
    label: { ja: '編集', en: 'Edit' },
  },
  'projectPanel.bookEditLeaveBlocked': {
    label: {
      ja: '未保存の Book 編集があります。保存またはキャンセルしてください。',
      en: 'You have unsaved book changes. Save or cancel first.',
    },
  },
  'projectPanel.bookEditErrorInvalidManifest': {
    label: {
      ja: 'books.json が壊れているため編集できません。手動で確認してください。',
      en: 'books.json is corrupted; editing is unavailable. Please check it manually.',
    },
  },
  'projectPanel.bookEditErrorReadError': {
    label: {
      ja: 'books.json を読み取れないため編集できません。',
      en: 'Cannot read books.json; editing is unavailable.',
    },
  },
  'projectPanel.bookEditErrorWrite': {
    label: {
      ja: '保存に失敗しました。編集内容は保持されています。',
      en: 'Save failed. Your edits are kept.',
    },
  },
  'projectPanel.bookEditErrorInvalidInput': {
    label: { ja: '入力が不正です。', en: 'Invalid input.' },
  },
  'projectPanel.bookEditErrorSave': {
    label: { ja: 'Book 情報を保存できませんでした。', en: 'Could not save the book.' },
  },
  'projectPanel.bookBookNameLabel': {
    label: { ja: 'Book 名', en: 'Book name' },
  },
  'projectPanel.bookLabelEdit': {
    label: { ja: 'ラベル編集', en: 'Edit label' },
  },
  'projectPanel.bookLabelPlaceholder': {
    label: { ja: 'ラベル（空でファイル名）', en: 'Label (blank = file name)' },
  },
  'projectPanel.bookUnregister': {
    label: { ja: '登録解除', en: 'Unregister' },
  },
  'projectPanel.bookUnregisterHint': {
    label: {
      ja: '登録情報だけを外します（ファイルは削除しません）',
      en: 'Remove from registry (file is not deleted)',
    },
    tooltip: {
      ja: '登録情報だけを外します（ファイルは削除しません）',
      en: 'Remove from registry (file is not deleted)',
    },
  },
  'projectPanel.bookUnregisterItemConfirm': {
    label: {
      ja: 'この章を Book から外しますか？',
      en: 'Remove this chapter from the book registry?',
    },
    helper: {
      ja: 'この章を Book から外します。Markdown ファイルは削除されません。作品内に残っている場合は、未登録ファイル一覧から再登録できます。',
      en: 'Remove this chapter from the book registry. The Markdown file will not be deleted. If it still exists in the project folder, re-register it from Unregistered files.',
    },
  },
  'projectPanel.bookUnregisterItemMissingConfirm': {
    label: {
      ja: '見つからないファイルの登録を外しますか？',
      en: 'Remove the registry entry for this missing file?',
    },
    helper: {
      ja: '見つからないファイルの登録だけを外します。ファイルそのものは削除しません。',
      en: 'Remove the registry entry for this missing file only. No file will be deleted.',
    },
  },
  'projectPanel.bookUnregisterMaterialConfirm': {
    label: {
      ja: 'この資料を Materials から外しますか？',
      en: 'Remove this material from the registry?',
    },
    helper: {
      ja: 'この資料を Materials から外します。Markdown ファイルは削除されません。作品内に残っている場合は、未登録ファイル一覧から再登録できます。',
      en: 'Remove this material from the registry. The Markdown file will not be deleted. If it still exists in the project folder, re-register it from Unregistered files.',
    },
  },
  'projectPanel.bookUnregisterMaterialMissingConfirm': {
    label: {
      ja: '見つからないファイルの登録を外しますか？',
      en: 'Remove the registry entry for this missing file?',
    },
    helper: {
      ja: '見つからないファイルの登録だけを外します。ファイルそのものは削除しません。',
      en: 'Remove the registry entry for this missing file only. No file will be deleted.',
    },
  },
  'projectPanel.bookUnregisterBook': {
    label: { ja: 'Bookを登録解除', en: 'Unregister book' },
  },
  'projectPanel.bookUnregisterBookHint': {
    label: {
      ja: 'Book を registry から外します（Markdown ファイルは削除しません）',
      en: 'Remove book from registry (Markdown files are not deleted)',
    },
    tooltip: {
      ja: 'Book を registry から外します（Markdown ファイルは削除しません）',
      en: 'Remove book from registry (Markdown files are not deleted)',
    },
  },
  'projectPanel.bookUnregisterBookConfirm': {
    label: {
      ja: 'この Book を registry から外しますか？',
      en: 'Remove this book from the registry?',
    },
    helper: {
      ja: 'この Book を registry から外します。`.nyoze/books.json` だけを更新し、Markdown ファイルは削除しません。外れた本文ファイルは未登録ファイルとして扱われます。',
      en: 'Remove this book from the registry. Only `.nyoze/books.json` is updated; Markdown files are not deleted. Body files will appear as unregistered files.',
    },
  },
  'projectPanel.bookEditErrorNotInProject': {
    label: {
      ja: '作品が見つからないため保存できません。',
      en: 'Cannot save because the project was not found.',
    },
  },
  'projectPanel.bookEditErrorInvalidPath': {
    label: {
      ja: 'ファイルの場所が不正なため保存できません。',
      en: 'Cannot save because the file location is invalid.',
    },
  },
  'projectPanel.bookMoveUp': {
    label: { ja: '上へ', en: 'Move up' },
  },
  'projectPanel.bookMoveDown': {
    label: { ja: '下へ', en: 'Move down' },
  },
  'projectPanel.bookMoveFilteredDisabled': {
    label: {
      ja: 'フィルター中は並べ替えできません（すべて表示に切り替えてください）',
      en: 'Reordering is unavailable while filtering (switch to Show all)',
    },
  },
  'projectPanel.bookAddBook': {
    label: { ja: 'Bookを追加', en: 'Add book' },
  },
  'projectPanel.bookManifestInitHeading': {
    label: {
      ja: 'Book 管理が未初期化です',
      en: 'Book management is not initialized',
    },
  },
  'projectPanel.bookManifestInitDescription': {
    label: {
      ja: '最初の Book を作成すると、この作品の Book 構成を .nyoze/books.json で管理します。Markdown frontmatter は変更しません。',
      en: 'Creating the first book will manage this project’s book structure in .nyoze/books.json. Markdown frontmatter is not changed.',
    },
    helper: {
      ja: '初期化後、まだ Book / 資料に登録されていない `.md` / `.markdown` / `.txt` は未登録ファイル一覧に表示されます。',
      en: 'After initialization, unregistered `.md` / `.markdown` / `.txt` files in the project will appear in the Unregistered files section.',
    },
  },
  'projectPanel.bookManifestInitBookNameLabel': {
    label: { ja: '最初の Book 名', en: 'First book name' },
  },
  'projectPanel.bookManifestInitSubmit': {
    label: { ja: 'Book 管理を開始', en: 'Start book management' },
  },
  'projectPanel.bookManifestBrokenInvalid': {
    label: {
      ja: 'books.json が壊れているため Book 管理を開始できません。手動で確認してください。',
      en: 'Cannot start book management because books.json is corrupted. Please check it manually.',
    },
  },
  'projectPanel.bookManifestBrokenReadError': {
    label: {
      ja: 'books.json を読み取れないため Book 管理を開始できません。',
      en: 'Cannot start book management because books.json cannot be read.',
    },
  },
  'projectPanel.bookAddBodyItem': {
    label: { ja: '本文ファイルを追加', en: 'Add chapter file' },
  },
  'projectPanel.bookAddMaterial': {
    label: { ja: '資料を追加', en: 'Add material' },
  },
  'projectPanel.bookPathLabel': {
    label: { ja: 'ファイルパス', en: 'File path' },
  },
  'projectPanel.bookPathPlaceholder': {
    label: {
      ja: 'honpen/001.md（作品フォルダからの相対パス）',
      en: 'honpen/001.md (relative to project folder)',
    },
  },
  'projectPanel.bookRoleLabel': {
    label: { ja: '種類', en: 'Role' },
  },
  // Book manifest v3 metadata 編集（BookManifestV3Controls）。label 概念は使わない。
  'projectPanel.v3BookTitleLabel': {
    label: { ja: 'Book タイトル', en: 'Book title' },
  },
  'projectPanel.v3TitleLabel': {
    label: { ja: 'タイトル', en: 'Title' },
  },
  'projectPanel.v3AuthorsLabel': {
    label: { ja: '著者', en: 'Authors' },
  },
  'projectPanel.v3TranslatorsLabel': {
    label: { ja: '訳者', en: 'Translators' },
  },
  'projectPanel.v3AddAuthor': {
    label: { ja: '著者を追加', en: 'Add author' },
  },
  'projectPanel.v3AddTranslator': {
    label: { ja: '訳者を追加', en: 'Add translator' },
  },
  'projectPanel.v3CreditMoveUp': {
    label: { ja: '上へ', en: 'Move up' },
  },
  'projectPanel.v3CreditMoveDown': {
    label: { ja: '下へ', en: 'Move down' },
  },
  'projectPanel.v3CreditRemove': {
    label: { ja: '削除', en: 'Remove' },
  },
  'projectPanel.v3EditBookButton': {
    label: { ja: 'Book 情報を編集', en: 'Edit book details' },
  },
  'projectPanel.v3EditItemButton': {
    label: { ja: '本文情報を編集', en: 'Edit chapter details' },
  },
  'projectPanel.v3EditMaterialButton': {
    label: { ja: '資料情報を編集', en: 'Edit material details' },
  },
  'projectPanel.v3TitleRequired': {
    label: { ja: 'タイトルを入力してください', en: 'Enter a title' },
  },
  'projectPanel.v3CreditInvalid': {
    label: {
      ja: '著者・訳者に空の項目があるか、入力が不正です。',
      en: 'Authors/translators contain empty or invalid entries.',
    },
  },
  'projectPanel.v3BookNotEmpty': {
    label: {
      ja: 'Book に本文が残っているため削除できません。先に本文を登録解除してください。',
      en: 'Cannot remove a book that still has chapters. Unregister its chapters first.',
    },
  },
  'projectPanel.unregisteredHeading': {
    label: { ja: '未登録ファイル', en: 'Unregistered files' },
    tooltip: {
      ja: 'まだ Book / 資料に登録されていない `.md` / `.markdown` / `.txt`',
      en: '`.md` / `.markdown` / `.txt` not yet registered to a book or material',
    },
  },
  'projectPanel.unregisteredEmpty': {
    label: {
      ja: '未登録のファイルはありません',
      en: 'No unregistered files',
    },
    helper: {
      ja: '作品内の `.md` / `.markdown` / `.txt` のうち、まだ Book / 資料に登録されていないファイルがここに表示されます。',
      en: 'Files with `.md`, `.markdown`, or `.txt` extensions in the project that are not yet registered to a book or material appear here.',
    },
  },
  'projectPanel.unregisteredSectionHint': {
    label: {
      ja: '一覧から Book または資料へ登録します。',
      en: 'Register from the list to a book or material.',
    },
    helper: {
      ja: '一覧から Book または資料へ登録します。',
      en: 'Register from the list to a book or material.',
    },
  },
  'projectPanel.expandSection': {
    label: { ja: '展開', en: 'Expand' },
  },
  'projectPanel.collapseSection': {
    label: { ja: '折りたたみ', en: 'Collapse' },
  },
  'projectPanel.unregisteredAddToBook': {
    label: { ja: 'Bookに追加', en: 'Add to book' },
    tooltip: {
      ja: 'Book の本文（章）として登録します。アウトラインや前後章ナビに使われます。',
      en: 'Register as a book chapter (body file). Used for outline and prev/next navigation.',
    },
  },
  'projectPanel.unregisteredAddAsMaterial': {
    label: { ja: '資料にする', en: 'Add as material' },
    tooltip: {
      ja: '資料として登録します（人物・設定など）。Book の本文（章）ではありません。',
      en: 'Register as reference material (character, setting, etc.). Not a book chapter.',
    },
  },
  'projectPanel.unregisteredNoBooksHint': {
    label: { ja: '先に Book を作成', en: 'Create a book first' },
    tooltip: {
      ja: 'Book がないため、本文として追加できません。上の Books セクションで Book を作成してください。',
      en: 'No books yet. Create a book in the Books section above before adding chapters.',
    },
    helper: {
      ja: 'Book がないため、本文として追加できません。上の Books セクションで Book を作成してください。',
      en: 'No books yet. Create a book in the Books section above before adding chapters.',
    },
  },
  'projectPanel.createButton': {
    label: { ja: 'このフォルダを作品として設定', en: 'Set this folder as a project' },
  },
  'projectPanel.createModalTitle': {
    label: { ja: '作品を作成', en: 'Create project' },
  },
  'projectPanel.createSubmit': {
    label: { ja: '作成', en: 'Create' },
  },
  'projectPanel.createProjectTitleLabel': {
    label: { ja: '作品名', en: 'Project title' },
  },
  'projectPanel.createBookNameLabel': {
    label: { ja: '最初のBook名', en: 'First book name' },
  },
  'projectPanel.creating': {
    label: { ja: '作成中…', en: 'Creating…' },
  },
  'projectPanel.createTarget': {
    label: { ja: '対象フォルダ', en: 'Target folder' },
  },
  'projectPanel.createNoTarget': {
    label: {
      ja: '作品として設定できるフォルダがありません',
      en: 'No folder is available to set as a project',
    },
  },
  'projectPanel.createErrorOutsideWorkspace': {
    label: {
      ja: 'このフォルダは書庫の外にあるため作品にできません',
      en: 'This folder is outside the workspace and cannot become a project',
    },
  },
  'projectPanel.createErrorExists': {
    label: {
      ja: 'このフォルダはすでに作品です',
      en: 'This folder is already a project',
    },
  },
  'projectPanel.createErrorInsideProject': {
    label: {
      ja: 'このフォルダは既存の作品内にあるため、作品として設定できません。',
      en: 'This folder is inside an existing project and cannot be set as a new project.',
    },
  },
  'projectPanel.createErrorWorkspaceRoot': {
    label: {
      ja: '書庫ルートは作品フォルダにできません',
      en: 'The workspace root cannot be used as a project folder',
    },
  },
  'projectPanel.createErrorContainsProject': {
    label: {
      ja: 'このフォルダの中に既存の作品があります',
      en: 'This folder contains an existing project',
    },
  },
  'projectPanel.createErrorGeneric': {
    label: {
      ja: '作品の作成に失敗しました',
      en: 'Could not create the project',
    },
  },
  'projectPanel.unregisterProject': {
    label: {
      ja: '作品登録を解除',
      en: 'Unregister project',
    },
    tooltip: {
      ja: '作品の登録情報だけを外します（本文と付箋データは削除しません）',
      en: 'Remove project registration (manuscripts and notes data are not deleted)',
    },
  },
  'projectPanel.unregisterConfirm': {
    label: {
      ja: 'この操作は元に戻せません。作品登録を解除しますか？',
      en: 'This cannot be undone. Unregister this project?',
    },
    helper: {
      ja: '`.nyoze/project.json` と `.nyoze/books.json` の登録情報だけを外します。Markdown 本文と `notes.json` は削除しません。未削除の付箋がある場合は解除できません。',
      en: 'Removes only the registration in `.nyoze/project.json` and `.nyoze/books.json`. Markdown files and `notes.json` are not deleted. Unregister is blocked while non-deleted sticky notes exist.',
    },
  },
  'projectPanel.unregisterSubmit': {
    label: {
      ja: '解除する',
      en: 'Unregister',
    },
  },
  'projectPanel.unregisterErrorNotesExist': {
    label: {
      ja: '未削除の付箋があるため、作品登録を解除できません。先に付箋を整理してください。',
      en: 'Cannot unregister this project while non-deleted sticky notes exist. Resolve or remove notes first.',
    },
  },
  'projectPanel.unregisterErrorGeneric': {
    label: {
      ja: '作品登録の解除に失敗しました',
      en: 'Could not unregister the project',
    },
  },
  'documentNotes.panelTitle': {
    label: { ja: '付箋', en: 'Notes' },
  },
  'documentNotes.empty': {
    label: { ja: 'この文書には付箋がありません', en: 'This document has no notes' },
  },
  'documentNotes.loading': {
    label: { ja: '読み込み中…', en: 'Loading…' },
  },
  'documentNotes.jumpToText': {
    label: { ja: '本文へ', en: 'Go to text' },
  },
  'documentNotes.missingAnchor': {
    label: { ja: '本文中のマーカーが見つかりません', en: 'No marker found in the document' },
  },
  'documentNotes.orphanSectionTitle': {
    label: { ja: '本文中のマーカーが見つからない付箋', en: 'Notes without a document marker' },
  },
  'documentNotes.orphanHint': {
    label: {
      ja: '付箋データは残っていますが、本文に対応するマーカーがありません。自動削除は行いません。',
      en: 'The note data is kept, but no matching marker exists in the document. Nothing is deleted automatically.',
    },
  },
  'documentNotes.deleteOrphan': {
    label: { ja: '削除', en: 'Delete' },
  },
  'documentNotes.orphanDeleteConfirm': {
    label: {
      ja: '本文中にマーカーがない付箋を削除しますか？付箋データは一覧から非表示になります。',
      en: 'Delete this note without a document marker? The note data will be hidden from the list.',
    },
  },
  'documentNotes.missingFileSectionTitle': {
    label: { ja: '参照先ファイルがない付箋', en: 'Notes with missing files' },
  },
  'documentNotes.missingFileHint': {
    label: {
      ja: '付箋データは残っていますが、参照先の文書ファイルが見つかりません。自動削除はされません。',
      en: 'The note data remains, but the referenced document file was not found. Nothing is deleted automatically.',
    },
  },
  'documentNotes.deleteMissingFile': {
    label: { ja: '削除', en: 'Delete' },
  },
  'documentNotes.deleteAllMissingFile': {
    label: { ja: 'すべて削除', en: 'Delete all' },
  },
  'documentNotes.missingFileDeleteConfirm': {
    label: {
      ja: '参照先ファイルがない付箋を削除しますか？付箋データは一覧から非表示になります。',
      en: 'Delete this note with a missing file? The note data will be hidden from the list.',
    },
  },
  'documentNotes.missingFileDeleteAllConfirm': {
    label: {
      ja: '参照先ファイルがない付箋をすべて削除しますか？付箋データは一覧から非表示になります。',
      en: 'Delete all notes with missing files? The note data will be hidden from the list.',
    },
  },
  'documentNotes.edit': {
    label: { ja: '編集', en: 'Edit' },
  },
  'documentNotes.editTitleLabel': {
    label: { ja: 'タイトル', en: 'Title' },
  },
  'documentNotes.editTextLabel': {
    label: { ja: 'メモ (Markdown)', en: 'Note (Markdown)' },
  },
  'documentNotes.editSave': {
    label: { ja: '保存', en: 'Save' },
  },
  'documentNotes.editCancel': {
    label: { ja: 'キャンセル', en: 'Cancel' },
  },
  'documentNotes.editColorLabel': {
    label: { ja: '色', en: 'Color' },
  },
  'documentNotes.color.yellow': {
    label: { ja: '黄', en: 'Yellow' },
  },
  'documentNotes.color.gray': {
    label: { ja: '灰', en: 'Gray' },
  },
  'documentNotes.color.blue': {
    label: { ja: '青', en: 'Blue' },
  },
  'documentNotes.color.green': {
    label: { ja: '緑', en: 'Green' },
  },
  'documentNotes.color.pink': {
    label: { ja: '桃', en: 'Pink' },
  },
  'documentNotes.color.purple': {
    label: { ja: '紫', en: 'Purple' },
  },
  'documentNotes.resolvedSectionTitle': {
    label: { ja: '解決済み付箋', en: 'Resolved notes' },
  },
  'documentNotes.markResolved': {
    label: { ja: '解決済みにする', en: 'Mark resolved' },
  },
  'documentNotes.reopen': {
    label: { ja: '未解決に戻す', en: 'Reopen' },
  },
  'documentNotes.showMore': {
    label: { ja: '全文表示', en: 'Show more' },
  },
  'documentNotes.showLess': {
    label: { ja: '一部表示', en: 'Show less' },
  },
  'documentNotes.collapseCard': {
    label: { ja: '付箋カードを折りたたむ', en: 'Collapse note card' },
  },
  'documentNotes.expandCard': {
    label: { ja: '付箋カードを展開する', en: 'Expand note card' },
  },
  'documentNotes.tagSlotsTitle': {
    label: { ja: '付箋タグ', en: 'Note tags' },
  },
  'documentNotes.tagSlotsHint': {
    label: {
      ja: '作品内で共有するタグ名を最大6件まで登録できます。未入力のスロットは付箋編集の候補に出ません。',
      en: 'Register up to six shared tag names for this project. Empty slots are omitted from note edit choices.',
    },
  },
  'documentNotes.tagSlotsSave': {
    label: { ja: 'タグを保存', en: 'Save tags' },
  },
  'documentNotes.tagAdd': {
    label: { ja: 'タグを追加', en: 'Add tag' },
  },
  'documentNotes.tagAddLabel': {
    label: { ja: '新しいタグ名', en: 'New tag name' },
  },
  'documentNotes.tagEdit': {
    label: { ja: 'タグ名を編集', en: 'Edit tag name' },
  },
  'documentNotes.tagEditLabel': {
    label: { ja: 'タグ名', en: 'Tag name' },
  },
  'documentNotes.tagDelete': {
    label: { ja: 'タグを削除', en: 'Delete tag' },
  },
  'documentNotes.tagSave': {
    label: { ja: '保存', en: 'Save' },
  },
  'documentNotes.tagDeleteConfirm': {
    label: {
      ja: 'このタグは {count} 件の付箋から外れます。付箋自体は削除されません。続行しますか？',
      en: 'This tag will be removed from {count} note(s). The notes themselves will not be deleted. Continue?',
    },
  },
  'documentNotes.tagOpsHint': {
    label: {
      ja: '登録済みタグ名を変更すると、そのタグを付けた付箋カードの表示も更新されます。タグを削除しても付箋自体は削除されません。削除したタグは、そのタグを付けていた付箋から外れます。',
      en: 'Renaming a registered tag updates chips on notes that use it. Deleting a tag does not delete notes; it only removes that tag from affected notes.',
    },
  },
  'documentNotes.editTagsLabel': {
    label: { ja: 'タグ', en: 'Tags' },
  },
  'documentNotes.noteTagsLabel': {
    label: { ja: '付箋タグ', en: 'Note tags' },
  },
  'documentNotes.tagsUnsetHint': {
    label: { ja: '付箋タグが未設定です', en: 'No note tags are configured yet.' },
  },
  'documentNotes.tagFilterTitle': {
    label: { ja: '表示フィルタ', en: 'Display filter' },
  },
  'documentNotes.tagFilterAll': {
    label: { ja: 'すべて', en: 'All' },
  },
  'documentNotes.tagFilterEmpty': {
    label: { ja: 'このタグの付箋はありません。', en: 'No notes with this tag.' },
  },
  'menu.file': {
    label: { ja: 'ファイル', en: 'File' },
  },
  'menu.edit': {
    label: { ja: '編集', en: 'Edit' },
  },
  'menu.view': {
    label: { ja: '表示', en: 'View' },
  },
  'menu.window': {
    label: { ja: 'ウィンドウ', en: 'Window' },
  },
  'menu.help': {
    label: { ja: 'ヘルプ', en: 'Help' },
  },
  'help.openManual': {
    label: { ja: 'MANUAL を開く', en: 'Open Manual' },
  },
  'help.shortcutsReference': {
    label: { ja: 'ショートカットキー一覧', en: 'Keyboard Shortcuts' },
  },
  'menu.bringAllToFront': {
    label: { ja: 'すべてを手前に移動', en: 'Bring All to Front' },
  },
  'menu.openBackupFolder': {
    label: { ja: 'バックアップフォルダを開く', en: 'Open Backup Folder' },
  },
  'menu.openFileBackupFolder': {
    label: { ja: 'このファイルのバックアップを開く', en: 'Open Backup for This File' },
  },
  'menu.export': {
    label: { ja: '書き出し', en: 'Export' },
  },
  'menu.exportAozoraText': {
    label: { ja: '青空文庫風テキストを書き出し', en: 'Export Aozora-style Text' },
  },
  'export.aozoraSuccess': {
    label: { ja: '青空文庫風テキストを書き出しました。', en: 'Exported Aozora-style text.' },
  },
  'export.aozoraSuccessWithWarnings': {
    label: {
      ja: '青空文庫風テキストを書き出しました。ただし一部の装飾は近似または省略されました。',
      en: 'Exported Aozora-style text with warnings.',
    },
  },
  'export.aozoraPlainModeBlocked': {
    label: {
      ja: '青空文庫風テキストの書き出しは通常表示に戻してから実行してください。',
      en: 'Return to normal view before exporting Aozora-style text.',
    },
  },
  'menu.exportLeMEMarkdown': {
    label: { ja: 'LeME 互換 Markdown を書き出し', en: 'Export LeME-compatible Markdown' },
  },
  'export.lemeSuccess': {
    label: { ja: 'LeME 互換 Markdown を書き出しました。', en: 'Exported LeME-compatible Markdown.' },
  },
  'export.lemeSuccessWithWarnings': {
    label: {
      ja: 'LeME 互換 Markdown を書き出しました。ただし一部の装飾は近似または省略されました。',
      en: 'Exported LeME-compatible Markdown with warnings.',
    },
  },
  'export.lemePlainModeBlocked': {
    label: {
      ja: 'LeME 互換 Markdown の書き出しは通常表示に戻してから実行してください。',
      en: 'Return to normal view before exporting LeME-compatible Markdown.',
    },
  },
  'menu.exportDendenMarkdown': {
    label: {
      ja: 'でんでんコンバーター向け Markdown を書き出し',
      en: 'Export Denden-compatible Markdown',
    },
  },
  'export.dendenSuccess': {
    label: {
      ja: 'でんでんコンバーター向け Markdown を書き出しました。',
      en: 'Exported Denden-compatible Markdown.',
    },
  },
  'export.dendenSuccessWithWarnings': {
    label: {
      ja: 'でんでんコンバーター向け Markdown を書き出しました。ただし一部の装飾は近似または省略されました。',
      en: 'Exported Denden-compatible Markdown with warnings.',
    },
  },
  'export.dendenRejectedPlainMode': {
    label: {
      ja: 'でんでんコンバーター向け Markdown の書き出しは通常表示に戻してから実行してください。',
      en: 'Return to normal view before exporting Denden-compatible Markdown.',
    },
  },
  'menu.exportWebBook': {
    label: { ja: 'Web Bookを作成', en: 'Create Web Book' },
  },
  'export.webBookSuccess': {
    label: { ja: 'Web Bookを作成しました。', en: 'Created Web Book.' },
  },
  'export.webBookSuccessWithWarnings': {
    label: { ja: 'Web Bookを作成しました。ただし一部の装飾やリンク・画像は近似または省略されました。', en: 'Created Web Book with warnings.' },
  },
  'export.webBookPlainModeBlocked': {
    label: { ja: 'Web Bookの作成は通常表示に戻してから実行してください。', en: 'Return to normal view before creating a Web Book.' },
  },
  'export.webBookPaletteInvalid': {
    label: { ja: 'Web Bookの文書配色が不正なため作成できません。', en: 'Cannot create a Web Book because the document colors are invalid.' },
  },
  'export.webBookTypographyInvalid': {
    label: {
      ja: 'Web Bookの見出し表示設定が不正なため作成できません。',
      en: 'Cannot create a Web Book because the heading display settings are invalid.',
    },
  },
  'export.webBookAutoTcyInvalid': {
    label: {
      ja: 'Web Bookの自動TCY設定が不正なため作成できません。',
      en: 'Cannot create a Web Book because the auto TCY settings are invalid.',
    },
  },
  'export.webBookFailureSourceUnavailable': {
    label: {
      ja: '画像を含む文書を Web Book として書き出すには、先に文書を保存してください。',
      en: 'Save the document first to create a Web Book containing images.',
    },
  },
  'export.webBookFailureAssetError': {
    label: {
      ja: '一部の画像を埋め込めなかったため、Web Bookの作成を中止しました。詳細を確認してください。',
      en: 'Some images could not be embedded, so Web Book creation was canceled. Check the details.',
    },
  },
  'export.webBookFailureHtmlTooLarge': {
    label: {
      ja: '画像を埋め込んだ結果、単一 HTML のサイズが上限（100 MiB）を超えたため作成を中止しました。書き出しオプションで「Web 公開用パッケージ」を選んでください。',
      en: 'Web Book creation was canceled because the single HTML file would exceed the 100 MiB limit after embedding images. Choose the Web package output profile instead.',
    },
  },
  'export.webBookCapacityTitle': {
    label: { ja: 'Web Book の容量確認', en: 'Web Book size confirmation' },
  },
  'export.webBookCapacityCurrentProfile': {
    label: { ja: '現在の出力形式', en: 'Current output profile' },
  },
  'export.webBookCapacityProfileSingleHtml': {
    label: { ja: '単一 HTML', en: 'Single HTML' },
  },
  'export.webBookCapacityProfilePackage': {
    label: { ja: 'Web 公開用パッケージ', en: 'Web package' },
  },
  'export.webBookCapacitySingleHtmlSize': {
    label: { ja: '単一 HTML の最終サイズ', en: 'Final single HTML size' },
  },
  'export.webBookCapacityPackageSummary': {
    label: { ja: '画像の合計（重複除外後）', en: 'Image total (after dedupe)' },
  },
  'export.webBookCapacityImagesUnit': {
    label: { ja: '枚', en: 'images' },
  },
  'export.webBookCapacitySingleHtmlStrongWarn': {
    label: {
      ja: '単一 HTML が 50 MiB を超えています。ブラウザでの扱いが重くなることがあるため、Web 公開用パッケージへの切り替えを推奨します。',
      en: 'The single HTML file exceeds 50 MiB. Switching to a Web package is recommended because browsers may struggle with large files.',
    },
  },
  'export.webBookCapacityPackageSizeWarn': {
    label: {
      ja: 'パッケージの画像合計が 200 MiB を超えています。',
      en: 'Package image total exceeds 200 MiB.',
    },
  },
  'export.webBookCapacityPackageCountWarn': {
    label: {
      ja: 'パッケージの画像数が 1,000 枚を超えています。',
      en: 'Package image count exceeds 1,000.',
    },
  },
  'export.webBookCapacityLargeImagesIntro': {
    label: {
      ja: '次の画像は 10 MiB を超えています（重複除外後）。',
      en: 'These unique images exceed 10 MiB:',
    },
  },
  'export.webBookCapacityCancelNote': {
    label: {
      ja: 'キャンセルするとファイルは書き出されません。設定の出力形式は変わりません。',
      en: 'Cancel leaves no files written. Your saved output profile is unchanged.',
    },
  },
  'export.webBookCapacityCancel': {
    label: { ja: 'キャンセル', en: 'Cancel' },
  },
  'export.webBookCapacityProceed': {
    label: { ja: 'このまま書き出す', en: 'Export anyway' },
  },
  'export.webBookCapacityContinueSingleHtml': {
    label: { ja: '単一 HTML として続行', en: 'Continue as single HTML' },
  },
  'export.webBookCapacitySwitchPackage': {
    label: { ja: 'Web 公開用パッケージとして出力', en: 'Export as Web package' },
  },
  'export.webBookAssetResultDetailsTitle': {
    label: { ja: '画像の埋め込みエラー', en: 'Image embedding errors' },
  },
  'export.webBookAssetResultDetailsSummary': {
    label: {
      ja: '{count} 件の画像を埋め込めなかったため、Web Book は作成されませんでした。',
      en: '{count} image(s) could not be embedded, so no Web Book was created.',
    },
  },
  'menu.exportBookLeME': {
    label: { ja: 'Book 全体を LeME 互換 Markdown で書き出し', en: 'Export Book as LeME Markdown' },
  },
  'menu.exportBookDenden': {
    label: {
      ja: 'Book 全体を でんでんコンバーター向け Markdown で書き出し',
      en: 'Export Book as Denden Markdown',
    },
  },
  'menu.exportBookAozora': {
    label: { ja: 'Book 全体を青空文庫風テキストで書き出し', en: 'Export Book as Aozora Text' },
  },
  'menu.exportBookWebBook': {
    label: { ja: 'Book 全体の Web Bookを作成', en: 'Create Web Book for Entire Book' },
  },
  'menu.bookPageViewer': {
    label: { ja: 'Book 全体をページビューアで開く', en: 'Open Book in Page Viewer' },
  },
  'pageViewer.bookDirtyNotice': {
    label: {
      ja: '未保存の編集は反映されません。ディスク上の保存済みファイルから Book 全体をページビューアで開きます。',
      en: 'Unsaved edits are not included. Opening the book from saved files on disk.',
    },
  },
  'pageViewer.bookFailureUnavailable': {
    label: {
      ja: 'Book 全体のページビューアを開けません。ファイルを開いてから再試行してください。',
      en: 'Cannot open the book in Page Viewer. Open a file and try again.',
    },
  },
  'pageViewer.bookFailureNotInProject': {
    label: {
      ja: 'Book 全体のページビューアは、作品内のファイルを開いているときだけ実行できます。',
      en: 'Book Page Viewer is available only when a file inside a project is open.',
    },
  },
  'pageViewer.bookFailureNoBodyChapter': {
    label: {
      ja: 'Book 全体のページビューアは、作品内の Book 本文章を開いているときだけ実行できます。資料や未登録ファイルでは実行できません。',
      en: 'Book Page Viewer requires an open Book body chapter. Materials and unregistered files are not supported.',
    },
  },
  'pageViewer.bookFailureManifestDiagnostics': {
    label: {
      ja: '`.nyoze/books.json` に問題があるため Book 全体のページビューアを開けません。作品タブの警告を確認してから再試行してください。',
      en: 'Cannot open the book in Page Viewer because `.nyoze/books.json` has diagnostics warnings. Check the project pane and try again.',
    },
  },
  'pageViewer.bookFailureManifest': {
    label: {
      ja: '`.nyoze/books.json` を読み取れないため Book 全体のページビューアを開けません。',
      en: 'Cannot open the book in Page Viewer because `.nyoze/books.json` could not be read.',
    },
  },
  'pageViewer.bookFailureBookNotFound': {
    label: {
      ja: '対象の Book が見つかりませんでした。作品タブの登録を確認してください。',
      en: 'The target book was not found. Check the project Books registration.',
    },
  },
  'pageViewer.bookFailureNoBodyItems': {
    label: {
      ja: '対象の Book に本文（body）章が登録されていないためページビューアを開けません。',
      en: 'The target book has no body chapters to open in Page Viewer.',
    },
  },
  'pageViewer.bookFailureMissingChapters': {
    label: {
      ja: '一部の章を読み取れなかったため Book 全体のページビューアを開けませんでした。欠損章や読み取りエラーを確認してください。',
      en: 'Book Page Viewer failed because some chapters could not be read. Check missing chapters or read errors.',
    },
  },
  'pageViewer.bookFailureValidation': {
    label: {
      ja: 'Book 全体のページビューアリクエストが無効です。',
      en: 'The Book Page Viewer request was invalid.',
    },
  },
  'export.bookSuccessFromDisk': {
    label: {
      ja: 'Book 全体をディスク上の保存済みファイルから書き出しました。',
      en: 'Exported the book from saved files on disk.',
    },
  },
  'export.bookSuccessFromDiskWithWarnings': {
    label: {
      ja: 'Book 全体をディスク上の保存済みファイルから書き出しました。ただし一部の章または装飾に警告があります。',
      en: 'Exported the book from saved files on disk with warnings.',
    },
  },
  'export.bookDirtyNotice': {
    label: {
      ja: '未保存の編集は反映されません。ディスク上の保存済みファイルから Book 全体を書き出します。',
      en: 'Unsaved edits are not included. Exporting the book from saved files on disk.',
    },
  },
  'export.bookFailureUnavailable': {
    label: {
      ja: 'Book 全体の書き出しを実行できません。ファイルを開いてから再試行してください。',
      en: 'Cannot export the book. Open a file and try again.',
    },
  },
  'export.bookFailureNotInProject': {
    label: {
      ja: 'Book 全体の書き出しは、作品内のファイルを開いているときだけ実行できます。',
      en: 'Book export is available only when a file inside a project is open.',
    },
  },
  'export.bookFailureNoBodyChapter': {
    label: {
      ja: 'Book 全体の書き出しは、作品内の Book 本文章を開いているときだけ実行できます。資料や未登録ファイルでは実行できません。',
      en: 'Book export requires an open Book body chapter. Materials and unregistered files are not supported.',
    },
  },
  'export.bookFailureManifestDiagnostics': {
    label: {
      ja: '`.nyoze/books.json` に問題があるため Book 全体を書き出せません。作品タブの警告を確認してから再試行してください。',
      en: 'Cannot export the book because `.nyoze/books.json` has diagnostics warnings. Check the project pane and try again.',
    },
  },
  'export.bookFailureManifest': {
    label: {
      ja: '`.nyoze/books.json` を読み取れないため Book 全体を書き出せません。',
      en: 'Cannot export the book because `.nyoze/books.json` could not be read.',
    },
  },
  'export.bookFailureBookNotFound': {
    label: {
      ja: '対象の Book が見つかりませんでした。作品タブの登録を確認してください。',
      en: 'The target book was not found. Check the project Books registration.',
    },
  },
  'export.bookFailureNoBodyItems': {
    label: {
      ja: '対象の Book に本文（body）章が登録されていないため書き出せません。',
      en: 'The target book has no body chapters to export.',
    },
  },
  'export.bookFailureMissingChapters': {
    label: {
      ja: '一部の章を読み取れなかったため Book 全体を書き出せませんでした。欠損章や読み取りエラーを確認してください。',
      en: 'Book export failed because some chapters could not be read. Check missing chapters or read errors.',
    },
  },
  'export.bookFailureValidation': {
    label: {
      ja: 'Book 全体の書き出しリクエストが無効です。',
      en: 'The book export request was invalid.',
    },
  },
  'export.optionsTitleDocument': {
    label: { ja: '書き出しオプション', en: 'Export Options' },
  },
  'export.optionsTitleBook': {
    label: { ja: 'Book 全体 export オプション', en: 'Book Export Options' },
  },
  'export.optionsPageBreak': {
    label: { ja: '改ページを反映する', en: 'Include page breaks' },
    helper: {
      ja: '明示的な `:::page-break` と、見出し前の自動改ページ設定を書き出しに反映します。オフにすると改ページは一切出力されません。',
      en: 'Applies explicit `:::page-break` markers and the auto page-break-before-heading setting. When off, no page breaks are output at all.',
    },
  },
  'export.optionsPageBreakBeforeHeading': {
    label: { ja: '見出しの前で自動改ページ', en: 'Auto page break before headings' },
    helper: {
      ja: '見出しの直前に自動で改ページを挿入します。「改ページを反映する」がオフの場合は無効です。',
      en: 'Inserts an automatic page break right before each heading. Disabled when "Include page breaks" is off.',
    },
  },
  'export.optionsPageBreakBeforeHeadingMaxLevel': {
    label: { ja: '対象見出しレベル', en: 'Heading level range' },
    helper: {
      ja: '「見出しの前で自動改ページ」の対象をどの見出しレベルまでにするか選べます（既定は「H1のみ」）。「H1〜H6」は全ての見出しが対象になります。「見出しの前で自動改ページ」がオフの場合は無効です。',
      en: 'Chooses how deep the auto page-break-before-heading setting reaches (default: "H1 only"). "H1–H6" targets every heading level. Disabled when "Auto page break before headings" is off.',
    },
  },
  'export.optionsHeadingLevelH1Only': {
    label: { ja: 'H1のみ', en: 'H1 only' },
  },
  'export.optionsHeadingLevelUpTo': {
    label: { ja: 'H1〜H{level}', en: 'H1–H{level}' },
  },
  'export.optionsAutoTcy': {
    label: { ja: '自動 TCY を反映する', en: 'Apply auto TCY' },
  },
  'export.optionsAutoTcyLeme': {
    label: { ja: '自動 TCY を反映する', en: 'Apply auto TCY' },
    helper: {
      ja: '短い英数字は書き出し先の縦中横記法（`^...^`）として、!! / !? / ?? は LeME 既定 CSS の `<span class="tcy">...</span>` として出力します（CSS ファイル自体は出力しません）。明示 TCY・ルビ・リンク・コードは対象外です。Display Settings の自動 TCY とは独立で、書字方向でも制限しません。',
      en: 'Exports short alphanumerics as `^...^`, and !! / !? / ?? as LeME’s default `<span class="tcy">...</span>` (no companion CSS file is written). Explicit TCY, ruby, links, and code are excluded. Independent of Display Settings auto TCY, and not gated by writing mode.',
    },
  },
  'export.optionsAutoTcyDenden': {
    label: { ja: '自動 TCY を反映する', en: 'Apply auto TCY' },
    helper: {
      ja: '短い英数字と !! / !? / ?? を、でんでん向けの縦中横記法（`^...^`）として出力します。明示 TCY・ルビ・リンク・コードは対象外です。Display Settings の自動 TCY とは独立で、書字方向でも制限しません。HTML / 青空文庫風 TXT には出ません。',
      en: 'Exports short alphanumerics and !! / !? / ?? as Denden’s TCY syntax (`^...^`). Explicit TCY, ruby, links, and code are excluded. Independent of Display Settings auto TCY, and not gated by writing mode. Not applied to HTML or Aozora-style TXT.',
    },
  },
  'export.optionsTcyNumbersOnly': {
    label: { ja: '数字だけを対象にする', en: 'Numbers only' },
    helper: {
      ja: '自動 TCY の対象を数字と !! / !? / ?? に絞り、英字混じりは除外します。「自動 TCY を反映する」がオフのときは無効です。',
      en: 'Limits auto TCY to digits and !! / !? / ??, excluding letter mixes. Disabled when "Apply auto TCY" is off.',
    },
  },
  'export.optionsTcyMinDigits': {
    label: { ja: '最小桁数', en: 'Minimum digits' },
    helper: {
      ja: '自動 TCY の対象にする最小桁数です（1〜4）。最大桁数より大きい値を選ぶと、書き出し時に大小が入れ替わります。「自動 TCY を反映する」がオフのときは無効です。',
      en: 'Minimum digit count for auto TCY (1–4). If greater than the maximum, values are swapped at export time. Disabled when "Apply auto TCY" is off.',
    },
  },
  'export.optionsTcyMaxDigits': {
    label: { ja: '最大桁数', en: 'Maximum digits' },
    helper: {
      ja: '自動 TCY の対象にする最大桁数です（1〜4）。最小桁数より小さい値を選ぶと、書き出し時に大小が入れ替わります。「自動 TCY を反映する」がオフのときは無効です。',
      en: 'Maximum digit count for auto TCY (1–4). If less than the minimum, values are swapped at export time. Disabled when "Apply auto TCY" is off.',
    },
  },
  'export.htmlOptionsIncludeDocumentInfo': {
    label: { ja: '文書情報を表示', en: 'Show document info' },
    helper: {
      ja: 'frontmatter の title / author / translator を本文冒頭に表示します。空の項目は表示されません。',
      en: 'Shows the frontmatter title / author / translator at the top of the document. Empty fields are omitted.',
    },
  },
  /**
   * Book 全体 export（LeME / でんでん / 青空文庫風 / HTML の 4 形式共通）専用の
   * 「作品情報を表示」option（`includeBookInfo`）。単独文書 export の
   * `export.htmlOptionsIncludeDocumentInfo`（frontmatter 由来）とは別の、
   * 独立した selection field（`ExternalExportOptionsSelection.includeBookInfo`）
   * に紐づく。冒頭情報の出所は `.nyoze/books.json` v3 の Book metadata（作品名 /
   * 著者）で、章ファイルの frontmatter は参照しない。2026-07-08 時点では HTML
   * export だけがこの option を持っていたが、2026-07-09 に LeME / でんでん /
   * 青空文庫風にも拡張した（`docs/book-export-design-2026-07.md` §7.4）。
   */
  'export.htmlOptionsIncludeBookInfo': {
    label: { ja: '作品情報を表示', en: 'Show Book Info' },
    helper: {
      ja: '.nyoze/books.json の作品名 / 著者を本文冒頭に表示します。空の項目は表示されません。',
      en: 'Shows the book title and authors from .nyoze/books.json at the beginning. Empty fields are omitted.',
    },
  },
  'export.htmlOptionsShowRoleLabels': {
    label: { ja: '役割ラベルを表示', en: 'Show role labels' },
    helper: {
      ja: '著者・訳者の行に「著　」「訳　」のラベルを付けます。オフにすると名前だけを表示します。「文書情報を表示」がオフの場合は無効です。',
      en: 'Adds "著　" / "訳　" role labels to the author/translator lines. When off, only the names are shown. Disabled when "Show document info" is off.',
    },
  },
  /**
   * `export.htmlOptionsShowRoleLabels` の Book scope 版。単独文書は
   * 「文書情報を表示」1 つだけが disabled 条件だが、Book 全体 export では
   * 「作品情報を表示」「章ファイル情報を表示」のどちらか一方が ON なら有効になる
   * ため、disabled 条件の説明文だけ別立てする（checked 状態・payload の
   * option 名 `showRoleLabels` 自体は共通）。
   */
  'export.htmlOptionsShowRoleLabelsBook': {
    label: { ja: '役割ラベルを表示', en: 'Show role labels' },
    helper: {
      ja: '著者・訳者の行に「著　」「訳　」のラベルを付けます。オフにすると名前だけを表示します。「作品情報を表示」「章ファイル情報を表示」がどちらもオフの場合は無効です。',
      en: 'Adds "著　" / "訳　" role labels to the author/translator lines. When off, only the names are shown. Disabled when both "Show Book Info" and "Show Chapter Info" are off.',
    },
  },
  /**
   * Web Book 専用。単独文書は「文書情報の後ろで改ページ」、Book は
   * 「作品情報の後ろで改ページ」。`breakAfterDocumentInfo` を共有し、
   * label / helper / disabled 条件だけ scope で出し分ける。
   */
  'export.webBookOptionsBreakAfterDocumentInfo': {
    label: { ja: '文書情報の後ろで改ページ', en: 'Page break after document info' },
    helper: {
      ja: '文書情報を独立したページにし、その直後から本文または目次を始めます。「文書情報を表示」がオフの場合は無効です。',
      en: 'Puts document info on its own page, then starts the body or TOC. Disabled when "Show document info" is off.',
    },
  },
  'export.webBookOutputProfile': {
    label: { ja: '出力形式', en: 'Output format' },
    helper: { ja: '単一 HTML は画像を埋め込みます。Web 公開用パッケージは画像を assets フォルダに出力します。', en: 'Single HTML embeds images. The web-public package writes images into an assets folder.' },
  },
  'export.webBookOutputProfileSingleHtml': { label: { ja: '単一 HTML', en: 'Single HTML' } },
  'export.webBookOutputProfilePackage': { label: { ja: 'Web 公開用パッケージ（HTML と assets フォルダ）', en: 'Web-public package (HTML and assets folder)' } },
  'export.webBookOptionsBreakAfterBookInfo': {
    label: { ja: '作品情報の後ろで改ページ', en: 'Page break after book info' },
    helper: {
      ja: '作品情報を独立したページにし、その直後から本文または目次を始めます。「作品情報を表示」がオフの場合は無効です。章ファイル情報には適用しません。',
      en: 'Puts book info on its own page, then starts the body or TOC. Disabled when "Show Book Info" is off. Does not apply to chapter info.',
    },
  },
  /**
   * Web Book 専用（WB-R9）。単独文書は「文書情報を簡易表紙として表示」、Book は
   * 「作品情報を簡易表紙として表示」。selection field は `documentInfoTitlePage` を
   * 共有し、label / helper / disabled 条件だけ scope で出し分ける。ON の間は
   * 「後ろで改ページ」を必ず ON にする（簡易表紙は常に独立ページ）。
   */
  'export.webBookOptionsDocumentInfoTitlePage': {
    label: { ja: '文書情報を簡易表紙として表示', en: 'Show document info as a title page' },
    helper: {
      ja: '文書情報を1ページ分の簡易表紙として表示します。オンの間は「文書情報の後ろで改ページ」が常にオンになります。「文書情報を表示」がオフの場合は無効です。',
      en: 'Shows document info as a simple one-page title page. While on, "Page break after document info" is always on. Disabled when "Show document info" is off.',
    },
  },
  'export.webBookOptionsBookInfoTitlePage': {
    label: { ja: '作品情報を簡易表紙として表示', en: 'Show book info as a title page' },
    helper: {
      ja: '作品情報を1ページ分の簡易表紙として表示します。オンの間は「作品情報の後ろで改ページ」が常にオンになります。「作品情報を表示」がオフの場合は無効です。章ファイル情報には適用しません。',
      en: 'Shows book info as a simple one-page title page. While on, "Page break after book info" is always on. Disabled when "Show Book Info" is off. Does not apply to chapter info.',
    },
  },
  'export.webBookOptionsTitlePageLayout': {
    label: { ja: '簡易表紙のレイアウト', en: 'Title page layout' },
    helper: {
      ja: '「通常」はタイトルを上付き、著者・訳者を地付きにします。「中央」はページの中央に配置します（縦書きではタイトルが上、著者・訳者が下になり、左右中央に揃います）。',
      en: '"Normal" places the title at the start and the credits at the end (jizuki). "Center" centers the metadata within the page (in vertical writing, the title goes to the top and the credits to the bottom, horizontally centered).',
    },
  },
  'export.webBookOptionsTitlePageLayoutNormal': {
    label: { ja: '通常', en: 'Normal' },
  },
  'export.webBookOptionsTitlePageLayoutCenter': {
    label: { ja: '中央', en: 'Center' },
  },
  'export.webBookOptionsTitlePageWritingMode': {
    label: { ja: '簡易表紙の書字方向', en: 'Title page writing direction' },
    helper: {
      ja: '簡易表紙の情報だけの書字方向です。本文・目次の書字方向は変わりません。',
      en: 'Writing direction of the title page metadata only. Body and TOC writing direction are unchanged.',
    },
  },
  'export.webBookOptionsTitlePageWritingModeInherit': {
    label: { ja: '本文に合わせる', en: 'Same as body' },
  },
  'export.webBookOptionsTitlePageWritingModeVertical': {
    label: { ja: '縦書き', en: 'Vertical' },
  },
  'export.webBookOptionsTitlePageWritingModeHorizontal': {
    label: { ja: '横書き', en: 'Horizontal' },
  },
  'export.htmlOptionsIncludeTableOfContents': {
    label: { ja: '目次を表示', en: 'Show table of contents' },
    helper: {
      ja: '見出しから生成した目次を本文冒頭に表示します。含める見出しレベルは下の選択で指定できます。',
      en: 'Shows a table of contents generated from headings at the top of the document. Choose which heading levels to include below.',
    },
  },
  'export.htmlOptionsTableOfContentsMaxLevel': {
    label: { ja: '目次に含める見出しレベル', en: 'TOC heading level range' },
    helper: {
      ja: '「目次を表示」がオンのとき、どの見出しレベルまで目次に含めるか選べます（既定は「H1〜H6」）。目次に含まれない見出しにはリンク用 id も付きません。「目次を表示」がオフの場合は無効です。',
      en: 'When "Show table of contents" is on, chooses how deep headings appear in the TOC (default: "H1–H6"). Headings outside the range get no TOC anchor id. Disabled when the TOC is off.',
    },
  },
  'export.htmlOptionsIncludeChapterInfo': {
    label: { ja: '章ファイル情報を表示', en: 'Show Chapter Info' },
    helper: {
      ja: '各章ファイルの先頭に、その章の title / 著者 / 訳者（.nyoze/books.json の章メタデータ。章ファイルの frontmatter ではありません）を表示します。空の項目は表示されません。Book 全体 export（LeME / でんでん / 青空文庫風 / HTML）専用です。',
      en: 'Shows the title / authors / translators of each chapter at the start of that chapter (from the chapter metadata in .nyoze/books.json, not the chapter file frontmatter). Empty fields are omitted. Book-wide export (LeME / Denden / Aozora / HTML) only.',
    },
  },
  'export.bookOptionsInsertBetweenChapters': {
    label: { ja: '章の境界に改ページを入れる', en: 'Insert page break between chapters' },
    helper: {
      ja: 'Book の章ファイルが切り替わる箇所に改ページを挿入します。',
      en: 'Inserts a page break where each chapter file boundary occurs.',
    },
  },
  'export.optionsConfirm': {
    label: { ja: '書き出す', en: 'Export' },
  },
  'export.bookResultDetailsTitleWarnings': {
    label: { ja: 'Book 全体 export の警告', en: 'Book export warnings' },
  },
  'export.bookResultDetailsTitleMissingChapters': {
    label: { ja: 'Book 全体 export を中断しました', en: 'Book export could not complete' },
  },
  'export.bookResultDetailsMissingSummary': {
    label: {
      ja: '{count} / {total} 章を読み取れなかったため、部分的な書き出しは行いませんでした。',
      en: '{count} of {total} chapters could not be read, so no partial file was written.',
    },
  },
  'export.bookResultDetailsChapterSectionTitle': {
    label: { ja: '章の問題', en: 'Chapter issues' },
  },
  'export.bookResultDetailsConversionSectionTitle': {
    label: { ja: '変換時の警告', en: 'Conversion warnings' },
  },
  'export.bookResultDetailsChapterMissing': {
    label: { ja: 'ファイルが見つかりません', en: 'File not found' },
  },
  'export.bookResultDetailsChapterReadError': {
    label: { ja: '読み込みエラー', en: 'Read error' },
  },
  'export.bookFailureAssetError': {
    label: {
      ja: '一部の画像を埋め込めなかったため、Web Bookの作成を中止しました。詳細を確認してください。',
      en: 'Some images could not be embedded, so Web Book creation was canceled. Check the details.',
    },
  },
  'export.bookFailureHtmlTooLarge': {
    label: {
      ja: '画像を埋め込んだ結果、単一 HTML のサイズが上限（100 MiB）を超えたため作成を中止しました。書き出しオプションで「Web 公開用パッケージ」を選んでください。',
      en: 'Web Book creation was canceled because the single HTML file would exceed the 100 MiB limit after embedding images. Choose the Web package output profile instead.',
    },
  },
  'export.bookResultDetailsTitleAssetError': {
    label: { ja: 'Web Book 画像の埋め込みエラー', en: 'Web Book image embedding errors' },
  },
  'export.bookResultDetailsAssetSectionTitle': {
    label: { ja: '画像の問題', en: 'Image issues' },
  },
  'menu.viewSettings': {
    label: { ja: '表示設定', en: 'View Settings' },
  },
  'menu.pageViewer': {
    label: { ja: 'ページビューア', en: 'Page Viewer' },
  },
  'menu.resetZoom': {
    label: { ja: 'ズームをリセット', en: 'Actual Size' },
  },
  'menu.zoomIn': {
    label: { ja: '拡大', en: 'Zoom In' },
  },
  'menu.zoomOut': {
    label: { ja: '縮小', en: 'Zoom Out' },
  },
  'menu.toggleFullscreen': {
    label: { ja: 'フルスクリーン切替', en: 'Toggle Full Screen' },
  },
  'themeStudio.title': {
    label: { ja: 'テーマ管理', en: 'Theme Studio' },
  },
  'themeStudio.tab.ui': {
    label: { ja: 'UIテーマ', en: 'UI Theme' },
  },
  'themeStudio.tab.doc': {
    label: { ja: '文書テーマ', en: 'Document Theme' },
  },
  'header.openLeftPane': {
    label: { ja: '左ペインを開く', en: 'Open Left Pane' },
  },
  'header.closeLeftPane': {
    label: { ja: '左ペインを閉じる', en: 'Close Left Pane' },
  },
  'header.openRightPane': {
    label: { ja: '右ペインを開く', en: 'Open Right Pane' },
  },
  'header.closeRightPane': {
    label: { ja: '右ペインを閉じる', en: 'Close Right Pane' },
  },
  'header.showToolbar': {
    label: { ja: 'ツールバーを表示', en: 'Show Toolbar' },
  },
  'header.hideToolbar': {
    label: { ja: 'ツールバーを隠す', en: 'Hide Toolbar' },
  },
  'header.dragToolbar': {
    label: { ja: 'ツールバーを移動', en: 'Drag Toolbar' },
  },
  'editor.bold': {
    label: { ja: '太字', en: 'Bold' },
  },
  'editor.italic': {
    label: { ja: '斜体', en: 'Italic' },
  },
  'editor.strike': {
    label: { ja: '打ち消し線', en: 'Strikethrough' },
  },
  'editor.highlight': {
    label: { ja: 'ハイライト', en: 'Highlight' },
  },
  'editor.underline': {
    label: { ja: '下線', en: 'Underline' },
  },
  'editor.inlineCode': {
    label: { ja: 'インラインコード', en: 'Inline Code' },
  },
  'editor.clearFormat': {
    label: { ja: '書式をクリア', en: 'Clear Format' },
  },
  'editor.heading': {
    label: { ja: '見出し', en: 'Heading' },
  },
  'editor.headingMenu': {
    label: { ja: '見出しメニュー', en: 'Heading Menu' },
  },
  'editor.listMenu': {
    label: { ja: 'リストメニュー', en: 'List Menu' },
  },
  'editor.heading.level1': {
    label: { ja: '見出し1', en: 'Heading 1' },
  },
  'editor.heading.level2': {
    label: { ja: '見出し2', en: 'Heading 2' },
  },
  'editor.heading.level3': {
    label: { ja: '見出し3', en: 'Heading 3' },
  },
  'editor.heading.level4': {
    label: { ja: '見出し4', en: 'Heading 4' },
  },
  'editor.heading.level5': {
    label: { ja: '見出し5', en: 'Heading 5' },
  },
  'editor.heading.level6': {
    label: { ja: '見出し6', en: 'Heading 6' },
  },
  'editor.heading.clear': {
    label: { ja: '見出しを解除', en: 'Clear Heading' },
  },
  'editor.bulletList': {
    label: { ja: '箇条書き', en: 'Bullet List' },
  },
  'editor.orderedList': {
    label: { ja: '番号付きリスト', en: 'Ordered List' },
  },
  'editor.checklist': {
    label: { ja: 'チェックリスト', en: 'Checklist' },
  },
  'editor.blockquote': {
    label: { ja: '引用', en: 'Blockquote' },
  },
  'editor.codeBlock': {
    label: { ja: 'コードブロック', en: 'Code Block' },
  },
  'editor.blockDecoration': {
    label: { ja: 'ブロック装飾', en: 'Block Decoration' },
  },
  'editor.blockDecoration.menu': {
    label: { ja: 'ブロック装飾メニュー', en: 'Block Decoration Menu' },
  },
  'editor.blockDecoration.center': {
    label: { ja: '中央揃え', en: 'Center' },
  },
  'editor.blockDecoration.end': {
    label: { ja: '右寄せ / 地付き', en: 'End (right / bottom)' },
  },
  'editor.blockDecoration.indent1': {
    label: { ja: '字下げ 1', en: 'Indent 1' },
  },
  'editor.blockDecoration.indent2': {
    label: { ja: '字下げ 2', en: 'Indent 2' },
  },
  'editor.blockDecoration.indent3': {
    label: { ja: '字下げ 3', en: 'Indent 3' },
  },
  'editor.blockDecoration.indent4': {
    label: { ja: '字下げ 4', en: 'Indent 4' },
  },
  'editor.blockDecoration.indent5': {
    label: { ja: '字下げ 5', en: 'Indent 5' },
  },
  'editor.blockDecoration.indent6': {
    label: { ja: '字下げ 6', en: 'Indent 6' },
  },
  'editor.blockDecoration.styleLetter': {
    label: { ja: 'スタイル: 手紙', en: 'Style: Letter' },
  },
  'editor.blockDecoration.styleMuted': {
    label: { ja: 'スタイル: 控えめ', en: 'Style: Muted' },
  },
  'editor.blockDecoration.styleHeading': {
    label: { ja: 'スタイル: 見出し', en: 'Style: Heading' },
  },
  'editor.blockDecoration.clear': {
    label: { ja: '装飾を解除', en: 'Clear Decoration' },
  },
  'editor.blockDecoration.pageBreak': {
    label: { ja: '改ページを挿入', en: 'Insert Page Break' },
  },
  'editor.blockDecoration.deletePageBreak': {
    label: { ja: '改ページを削除', en: 'Delete Page Break' },
  },
  'editor.blockDecoration.blankPage': {
    label: { ja: '空白ページを挿入', en: 'Insert Blank Page' },
  },
  'editor.blockDecoration.blankPage2': {
    label: { ja: '空白ページを挿入 x2', en: 'Insert Blank Page x2' },
  },
  'editor.blockDecoration.blankPage3': {
    label: { ja: '空白ページを挿入 x3', en: 'Insert Blank Page x3' },
  },
  'editor.blockDecoration.blankPage4': {
    label: { ja: '空白ページを挿入 x4', en: 'Insert Blank Page x4' },
  },
  'editor.blockDecoration.blankPage5': {
    label: { ja: '空白ページを挿入 x5', en: 'Insert Blank Page x5' },
  },
  'editor.blockDecoration.blankPage10': {
    label: { ja: '空白ページを挿入 x10', en: 'Insert Blank Page x10' },
  },
  'editor.blockDecoration.blankPage20': {
    label: { ja: '空白ページを挿入 x20', en: 'Insert Blank Page x20' },
  },
  'editor.link': {
    label: { ja: 'リンク', en: 'Link' },
  },
  'editor.image': {
    label: { ja: '画像', en: 'Image' },
  },
  'editor.insertRuby': {
    label: { ja: 'ルビ', en: 'Ruby' },
  },
  'editor.tcy': {
    label: { ja: '縦中横', en: 'TCY' },
  },
  'editor.noteAnchor': {
    label: { ja: '付箋を追加', en: 'Add Sticky Note' },
  },
  'editor.noteAnchor.showInPanel': {
    label: { ja: '付箋を表示', en: 'Show note' },
  },
  'editor.noteAnchor.delete': {
    label: { ja: '付箋を削除', en: 'Delete note' },
  },
  'editor.noteAnchor.deleteConfirm': {
    label: {
      ja: 'この付箋を削除しますか？\n本文のマーカーと付箋データの紐付けが解除されます。',
      en: 'Delete this note?\nThe marker in the document and the note entry will be unlinked.',
    },
  },
  'editor.noteAnchor.removeMarkerOnly': {
    label: { ja: 'マーカーのみ削除', en: 'Remove marker only' },
  },
  'editor.noteAnchor.removeMarkerOnlyConfirm': {
    label: {
      ja: '対応する付箋データが見つかりません。この本文中のマーカーだけを削除しますか？',
      en: 'No matching note data was found. Remove only this marker from the document?',
    },
  },
  'editor.horizontalRule': {
    label: { ja: '区切り線', en: 'Horizontal Rule' },
  },
  'editor.previousChapter': {
    label: { ja: '前章', en: 'Previous chapter' },
  },
  'editor.nextChapter': {
    label: { ja: '次章', en: 'Next chapter' },
  },
  'editor.chapterBoundary.previous': {
    label: { ja: '前章へ', en: 'Previous chapter' },
  },
  'editor.chapterBoundary.previousEnd': {
    label: { ja: '前章の末尾へ', en: 'Previous chapter end' },
  },
  'editor.chapterBoundary.start': {
    label: { ja: '章の先頭へ', en: 'Go to Chapter Start' },
  },
  'editor.chapterBoundary.end': {
    label: { ja: '章の末尾へ', en: 'Go to Chapter End' },
  },
  'editor.chapterBoundary.next': {
    label: { ja: '次章へ', en: 'Next chapter' },
  },
  'editor.chapterBoundary.wheelHint': {
    label: { ja: 'Option/Alt + スクロールでも移動', en: 'Also: Option/Alt + scroll' },
  },
  'editor.rubyView': {
    label: { ja: 'ルビ表示', en: 'Ruby View' },
  },
  'editor.switchVertical': {
    label: { ja: '縦書きに切り替え', en: 'Switch Vertical' },
  },
  'editor.switchHorizontal': {
    label: { ja: '横書きに切り替え', en: 'Switch Horizontal' },
  },
  'editor.paragraphPlain': {
    label: { ja: '段落プレーン編集', en: 'Paragraph Plain' },
  },
  'editor.sourceMode': {
    label: { ja: 'ソースモード', en: 'Source Mode' },
  },
  'editor.viewSettings': {
    label: { ja: '表示設定', en: 'View Settings' },
  },
  'editor.pastePlain': {
    label: { ja: 'プレーンテキストとして貼り付け', en: 'Paste as Plain Text' },
  },
  'editor.moveListItemUp': {
    label: { ja: 'リスト項目を上へ移動', en: 'Move List Item Up' },
  },
  'editor.moveListItemDown': {
    label: { ja: 'リスト項目を下へ移動', en: 'Move List Item Down' },
  },
  'explorer.newDocument': {
    label: { ja: '新しい文書', en: 'New Document' },
  },
  'explorer.backToLibrary': {
    label: { ja: '書庫に戻る', en: 'Back to library' },
  },
  'explorer.leftPaneTabs': {
    label: { ja: '左ペインの表示切り替え', en: 'Left pane view' },
  },
  'explorer.tabLibrary': {
    label: { ja: '書庫', en: 'Library' },
  },
  'explorer.tabProjects': {
    label: { ja: '作品', en: 'Projects' },
  },
  'explorer.breadcrumbBackToList': {
    label: { ja: '一覧', en: 'List' },
  },
  'explorer.backToProjectList': {
    label: { ja: '作品一覧に戻る', en: 'Back to projects' },
  },
  'explorer.projectListEmpty': {
    label: { ja: '作品がまだありません', en: 'No projects yet' },
  },
  'explorer.projectsHeading': {
    label: { ja: '作品', en: 'Projects' },
  },
  'explorer.projectListLoading': {
    label: { ja: '作品一覧を読み込み中…', en: 'Loading projects…' },
  },
  'explorer.projectListError': {
    label: { ja: '作品一覧を取得できませんでした', en: 'Could not load projects' },
  },
  'explorer.projectNoBooks': {
    label: { ja: 'booksなし', en: 'no books' },
  },
  'explorer.newFolder': {
    label: { ja: '新しいフォルダ', en: 'New Folder' },
  },
  'explorer.fileExplorerMenu': {
    label: { ja: 'ファイルエクスプローラーメニュー', en: 'File Explorer Menu' },
  },
  'explorer.revealInFinder': {
    label: { ja: 'Finderで表示', en: 'Reveal in Finder' },
  },
  'explorer.revealInExplorer': {
    label: { ja: 'Explorerで表示', en: 'Reveal in Explorer' },
  },
  'explorer.revealInFileManager': {
    label: { ja: 'ファイルマネージャーで表示', en: 'Reveal in File Manager' },
  },
  'explorer.empty': {
    label: { ja: 'ファイルがありません', en: 'No files yet' },
  },
  'explorer.projectRoot': {
    label: { ja: '作品', en: 'Project root' },
  },
  'explorer.createProject': {
    label: { ja: 'このフォルダを作品にする', en: 'Make this folder a project' },
  },
  'explorer.createProjectAlreadyExists': {
    label: { ja: 'このフォルダはすでに作品です', en: 'This folder is already a project' },
  },
  'explorer.createProjectInsideExisting': {
    label: { ja: 'このフォルダは既存の作品内です', en: 'This folder is inside an existing project' },
  },
  'explorer.registerToBook': {
    label: { ja: 'Bookに追加', en: 'Add to book' },
  },
  'explorer.registerAsMaterial': {
    label: { ja: '資料として登録', en: 'Add as material' },
  },
  'explorer.registerNoBooks': {
    label: { ja: 'Bookがありません', en: 'No books yet' },
  },
  'explorer.registerFailed': {
    label: {
      ja: '登録に失敗しました。作品の books.json を確認してください。',
      en: 'Failed to register. Check the project books.json.',
    },
  },
  'explorer.fileRole.body': {
    label: { ja: '役割: 本文', en: 'Role: Body' },
  },
  'explorer.fileRole.synopsis': {
    label: { ja: '役割: 梗概', en: 'Role: Synopsis' },
  },
  'explorer.fileRole.character': {
    label: { ja: '役割: 人物', en: 'Role: Characters' },
  },
  'explorer.fileRole.setting': {
    label: { ja: '役割: 設定', en: 'Role: Settings' },
  },
  'explorer.fileRole.material': {
    label: { ja: '役割: 資料', en: 'Role: Materials' },
  },
  'explorer.fileRole.unsorted': {
    label: { ja: '役割: 未整理', en: 'Role: Unsorted' },
  },
  'explorer.loading': {
    label: { ja: '読み込み中…', en: 'Loading…' },
  },
  'explorer.loadFolder': {
    label: { ja: 'フォルダ未選択', en: 'No Folder Selected' },
    helper: {
      ja: 'ツールバーの「Load」でフォルダを開いてください',
      en: 'Use Load in the toolbar to open a folder.',
    },
  },
  'explorer.libraryOnboarding': {
    // 書庫未登録のときの空状態オンボーディング。
    // 「ツールバー経由でフォルダを開くと書庫になる」と読める文言は使わない。
    // 主導線は書庫管理画面からの作成 / 登録。
    label: { ja: '書庫がまだ登録されていません', en: 'No library registered yet' },
    helper: {
      ja: 'Nyoze では、原稿を置く場所を「書庫」として登録して使います。通常は 1 つの書庫で十分です。',
      en: 'Nyoze keeps your manuscripts in a registered “library”. One library is usually enough.',
    },
  },
  'explorer.openLibraryManager': {
    label: { ja: '書庫を作成 / 登録', en: 'Create / register library' },
  },
  'explorer.externalFile': {
    // 書庫外の保存済み単独ファイルを開いているときの空状態表示（read-only）。
    // 自動登録 / workspace root 化はせず、書庫管理への誘導だけを示す。
    label: { ja: '書庫外のファイル', en: 'File outside libraries' },
    helper: {
      ja: 'このファイルは登録済みの書庫には含まれていません。フォルダを書庫として使う場合は「書庫を管理」から登録してください。',
      en: 'This file is not part of a registered library. To use a folder as a library, register it from “Manage Libraries”.',
    },
  },
  'explorer.docContext.library': {
    label: { ja: '書庫', en: 'Library' },
  },
  'explorer.docContext.libraryExternal': {
    // active 書庫の外にある保存済みファイル。
    label: { ja: '書庫外', en: 'Outside library' },
  },
  'explorer.docContext.project': {
    // アプリ内の他 UI（左ペインタブ）と同じ「作品」表記に合わせる。
    label: { ja: '作品', en: 'Project' },
  },
  'explorer.docContext.projectNone': {
    label: { ja: '作品外', en: 'Outside Project' },
  },
  'explorer.docContext.role': {
    label: { ja: '役割', en: 'Role' },
  },
  'explorer.docContext.roleBody': {
    label: { ja: '本文', en: 'Body' },
  },
  'explorer.docContext.roleUnregistered': {
    // Project 内だが `.nyoze/books.json` に未登録のファイル。
    label: { ja: '未登録', en: 'Unregistered' },
  },
  // frontmatter / Book 冒頭表示の役割ラベル（`showRoleLabels` ON 時に表示）。
  // 本文側の短い credit label なので、Workspace から `body` variant で参照し、
  // mixed でも日本語ラベルを使う。
  'frontmatterCredit.author': {
    label: { ja: '著', en: 'By' },
  },
  'frontmatterCredit.coAuthor': {
    label: { ja: '共著', en: 'Co-authors' },
  },
  'frontmatterCredit.translator': {
    label: { ja: '訳', en: 'Trans.' },
  },
  'frontmatterCredit.coTranslator': {
    label: { ja: '共訳', en: 'Co-trans.' },
  },
  'explorer.docInfo.title': {
    label: { ja: 'タイトル', en: 'Title' },
  },
  'explorer.docInfo.author': {
    label: { ja: '著者', en: 'Author' },
  },
  'explorer.docInfo.translator': {
    label: { ja: '訳者', en: 'Translator' },
  },
  'explorer.docInfo.documentType': {
    label: { ja: '種別', en: 'Type' },
  },
  'explorer.docInfo.writingMode': {
    label: { ja: '書字方向', en: 'Direction' },
  },
  'explorer.docInfo.type': {
    label: { ja: 'Type', en: 'Type' },
  },
  'explorer.docInfo.eol': {
    label: { ja: 'EOL', en: 'EOL' },
  },
  'explorer.docInfo.characters': {
    label: { ja: '文字数', en: 'Characters' },
  },
  'explorer.docInfo.created': {
    label: { ja: '作成', en: 'Created' },
  },
  'explorer.docInfo.updated': {
    label: { ja: '更新', en: 'Updated' },
  },
  'explorer.docInfo.path': {
    label: { ja: 'パス', en: 'Path' },
  },
  'explorer.docInfo.panel': {
    label: { ja: '文書情報', en: 'Document info' },
  },
  'explorer.eol.lf': {
    label: { ja: 'LF', en: 'LF' },
  },
  'explorer.eol.crlf': {
    label: { ja: 'CRLF', en: 'CRLF' },
  },
  'explorer.transferConflict.title': {
    label: {
      ja: '同じ名前のファイルがあります',
      en: 'An item with that name already exists',
    },
  },
  'explorer.transferConflict.bodyLine1Copy': {
    label: {
      ja: 'コピー先には「{name}」がすでにあります。',
      en: 'The destination already has an item named “{name}”.',
    },
  },
  'explorer.transferConflict.bodyLine1Move': {
    label: {
      ja: '移動先には「{name}」がすでにあります。',
      en: 'The destination already has an item named “{name}”.',
    },
  },
  'explorer.transferConflict.bodyLine2': {
    label: {
      ja: 'このファイルを置き換えますか？',
      en: 'Do you want to replace it?',
    },
  },
  'explorer.transferConflict.helperKeepBothCopy': {
    label: {
      ja: '「両方とも残す」を選ぶと、新しい名前でコピーします。',
      en: 'If you choose Keep Both, the copy is saved with a new name.',
    },
  },
  'explorer.transferConflict.helperKeepBothMove': {
    label: {
      ja: '「両方とも残す」を選ぶと、移動中のファイルを新しい名前で移動先に置きます。移動先にあった同名ファイルはそのまま残り、元の場所からはこのファイルがなくなります。',
      en: 'If you choose Keep Both, the item you are moving is placed at the destination under a new name. The file that was already there stays unchanged, and the item is removed from its original location.',
    },
  },
  'explorer.transferConflict.keepBoth': {
    label: { ja: '両方とも残す', en: 'Keep Both' },
  },
  'explorer.transferConflict.cancel': {
    label: { ja: 'キャンセル', en: 'Cancel' },
  },
  'explorer.transferConflict.replace': {
    label: { ja: '置き換える', en: 'Replace' },
  },
  'explorer.transferConflict.errorKeepBothUnexpected': {
    label: {
      ja: '別名でのコピー / 移動に失敗しました。パスと権限を確認してください。',
      en: 'Could not copy or move with a new name. Check the path and permissions.',
    },
  },
  'explorer.transferConflict.errorKeepBothExhausted': {
    label: {
      ja: '利用できる別名を見つけられませんでした。手動で名前を変更してから再度お試しください。',
      en: 'Could not find an available name. Rename files manually and try again.',
    },
  },
  'workspace.outline.empty': {
    label: { ja: '見出しがありません', en: 'No headings yet' },
  },
  'workspace.outline.preview': {
    label: { ja: '見出し内容プレビュー', en: 'Preview heading content' },
  },
  'workspace.outline.expand': {
    label: { ja: '展開', en: 'Expand' },
  },
  'workspace.outline.collapse': {
    label: { ja: '折りたたみ', en: 'Collapse' },
  },
  'workspace.outline.modeDocument': {
    label: { ja: '現在の文書', en: 'This document' },
  },
  'workspace.outline.modeBook': {
    label: { ja: 'Book全体', en: 'Whole book' },
  },
  'bookOutline.title': {
    label: { ja: 'Book全体', en: 'Whole book' },
  },
  'bookOutline.bookLabel': {
    label: { ja: 'Book', en: 'Book' },
  },
  'bookOutline.refresh': {
    label: { ja: '更新', en: 'Refresh' },
  },
  'bookOutline.loading': {
    label: { ja: '読み込み中…', en: 'Loading…' },
  },
  'bookOutline.unavailable': {
    label: {
      ja: 'この文書では Book全体Outline を表示できません',
      en: 'Whole-book outline is unavailable for this document',
    },
  },
  'bookOutline.notInProject': {
    label: {
      ja: 'この文書は作品に属していません',
      en: 'This document is not in a project',
    },
  },
  'bookOutline.noCurrentBook': {
    label: {
      ja: '現在のファイルは Book に属していません',
      en: 'The current file does not belong to a book',
    },
  },
  'bookOutline.error': {
    label: {
      ja: 'Book全体Outline を読み込めませんでした',
      en: 'Could not load the whole-book outline',
    },
  },
  'bookOutline.chaptersEmpty': {
    label: {
      ja: 'この Book には章ファイルがありません',
      en: 'This book has no chapter files',
    },
  },
  'bookOutline.noHeadings': {
    label: { ja: '（見出しなし）', en: '(no headings)' },
  },
  'bookOutline.currentBadge': {
    label: { ja: '現在', en: 'Current' },
  },
  'bookOutline.chapterPreview': {
    label: { ja: '冒頭プレビュー', en: 'Preview chapter opening' },
  },
  'bookOutline.previousChapter': {
    label: { ja: '前章', en: 'Previous' },
  },
  'bookOutline.nextChapter': {
    label: { ja: '次章', en: 'Next' },
  },
  'workspace.document.unavailable': {
    label: {
      ja: '文書メタデータを表示できません。',
      en: 'Document Metadata is unavailable.',
    },
  },
  'workspace.document.internalShortcutUnavailable': {
    label: {
      ja: 'この内部ドキュメントでは文書メタデータは使用できません。',
      en: 'Document Metadata is not available for this built-in document.',
    },
  },
  'workspace.theme.unavailable': {
    label: { ja: 'テーマ設定を表示できません。', en: 'Theme settings are unavailable.' },
  },
  'documentType.label.novel': {
    label: { ja: '小説・本文', en: 'Fiction' },
  },
  'documentType.label.article': {
    label: { ja: '記事・文書', en: 'Article / Document' },
  },
  'documentType.label.unset': {
    label: { ja: '未設定', en: 'Unset' },
  },
  'documentType.sublabel.novel': {
    label: { ja: '小説・本文向けの文書スタイル', en: 'Prose / fiction writing style' },
  },
  'documentType.sublabel.article': {
    label: { ja: '記事・文書向けの文書スタイル', en: 'Article / document writing style' },
  },
  'documentType.sublabel.unset': {
    label: { ja: '標準の執筆設定を使います', en: 'Use the standard writing settings' },
  },
  'documentType.overrideHelp': {
    label: {
      ja: 'この文書は文書内の互換設定により、Document Type とは別の改行解釈が固定されています。必要なら Source Mode で互換設定を編集または削除してください。',
      en: 'This document uses a compatibility override that locks line break behavior apart from Document Type. Edit or remove it in Source Mode if needed.',
    },
  },
  'documentType.overrideLockedNotice': {
    label: {
      ja: '文書内の互換設定により改行解釈が固定されています',
      en: 'Line break behavior is locked by a compatibility override in this document',
    },
  },
  'documentType.fixedBadge': {
    label: { ja: '固定', en: 'Fixed' },
  },
  'documentSettings.panelTitle': {
    label: { ja: '文書メタデータ', en: 'Document Metadata' },
  },
  'documentSettings.openPanel': {
    label: { ja: '文書メタデータを開く', en: 'Open Document Metadata' },
  },
  'documentSettings.panelHelper': {
    label: {
      ja: '現在のMarkdownファイルのfrontmatterに保存される情報と、文書単位の表示設定を編集します。',
      en: 'Edit frontmatter metadata and document-specific display settings for the current Markdown file.',
    },
    helper: {
      ja: '現在のMarkdownファイルのfrontmatterに保存される情報と、文書単位の表示設定を編集します。',
      en: 'Edit frontmatter metadata and document-specific display settings for the current Markdown file.',
    },
  },
  'documentSettings.saveHelper': {
    label: {
      ja: '変更は現在のMarkdownファイルに保存されます。',
      en: 'Changes are saved to the current Markdown file.',
    },
    helper: {
      ja: '変更は現在のMarkdownファイルに保存されます。',
      en: 'Changes are saved to the current Markdown file.',
    },
  },
  'documentSettings.projectCallout.registered': {
    label: {
      ja: '作品内の表示情報は books.json で管理されます。',
      en: 'Project display metadata is managed in books.json.',
    },
    helper: {
      ja: '作品内の表示情報は books.json で管理されます。',
      en: 'Project display metadata is managed in books.json.',
    },
  },
  'documentSettings.projectCallout.unregistered': {
    label: {
      ja: 'このファイルは作品に未登録です。',
      en: 'This file is not registered in the Project.',
    },
    helper: {
      ja: 'このファイルは作品に未登録です。',
      en: 'This file is not registered in the Project.',
    },
  },
  'documentSettings.projectCallout.unresolved': {
    label: {
      ja: '作品の表示情報は作品タブで確認できます。',
      en: 'Project display metadata is available in the Project tab.',
    },
    helper: {
      ja: '作品の表示情報は作品タブで確認できます。',
      en: 'Project display metadata is available in the Project tab.',
    },
  },
  'documentSettings.projectCallout.editProjectDisplay': {
    label: { ja: '作品の表示情報を編集', en: 'Edit Project display metadata' },
  },
  'documentSettings.projectCallout.openProjectTab': {
    label: { ja: '作品タブを開く', en: 'Open Project tab' },
  },
  'documentSettings.documentType': {
    label: { ja: '文書タイプ', en: 'Document Type' },
    helper: {
      ja: '文書タイプは文書の性格と改行スタイルを決めます。表示方向（縦書き / 横書き）の設定ではありません。',
      en: "Document Type sets the document's character and line-break style — not the display direction (vertical / horizontal).",
    },
  },
  'documentSettings.option.novel': {
    label: { ja: '小説・本文', en: 'Fiction' },
  },
  'documentSettings.option.article': {
    label: { ja: '記事・文書', en: 'Article / Document' },
  },
  'documentSettings.option.unset': {
    label: { ja: '未設定', en: 'Unset' },
  },
  'documentSettings.typeHint.novel': {
    label: {
      ja: '小説・本文 — テキストエディタに近い操作感。Enterで改行',
      en: 'Fiction — Text-editor style. Enter inserts a line break.',
    },
  },
  'documentSettings.typeHint.article': {
    label: {
      ja: '記事・文書 — Markdownエディタの操作感。Enterで段落区切り / Shift+Enterで段落内改行',
      en: 'Article / Document — Markdown-editor style. Enter splits paragraphs, Shift+Enter stays inside one paragraph.',
    },
  },
  'documentSettings.paragraphSpacing': {
    label: { ja: '段落間隔', en: 'Paragraph Spacing' },
  },
  'documentSettings.preserveEmptyParagraphs': {
    label: { ja: '空段落を保持', en: 'Preserve empty paragraphs' },
  },
  'documentSettings.preserveEmptyParagraphs.meta': {
    label: {
      ja: 'Article 文書で連続空行を空段落として保持します。',
      en: 'Keep consecutive blank lines as empty paragraphs in Article documents.',
    },
  },
  'documentSettings.preserveEmptyParagraphs.singleLineBreak': {
    label: {
      ja: '単改行は引き続き同じ段落の中に留まります。',
      en: 'Single line breaks still stay inside the same paragraph.',
    },
  },
  'documentSettings.preserveEmptyParagraphs.autoDetected': {
    label: {
      ja: 'source content から検出されています。オフにしない限り、保存時も空段落を保持します。',
      en: 'Detected from source content. Saving will preserve empty paragraphs unless you turn this off.',
    },
  },
  'documentSettings.preserveEmptyParagraphs.saveAsSetting': {
    label: { ja: '文書設定として保存', en: 'Save as document setting' },
  },
  'documentSettings.titleField': {
    label: { ja: 'タイトル', en: 'Title' },
  },
  'documentSettings.authorField': {
    label: { ja: '著者', en: 'Author' },
  },
  'documentSettings.translatorField': {
    label: { ja: '翻訳者', en: 'Translator' },
  },
  'documentSettings.readOnly.sourceMode': {
    label: {
      ja: 'Source Mode 編集中は文書メタデータを編集できません。',
      en: 'Document Metadata is read-only while Source Mode is active.',
    },
  },
  'documentSettings.readOnly.paragraphPlain': {
    label: {
      ja: '段落プレーン編集中は文書メタデータを編集できません。段落プレーン編集を終了してから変更してください。',
      en: 'Document Metadata is read-only while Paragraph Plain editing is active. Finish Paragraph Plain editing before making changes.',
    },
  },
  'documentSettings.readOnly.safePatch': {
    label: {
      ja: 'この frontmatter は安全に書き換えられないため、文書メタデータでは read-only です。複雑な frontmatter は Source Mode を使ってください。',
      en: 'This frontmatter cannot be patched safely, so Document Metadata stays read-only. Use Source Mode for complex frontmatter edits.',
    },
  },
  'documentSettings.writingMode.vertical': {
    label: { ja: '縦書き', en: 'Vertical' },
  },
  'documentSettings.writingMode.horizontal': {
    label: { ja: '横書き', en: 'Horizontal' },
  },
  'documentSettings.writingModeSection': {
    label: { ja: '表示方向', en: 'Writing direction' },
  },
  'documentSettings.currentDisplay': {
    label: { ja: '現在の表示', en: 'Current display' },
  },
  'documentSettings.writingModeSource': {
    label: { ja: '適用元', en: 'Applied from' },
  },
  'documentSettings.writingModeSource.manual': {
    label: { ja: '手動切替', en: 'Manual override' },
  },
  'documentSettings.writingModeSource.document': {
    label: { ja: '文書の指定', en: 'Document setting' },
  },
  'documentSettings.writingModeSource.typeDefault': {
    label: { ja: '文書タイプ別の既定', en: 'Per-type default' },
  },
  'documentSettings.writingMode.unsupportedIgnored': {
    label: {
      ja: '未対応の writingMode は無視されています',
      en: 'An unsupported writingMode is ignored',
    },
  },
  'documentSettings.clearManualOverride': {
    label: { ja: '手動切替を解除', en: 'Clear manual override' },
  },
  'documentSettings.documentWritingMode.label': {
    label: { ja: 'この文書の表示方向', en: "This document's writing direction" },
  },
  'documentSettings.documentWritingMode.help': {
    label: { ja: '文書の表示方向', en: 'Document writing direction' },
    helper: {
      ja: 'frontmatter の writingMode に保存します。固定すると文書タイプ別の既定より優先されます。',
      en: 'Saved to the frontmatter writingMode. A fixed value takes precedence over the per-type default.',
    },
  },
  'documentSettings.documentWritingMode.followDefault': {
    label: { ja: '既定に従う', en: 'Follow default' },
  },
  'documentSettings.documentWritingMode.fixVertical': {
    label: { ja: '縦書きに固定', en: 'Fix to vertical' },
  },
  'documentSettings.documentWritingMode.fixHorizontal': {
    label: { ja: '横書きに固定', en: 'Fix to horizontal' },
  },
  'documentSettings.documentWritingMode.unsupportedHelp': {
    label: {
      ja: '未対応値があるため、既定に従っています',
      en: 'An unsupported value is present, so the default applies',
    },
    helper: {
      ja: '未対応値があるため、既定に従っています。選択すると未対応値を置き換え / 削除します。',
      en: 'An unsupported value is present, so the default applies. Selecting an option replaces / removes it.',
    },
  },
  'settings.uiLanguageMode': {
    label: { ja: 'UI言語', en: 'UI Language' },
    helper: {
      ja: 'short label は英語、helper や説明文は日本語で表示します。',
      en: 'Show short labels in English and helper text in Japanese.',
    },
  },
  'settings.uiLanguageMode.option.ja': {
    label: { ja: '日本語', en: 'Japanese' },
    helper: {
      ja: '主要 UI と説明文を日本語で表示します。',
      en: 'Show primary UI labels and helper text in Japanese.',
    },
  },
  'settings.uiLanguageMode.option.en': {
    label: { ja: '英語', en: 'English' },
    helper: {
      ja: '主要 UI と説明文を英語で表示します。',
      en: 'Show primary UI labels and helper text in English.',
    },
  },
  'settings.uiLanguageMode.option.mixed': {
    label: { ja: '英日ミックス', en: 'Mixed' },
    helper: {
      ja: '短いラベルは英語、説明文は日本語に分けます。',
      en: 'Use English for short labels and Japanese for helper copy.',
    },
  },
  'displaySettings.title': {
    label: { ja: '表示設定', en: 'Display Settings' },
  },
  'displaySettings.section.basic': {
    label: { ja: '基本設定', en: 'Basics' },
  },
  'displaySettings.section.writingDirection': {
    label: { ja: '文書タイプ別の既定表示方向', en: 'Default Direction by Document Type' },
    helper: {
      ja: 'frontmatter に writingMode が無い文書にだけ効きます。タブの縦横切替や文書の writingMode が優先されます。',
      en: 'Applies only to documents without a frontmatter writingMode. The tab toggle and a document writingMode take precedence.',
    },
  },
  'displaySettings.writingDirection.novel': {
    label: { ja: '小説・本文 / Fiction', en: 'Fiction' },
  },
  'displaySettings.writingDirection.article': {
    label: { ja: '記事・文書 / Article', en: 'Article / Document' },
  },
  'displaySettings.writingDirection.unset': {
    label: { ja: '未設定文書', en: 'Unset documents' },
  },
  'displaySettings.writingDirection.option.vertical': {
    label: { ja: '縦書き', en: 'Vertical' },
  },
  'displaySettings.writingDirection.option.horizontal': {
    label: { ja: '横書き', en: 'Horizontal' },
  },
  'displaySettings.section.tcy': {
    label: { ja: '縦中横', en: 'TCY' },
    helper: {
      ja: '表示専用の縦中横。本文のマークダウンは変えません。',
      en: 'Tate-chu-yoko in the preview only. Markdown source is unchanged.',
    },
  },
  'displaySettings.section.font': {
    label: { ja: 'フォント', en: 'Fonts' },
  },
  'displaySettings.section.ruby': {
    label: { ja: 'ルビ', en: 'Ruby' },
  },
  'displaySettings.section.heading': {
    label: { ja: '見出し設定', en: 'Headings' },
  },
  'displaySettings.section.spacing': {
    label: { ja: '余白設定', en: 'Spacing' },
  },
  'displaySettings.section.frontmatter': {
    label: { ja: 'タイトル・著者表示', en: 'Titles and credits' },
  },
  'displaySettings.section.uiTheme': {
    label: { ja: 'UIテーマ', en: 'UI Theme' },
  },
  'displaySettings.section.toolbar': {
    label: { ja: 'ツールバー', en: 'Toolbar' },
  },
  'displaySettings.section.caret': {
    label: { ja: 'キャレット', en: 'Caret' },
  },
  'displaySettings.section.documentTheme': {
    label: { ja: '文書テーマ', en: 'Document Theme' },
  },
  'displaySettings.section.support': {
    label: { ja: 'サポート', en: 'Support' },
  },
  'displaySettings.fontSize': {
    label: { ja: 'フォントサイズ', en: 'Font Size' },
  },
  'displaySettings.lineHeight': {
    label: { ja: '行間', en: 'Line Height' },
  },
  'displaySettings.autoTcy': {
    label: { ja: '自動縦中横', en: 'Auto TCY' },
    helper: {
      ja: '表示のみ。文書自体は変更しない',
      en: 'Display only. The document source is not modified.',
    },
  },
  'displaySettings.autoTcyVerticalWysiwyg': {
    label: {
      ja: '縦書き WYSIWYG で有効にする',
      en: 'Enable in vertical WYSIWYG',
    },
  },
  'displaySettings.autoTcyTarget': {
    label: { ja: '自動縦中横 対象', en: 'Auto TCY Target' },
    helper: {
      ja: '英字を含む短い単語や URL 断片を対象外にする',
      en: 'Excludes short words with Latin letters and URL-like fragments.',
    },
  },
  'displaySettings.autoTcyDigitsOnly': {
    label: { ja: '数字だけを対象にする', en: 'Digits only' },
  },
  'displaySettings.minDigits': {
    label: { ja: '最小桁数', en: 'Minimum Digits' },
    helper: {
      ja: '対象トークンの下限。記号ペア（!! / !? / ??）は常に対象です',
      en: 'Minimum run length. Punctuation pairs (!! / !? / ??) are always included.',
    },
  },
  'displaySettings.maxDigits': {
    label: { ja: '最大桁数', en: 'Maximum Digits' },
  },
  'displaySettings.documentFont': {
    label: { ja: '文書フォント', en: 'Document Font' },
  },
  'displaySettings.customFonts': {
    label: { ja: 'カスタムフォント', en: 'Custom Fonts' },
  },
  'displaySettings.fontNamePlaceholder': {
    label: { ja: 'フォント名を入力', en: 'Enter a font name' },
  },
  'displaySettings.fetchSystemFonts': {
    label: { ja: 'システムフォント取得', en: 'Fetch System Fonts' },
  },
  'displaySettings.fetchingSystemFonts': {
    label: { ja: '取得中…', en: 'Fetching…' },
  },
  'displaySettings.systemFonts': {
    label: { ja: 'システムフォント', en: 'System Fonts' },
  },
  'displaySettings.registered': {
    label: { ja: '登録済', en: 'Registered' },
  },
  'displaySettings.rubySize': {
    label: { ja: 'ルビサイズ', en: 'Ruby Size' },
  },
  'displaySettings.rubyOffset': {
    label: { ja: 'ルビ位置オフセット', en: 'Ruby Offset' },
  },
  'displaySettings.headingFont': {
    label: { ja: '見出しフォント', en: 'Heading Font' },
  },
  'displaySettings.headingColor': {
    label: { ja: '見出し色', en: 'Heading Color' },
  },
  'displaySettings.resetToBodyColor': {
    label: { ja: '本文色でリセット', en: 'Reset to body color' },
  },
  'displaySettings.headingAlign': {
    label: { ja: '見出し位置', en: 'Heading Alignment' },
  },
  'displaySettings.headingAlignHorizontal': {
    label: { ja: '横書き（H1〜H6 共通）', en: 'Horizontal writing (shared by H1-H6)' },
  },
  'displaySettings.headingAlignVertical': {
    label: { ja: '縦書き（H1〜H6 共通）', en: 'Vertical writing (shared by H1-H6)' },
  },
  'displaySettings.align.left': {
    label: { ja: '左', en: 'Left' },
  },
  'displaySettings.align.center': {
    label: { ja: '中央', en: 'Center' },
  },
  'displaySettings.align.right': {
    label: { ja: '右', en: 'Right' },
  },
  'displaySettings.align.top': {
    label: { ja: '上', en: 'Top' },
  },
  'displaySettings.align.bottom': {
    label: { ja: '下', en: 'Bottom' },
  },
  'displaySettings.headingMarginAfter': {
    label: { ja: '見出し後マージン', en: 'Space After Heading' },
  },
  'displaySettings.headingDividers': {
    label: { ja: '見出し区切り線（レベル別）', en: 'Heading Dividers' },
  },
  'displaySettings.paddingTop': {
    label: { ja: '上余白', en: 'Top Padding' },
  },
  'displaySettings.paddingBottom': {
    label: { ja: '下余白', en: 'Bottom Padding' },
  },
  'displaySettings.frontmatterVisible': {
    label: { ja: 'タイトル・著者を表示', en: 'Show titles and credits' },
  },
  'displaySettings.frontmatterAuthors': {
    label: { ja: '著者情報を表示', en: 'Show Authors' },
  },
  'displaySettings.frontmatterTranslators': {
    label: { ja: '翻訳者情報を表示', en: 'Show Translators' },
  },
  'displaySettings.frontmatterRoleLabels': {
    label: { ja: '役割ラベルを表示', en: 'Show Role Labels' },
  },
  'displaySettings.frontmatter.standalone.heading': {
    label: { ja: '単独文書', en: 'Standalone documents' },
    helper: {
      ja: '単独文書では frontmatter のタイトル・著者などを、作品内の本文では books.json の Book 情報を使います。',
      en: 'Standalone documents use frontmatter titles and credits. Project body files use Book information from books.json.',
    },
  },
  'displaySettings.frontmatter.project.heading': {
    label: { ja: '作品内ファイル', en: 'Project files' },
    helper: {
      ja: '通常は OFF。短編集やアンソロジーなど、各ファイルに個別のタイトル・著者がある場合に使います。',
      en: 'Usually off. Use this for short-story collections or anthologies where each file has its own title and author.',
    },
  },
  'displaySettings.frontmatterShowInProjectFiles': {
    label: {
      ja: '作品内ファイルのタイトル・著者も表示',
      en: 'Show per-file titles and credits in Projects',
    },
  },
  'displaySettings.frontmatterProjectShowTitle': {
    label: { ja: 'タイトルを表示', en: 'Show title' },
  },
  'displaySettings.frontmatterProjectShowAuthors': {
    label: { ja: '著者を表示', en: 'Show authors' },
  },
  'displaySettings.select': {
    label: { ja: '選択', en: 'Selection' },
  },
  'displaySettings.uiFont': {
    label: { ja: 'UIフォント', en: 'UI Font' },
  },
  'displaySettings.uiTextColor': {
    label: { ja: 'UI文字色', en: 'UI Text Color' },
  },
  'displaySettings.uiFontScale': {
    label: { ja: 'UI文字サイズ倍率', en: 'UI Text Scale' },
  },
  'displaySettings.themeManagement': {
    label: { ja: 'テーマ管理', en: 'Theme Studio' },
    helper: {
      ja: 'UIテーマプリセットの作成・編集',
      en: 'Create and edit UI theme presets',
    },
  },
  'displaySettings.openThemeStudio': {
    label: { ja: '開く', en: 'Open' },
  },
  'displaySettings.toolbarIconColor': {
    label: { ja: 'ツールバーアイコン色', en: 'Toolbar Icon Color' },
  },
  'displaySettings.resetToNormalColor': {
    label: { ja: '通常色に戻す', en: 'Reset to normal color' },
  },
  'displaySettings.toolbarIconStroke': {
    label: { ja: 'ツールバー線の太さ', en: 'Toolbar Stroke Width' },
  },
  'displaySettings.toolbarScale': {
    label: { ja: 'ツールバーサイズ倍率', en: 'Toolbar Scale' },
  },
  'displaySettings.appTitleVisible': {
    label: { ja: 'アプリ名を表示', en: 'Show App Title' },
  },
  'displaySettings.appTitlePreset': {
    label: { ja: 'アプリ名', en: 'App Title' },
  },
  'displaySettings.appTitleCustom': {
    label: { ja: 'カスタム名', en: 'Custom Title' },
  },
  'displaySettings.appTitlePlaceholder': {
    label: { ja: 'アプリ名を入力', en: 'Enter an app title' },
  },
  'displaySettings.appTitleColor': {
    label: { ja: 'アプリ名文字色', en: 'App Title Color' },
  },
  'displaySettings.appTitleFont': {
    label: { ja: 'アプリ名フォント', en: 'App Title Font' },
  },
  'displaySettings.sameAsUiFont': {
    label: { ja: 'UIフォントと同じ', en: 'Same as UI Font' },
  },
  'displaySettings.appTitlePreset.custom': {
    label: { ja: 'カスタム...', en: 'Custom...' },
  },
  'displaySettings.documentTheme.uiLinked': {
    label: { ja: 'UIテーマに追従', en: 'Follow UI Theme' },
  },
  'displaySettings.documentTheme.paperLight': {
    label: { ja: 'Paper Light', en: 'Paper Light' },
  },
  'displaySettings.documentTheme.paperDark': {
    label: { ja: 'Paper Dark', en: 'Paper Dark' },
  },
  'displaySettings.documentTheme.bow': {
    label: { ja: 'BOW', en: 'BOW' },
  },
  'displaySettings.documentTheme.wob': {
    label: { ja: 'WOB', en: 'WOB' },
  },
  'displaySettings.documentTheme.softNeutral': {
    label: { ja: 'Soft Neutral', en: 'Soft Neutral' },
  },
  'displaySettings.pageColor': {
    label: { ja: 'ページ色', en: 'Page Color' },
  },
  'displaySettings.bodyColor': {
    label: { ja: '本文色', en: 'Body Color' },
  },
  'displaySettings.caretColor': {
    label: { ja: 'キャレット色', en: 'Caret Color' },
  },
  'displaySettings.caretColorAuto': {
    label: { ja: '自動（背景に合わせる）', en: 'Auto (match background)' },
  },
  'displaySettings.caretColorCustom': {
    label: { ja: 'カスタム', en: 'Custom' },
  },
  'displaySettings.caretColorHighlight': {
    label: { ja: 'ハイライト色', en: 'Highlight Color' },
  },
  'displaySettings.caretColorCustomValue': {
    label: { ja: 'キャレットカスタム色', en: 'Custom Caret Color' },
  },
  'displaySettings.editorArrowPointer': {
    label: { ja: 'エディタで矢印ポインターを使う', en: 'Use Arrow Pointer in Editor' },
    helper: {
      ja: 'Windows の一部環境で I-beam ポインターが白く見えなくなる場合の回避策です。通常編集、Paragraph Plain、Source Mode に適用します。',
      en: 'Workaround for Windows environments where the I-beam pointer can turn white. Applies to the main editor, Paragraph Plain, and Source Mode.',
    },
  },
  'displaySettings.pseudoCaret.heading': {
    label: { ja: '擬似キャレット', en: 'Pseudo caret' },
    helper: {
      ja: '通常編集（WYSIWYG）で、表示専用の擬似キャレットを表示します。有効時は WYSIWYG の標準キャレットを非表示にします。Source Mode・段落プレーン編集には影響しません。',
      en: 'Shows a display-only pseudo caret in WYSIWYG. When enabled, the WYSIWYG native caret is hidden. Source Mode and Paragraph Plain are unaffected.',
    },
  },
  'displaySettings.pseudoCaret.enabled': {
    label: { ja: '擬似キャレットを表示', en: 'Show pseudo caret' },
  },
  'displaySettings.pseudoCaret.thickness': {
    label: { ja: 'キャレットの太さ', en: 'Caret thickness' },
    helper: {
      ja: '擬似キャレットの太さ（短軸）です。横書きは縦線の幅、縦書きは横線の高さに反映します。',
      en: 'Short-axis thickness of the pseudo caret. Applies to the line width in horizontal writing and the line height in vertical writing.',
    },
  },
  'displaySettings.pseudoCaret.blink': {
    label: { ja: '点滅', en: 'Blink' },
    helper: {
      ja: '擬似キャレットをゆっくり点滅させます。',
      en: 'Blink the pseudo caret at a gentle interval.',
    },
  },
  'displaySettings.section.paragraphPlain': {
    label: { ja: '段落プレーン編集', en: 'Paragraph Plain' },
  },
  'displaySettings.paragraphPlainBehavior': {
    label: { ja: '段落プレーン編集の動作', en: 'Paragraph Plain behavior' },
    helper: {
      ja:
        '軽さ優先: 入力・クリック・スクロールを軽くします。編集中の段落が後続本文に重なることがあります。\n表示優先: 後続本文を隠しにくい表示を優先します。文書の内容によっては一部の操作が重くなることがあります。',
      en:
        'Performance: lighter typing, clicks, and scrolling while editing in Paragraph Plain; the edited block may overlap following text.\nComfort: keeps following text more visible; some operations may feel heavier depending on document content.',
    },
  },
  'displaySettings.paragraphPlainBehavior.fast': {
    label: { ja: '軽さ優先', en: 'Performance' },
  },
  'displaySettings.paragraphPlainBehavior.comfortable': {
    label: { ja: '表示優先', en: 'Comfort' },
  },
  'displaySettings.section.typewriter': {
    label: { ja: 'タイプライターモード', en: 'Typewriter Mode' },
  },
  'displaySettings.typewriter.scrollHeading': {
    label: { ja: 'タイプライタースクロール', en: 'Typewriter Scroll' },
    helper: {
      ja: '入力時にキャレットが読みやすい位置へスクロールが追従します（通常編集のみ）。',
      en: 'Scroll follows the caret while typing so it stays in a comfortable reading position (WYSIWYG only).',
    },
  },
  'displaySettings.typewriter': {
    label: { ja: 'タイプライターモード', en: 'Typewriter Mode' },
    helper: {
      ja: 'タイプライター機能の説明は「タイプライタースクロール」に分割しました。',
      en: 'See Typewriter Scroll for scroll-follow options.',
    },
  },
  'displaySettings.typewriter.enabled': {
    label: { ja: 'タイプライタースクロール', en: 'Typewriter scroll' },
  },
  'displaySettings.typewriter.followPosition': {
    label: { ja: '追従位置', en: 'Follow position' },
    helper: {
      ja: 'キャレットを置きたい画面内位置のオフセットです。',
      en: 'Offsets where the caret is kept within the viewport.',
    },
  },
  'displaySettings.typewriter.followBandWidth': {
    label: { ja: '追従帯の幅', en: 'Follow band width' },
    helper: {
      ja: 'この範囲からキャレットが外れたときだけスクロールします。',
      en: 'Scroll only when the caret leaves this band around the target position.',
    },
  },
  'displaySettings.section.visualFocus': {
    label: { ja: 'ビジュアルフォーカス', en: 'Visual focus' },
  },
  'displaySettings.visualFocus.editBlockHighlight': {
    label: { ja: '編集ブロックのハイライト', en: 'Edit block highlight' },
    helper: {
      ja:
        '通常編集（WYSIWYG）で、キャレットのある段落などを薄く強調します。Source Mode・段落プレーン編集では無効です。',
      en:
        'Highlights the active paragraph-like block in WYSIWYG. Disabled in Source Mode and Paragraph Plain.',
    },
  },
  'displaySettings.visualFocus.dimNonFocusedBlocks': {
    label: { ja: '編集ブロック以外を薄くする', en: 'Dim non-focused blocks' },
    helper: {
      ja:
        'キャレットのないブロックを薄くします（行単位ではなくブロック単位）。Source Mode・段落プレーン編集では無効です。',
      en:
        'Dims blocks without the caret (block-level, not line-level). Disabled in Source Mode and Paragraph Plain.',
    },
  },
  'displaySettings.visualFocus.blockHighlightColor': {
    label: { ja: '編集ブロックの色', en: 'Block highlight color' },
    helper: {
      ja: '編集ブロックのハイライトの下地色です。透明度は別スライダーで調整します。',
      en: 'Fill color for the active block highlight; opacity is adjusted separately.',
    },
  },
  'displaySettings.visualFocus.blockHighlightOpacity': {
    label: { ja: '編集ブロックの透明度', en: 'Block highlight opacity' },
    helper: {
      ja: '編集ブロックのハイライトの不透明度です。',
      en: 'Opacity of the active block highlight fill.',
    },
  },
  'displaySettings.visualFocus.dimNonFocusedOpacity': {
    label: { ja: '非フォーカス時の透明度', en: 'Non-focused block opacity' },
    helper: {
      ja: '編集ブロック以外を薄くするときの不透明度です。',
      en: 'Opacity applied when dimming blocks without the caret.',
    },
  },
  'displaySettings.visualFocus.currentLineHighlight': {
    label: { ja: '現在行のハイライト', en: 'Current line highlight' },
    helper: {
      ja:
        '通常編集で、折り返し後の表示行（キャレット行）だけを薄く強調します。Source Mode・段落プレーン編集では非表示です。IME 入力・変換中も表示を維持します。ON/OFF はツールバーのクイックメニューからも切り替えられます。色・透明度は表示設定が正本です。',
      en:
        'In WYSIWYG, subtly highlights only the current visual line. Hidden in Source Mode and Paragraph Plain; remains visible during IME input and composition. You can toggle it from the toolbar quick menu; color and opacity stay in Display Settings.',
    },
  },
  'displaySettings.visualFocus.currentLineColor': {
    label: { ja: '現在行の色', en: 'Current line color' },
    helper: {
      ja: '現在行ハイライトの下地色です。透明度は別スライダーで調整します。',
      en: 'Fill color for the current line highlight; opacity is adjusted separately.',
    },
  },
  'displaySettings.visualFocus.currentLineOpacity': {
    label: { ja: '現在行の透明度', en: 'Current line opacity' },
    helper: {
      ja: '現在行ハイライトの不透明度です。',
      en: 'Opacity of the current line highlight fill.',
    },
  },
  'toolbar.typewriterFocusMenu.button': {
    label: { ja: 'タイプライター', en: 'Typewriter' },
  },
  'toolbar.typewriterFocusMenu.menuAriaLabel': {
    label: {
      ja: 'タイプライターとビジュアルフォーカス',
      en: 'Typewriter and Visual Focus',
    },
  },
  'toolbar.typewriterFocusMenu.openInDisplaySettings': {
    label: {
      ja: '表示設定で詳細を編集…',
      en: 'Edit details in Display Settings…',
    },
  },
  'toolbar.pageViewerTargetMenu.chevron': {
    label: {
      ja: 'ページビューアの対象を選ぶ',
      en: 'Choose Page Viewer target',
    },
  },
  'toolbar.pageViewerTargetMenu.menuAriaLabel': {
    label: {
      ja: 'ページビューアの対象',
      en: 'Page Viewer target',
    },
  },
  'toolbar.pageViewerTargetMenu.openDocument': {
    label: {
      ja: '現在の文書をページビューアで開く',
      en: 'Open current document in Page Viewer',
    },
  },
  'toolbar.pageViewerTargetMenu.openBook': {
    label: {
      ja: 'Book 全体をページビューアで開く',
      en: 'Open whole Book in Page Viewer',
    },
  },
  'displaySettings.support.bugReport': {
    label: { ja: '不具合報告', en: 'Bug Report' },
  },
  'displaySettings.support.feedback': {
    label: { ja: 'フィードバック', en: 'Feedback' },
  },
  'displaySettings.support.updateCheck': {
    label: { ja: '更新確認', en: 'Check for Updates' },
  },
  'displaySettings.support.repository': {
    label: { ja: 'リポジトリ', en: 'Repository' },
  },
  'displaySettings.support.reportBug': {
    label: { ja: '不具合を報告', en: 'Report a Bug' },
  },
  'displaySettings.support.sendFeedback': {
    label: { ja: 'フィードバックを送る', en: 'Send Feedback' },
  },
  'displaySettings.support.checkNow': {
    label: { ja: '更新を確認', en: 'Check Now' },
  },
  'displaySettings.support.checking': {
    label: { ja: '確認中…', en: 'Checking…' },
  },
  'displaySettings.support.openRepository': {
    label: { ja: 'リポジトリを開く', en: 'Open Repository' },
  },
  'displaySettings.resetDefaults': {
    label: { ja: '初期値に戻す', en: 'Reset Defaults' },
  },
  'themeStudio.preparing': {
    label: { ja: 'テーマプリセットを準備中です。', en: 'Preparing theme presets…' },
  },
  'themeStudio.preset': {
    label: { ja: 'プリセット', en: 'Preset' },
  },
  'themeStudio.currentNoPreset': {
    label: { ja: '現在の設定（プリセット未選択）', en: 'Current settings (no preset selected)' },
  },
  'themeStudio.currentUnsavedCustom': {
    label: { ja: '現在の設定（未保存カスタム）', en: 'Current settings (unsaved custom draft)' },
  },
  'themeStudio.duplicate': {
    label: { ja: '複製', en: 'Duplicate' },
  },
  'themeStudio.searchCustom': {
    label: { ja: 'カスタムを検索', en: 'Search custom presets' },
  },
  'themeStudio.sort.newest': {
    label: { ja: '新しい順', en: 'Newest' },
  },
  'themeStudio.sort.oldest': {
    label: { ja: '古い順', en: 'Oldest' },
  },
  'themeStudio.sort.name': {
    label: { ja: '名前順', en: 'Name' },
  },
  'themeStudio.emptyCustom': {
    label: { ja: '該当するカスタムテーマはありません。', en: 'No matching custom presets.' },
  },
  'themeStudio.unsaved': {
    label: { ja: '未保存', en: 'Unsaved' },
  },
  'themeStudio.renameTheme': {
    label: { ja: 'テーマ名を変更', en: 'Rename theme' },
  },
  'themeStudio.baseTheme': {
    label: { ja: 'ベーステーマ', en: 'Base Theme' },
  },
  'themeStudio.fixedInSystemPreset': {
    label: { ja: '標準プリセットでは固定です', en: 'Fixed for built-in presets' },
  },
  'themeStudio.mainColors': {
    label: { ja: '主要色', en: 'Main Colors' },
  },
  'themeStudio.color.panelBg': {
    label: { ja: 'パネル背景', en: 'Pane Background' },
  },
  'themeStudio.color.surfaceBg': {
    label: { ja: 'サーフェス背景', en: 'Surface Background' },
  },
  'themeStudio.color.text': {
    label: { ja: 'テキスト', en: 'Text' },
  },
  'themeStudio.color.accent': {
    label: { ja: 'アクセント', en: 'Accent' },
  },
  'themeStudio.color.border': {
    label: { ja: 'ボーダー', en: 'Border' },
  },
  'themeStudio.color.paneBorder': {
    label: { ja: 'トップバー/スプリッタ', en: 'Top Bar / Splitter' },
  },
  'themeStudio.color.paneBgOptional': {
    label: { ja: '左右パネル背景（任意）', en: 'Side Pane Background (Optional)' },
  },
  'themeStudio.resetToAuto': {
    label: { ja: '自動に戻す', en: 'Reset to Auto' },
  },
  'themeStudio.color.scrollbar': {
    label: { ja: 'スクロールバー', en: 'Scrollbar' },
  },
  'themeStudio.uiFont': {
    label: { ja: 'UIフォント', en: 'UI Font' },
  },
  'themeStudio.uiScale': {
    label: { ja: 'UI文字サイズ倍率', en: 'UI Text Scale' },
  },
  'themeStudio.discardChanges': {
    label: { ja: '変更を取り消す', en: 'Discard Changes' },
  },
  'themeStudio.saveNew': {
    label: { ja: '新規保存', en: 'Save New' },
  },
  'themeStudio.saveOverwrite': {
    label: { ja: '上書き保存', en: 'Overwrite Save' },
  },
  'themeStudio.showSample': {
    label: { ja: 'サンプル表示', en: 'Show Sample' },
  },
  'themeStudio.hideSample': {
    label: { ja: 'サンプル非表示', en: 'Hide Sample' },
  },
  'themeStudio.color.pageBg': {
    label: { ja: 'ページ背景', en: 'Page Background' },
  },
  'themeStudio.color.bodyText': {
    label: { ja: '本文テキスト', en: 'Body Text' },
  },
  'themeStudio.color.headingText': {
    label: { ja: '見出しテキスト', en: 'Heading Text' },
  },
  'themeStudio.documentFont': {
    label: { ja: '文書フォント', en: 'Document Font' },
  },
  'themeStudio.headingFont': {
    label: { ja: '見出しフォント', en: 'Heading Font' },
  },
  'themeStudio.displaySettingsNote': {
    label: {
      ja: 'フォント・フォントサイズ・行間は表示設定です。テーマ preset には保存されません。',
      en: 'Font, font size, and line height are display settings and are not saved into theme presets.',
    },
  },
  'themeStudio.newSave.uiTitle': {
    label: { ja: 'UIテーマを新規保存', en: 'Save New UI Theme' },
  },
  'themeStudio.newSave.docTitle': {
    label: { ja: '文書テーマを新規保存', en: 'Save New Document Theme' },
  },
  'themeStudio.rename.uiTitle': {
    label: { ja: 'UIテーマ名を変更', en: 'Rename UI Theme' },
  },
  'themeStudio.rename.docTitle': {
    label: { ja: '文書テーマ名を変更', en: 'Rename Document Theme' },
  },
  'themeStudio.themeName': {
    label: { ja: 'テーマ名', en: 'Theme Name' },
  },
  // ---- Library manager (read-only shell) ----
  'library.menuOpen': {
    // 末尾の ellipsis は menu 側の withEllipsis() に統一する。ここで `...` / `…`
    // を入れると `withEllipsis` で二重化されるため、必ず素のラベルにする。
    label: { ja: '書庫を管理', en: 'Manage Libraries' },
  },
  'library.manageTitle': {
    label: { ja: '書庫', en: 'Libraries' },
    helper: {
      ja: '通常は 1 つの書庫で十分です。用途を分けたい場合だけ、複数の書庫を登録できます。',
      en: 'One library is usually enough. Register additional libraries only when you want to separate use cases.',
    },
  },
  'library.activeBadge': {
    label: { ja: '現在の書庫', en: 'Current' },
  },
  'library.lastOpened': {
    label: { ja: '最終使用', en: 'Last opened' },
  },
  'library.count': {
    label: { ja: '登録済み {n} / 最大 {max}', en: 'Registered {n} / max {max}' },
  },
  'library.empty': {
    // 「Load 経由で気軽にフォルダを開いて書庫追加」と読める文言は使わない。
    // 新規作成と既存フォルダ登録は、この管理画面の操作群から行う。
    label: {
      ja: '書庫が登録されていません。新しい書庫を作成するか、原稿のある既存フォルダを書庫として登録してください。',
      en: 'No libraries are registered. Create a new library or register an existing folder containing your manuscripts.',
    },
  },
  'library.loading': {
    label: { ja: '読み込み中...', en: 'Loading…' },
  },
  'library.error': {
    label: {
      ja: '書庫情報を読み込めませんでした。',
      en: 'Failed to load library information.',
    },
  },
  'library.close': {
    label: { ja: '閉じる', en: 'Close' },
  },
  'library.comingSoon': {
    label: {
      ja: '次のスライスで実装します',
      en: 'Coming in the next slice',
    },
  },
  'library.placeholderHelper': {
    label: {
      ja: '書庫の追加・切り替えはこの画面から行えます。',
      en: 'Add or switch libraries from this screen.',
    },
  },
  'library.actionCreate': {
    label: { ja: '新しい書庫を作成', en: 'Create new library' },
  },
  'library.actionRegister': {
    label: { ja: '既存フォルダを書庫として登録', en: 'Register existing folder' },
  },
  'library.actionRename': {
    label: { ja: '名前変更', en: 'Rename' },
  },
  'library.actionUnregister': {
    label: { ja: '登録解除', en: 'Unregister' },
  },
  'library.actionReveal': {
    label: { ja: 'Finder / Explorer で表示', en: 'Show in Finder / Explorer' },
  },
  'library.open': {
    label: { ja: '開く', en: 'Open' },
  },
  'library.opening': {
    label: { ja: '切り替え中...', en: 'Opening…' },
  },
  'library.openFailed': {
    label: {
      ja: '書庫を開けませんでした。フォルダが移動・削除された可能性があります。',
      en: 'Could not open the library. The folder may have been moved or removed.',
    },
  },
  'library.registering': {
    label: { ja: '登録中...', en: 'Registering…' },
  },
  'library.registerLimitReached': {
    label: {
      ja: '登録できる書庫は最大 10 件までです。先に不要な書庫を整理してください。',
      en: 'You can register up to 10 libraries. Remove an existing one first.',
    },
  },
  'library.registerFailed': {
    label: {
      ja: 'フォルダを書庫として登録できませんでした。',
      en: 'Could not register the folder as a library.',
    },
  },
  'library.renameSave': {
    label: { ja: '保存', en: 'Save' },
  },
  'library.renameCancel': {
    label: { ja: 'キャンセル', en: 'Cancel' },
  },
  'library.renameInputLabel': {
    label: { ja: '書庫名', en: 'Library name' },
  },
  'library.renameFailed': {
    label: {
      ja: '書庫名を変更できませんでした。',
      en: 'Could not rename the library.',
    },
  },
  'library.renameInvalidName': {
    label: {
      ja: '書庫名を入力してください（80 文字以内）。',
      en: 'Enter a library name (up to 80 characters).',
    },
  },
  'library.unregisterConfirm': {
    label: {
      ja: 'この書庫を登録から外しますか？フォルダやファイルは削除しません。',
      en: 'Remove this library from the registry?',
    },
    helper: {
      ja: '登録から外すだけです。フォルダ、Markdown、作品データは削除されません。',
      en: 'This only removes the library from Nyoze. Folders and files on disk are not deleted.',
    },
  },
  'library.unregisterConfirmAction': {
    label: { ja: '解除する', en: 'Unregister' },
  },
  'library.unregisterCancel': {
    label: { ja: 'キャンセル', en: 'Cancel' },
  },
  'library.unregistering': {
    label: { ja: '解除中...', en: 'Unregistering…' },
  },
  'library.unregisterLastLibrary': {
    label: {
      ja: '最後の 1 件の書庫は登録解除できません。',
      en: 'You cannot unregister the last remaining library.',
    },
  },
  'library.unregisterFailed': {
    label: {
      ja: '書庫を登録解除できませんでした。',
      en: 'Could not unregister the library.',
    },
  },
  'library.revealing': {
    label: { ja: '表示中...', en: 'Revealing…' },
  },
  'library.revealNotFound': {
    label: {
      ja: '書庫フォルダが見つかりません。移動または削除された可能性があります。',
      en: 'The library folder could not be found. It may have been moved or removed.',
    },
  },
  'library.revealFailed': {
    label: {
      ja: 'ファイル管理アプリで書庫フォルダを開けませんでした。',
      en: 'Could not open the library folder in the file manager.',
    },
  },
  'library.createNameLabel': {
    label: { ja: '書庫名', en: 'Library name' },
    helper: {
      ja: 'この名前で新しい書庫フォルダを作成します。管理画面の書庫名は後から変更できますが、フォルダ名は変更しません。',
      en: 'A new library folder will be created with this name. You can rename the library in this screen later, but the folder name on disk will not change.',
    },
  },
  'library.createPickParent': {
    label: { ja: '親フォルダを選択', en: 'Choose parent folder' },
  },
  'library.createPickingParent': {
    label: { ja: '選択中...', en: 'Choosing…' },
  },
  'library.createParentBeforePick': {
    label: {
      ja: '新しい書庫フォルダを作る場所を選びます。',
      en: 'Choose where to create the new library folder.',
    },
  },
  'library.createParentReady': {
    label: {
      ja: '選択した場所の中に、新しい書庫フォルダを作成します。',
      en: 'The new library folder will be created inside the selected location.',
    },
  },
  'library.createParentMissing': {
    label: {
      ja: '先に親フォルダを選択してください。',
      en: 'Choose a parent folder first.',
    },
  },
  'library.createSubmit': {
    label: { ja: '作成する', en: 'Create' },
  },
  'library.createCancel': {
    label: { ja: 'キャンセル', en: 'Cancel' },
  },
  'library.creating': {
    label: { ja: '作成中...', en: 'Creating…' },
  },
  'library.createInvalidName': {
    label: {
      ja: '書庫名を入力してください（80 文字以内。/ \\ は使えません）。',
      en: 'Enter a library name (up to 80 characters; no / or \\).',
    },
  },
  'library.createAlreadyExists': {
    label: {
      ja: '同じ名前のフォルダが既にあります。別名にするか、「既存フォルダを書庫として登録」を使ってください。',
      en: 'A folder with that name already exists. Choose another name or use Register existing folder.',
    },
  },
  'library.createFailed': {
    label: {
      ja: '書庫フォルダを作成できませんでした。',
      en: 'Could not create the library folder.',
    },
  },
} as const satisfies Record<string, UiTextEntry>

export type UiTextKey = keyof typeof UI_TEXT_REGISTRY
