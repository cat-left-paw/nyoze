export type UiTextLocale = 'ja' | 'en'
export type UiTextVariant = 'label' | 'tooltip' | 'helper'

export type UiTextLocalizedValue = Record<UiTextLocale, string>

export type UiTextEntry = {
  label: UiTextLocalizedValue
  tooltip?: UiTextLocalizedValue
  helper?: UiTextLocalizedValue
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
    label: { ja: '文書設定', en: 'Document' },
    helper: {
      ja: '文書種別やメタデータを調整します',
      en: 'Adjust document type and metadata',
    },
  },
  'pane.theme': {
    label: { ja: '表示', en: 'Theme' },
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
  'menu.viewSettings': {
    label: { ja: '表示設定', en: 'View Settings' },
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
  'editor.horizontalRule': {
    label: { ja: '区切り線', en: 'Horizontal Rule' },
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
  'explorer.docInfo.type': {
    label: { ja: 'Type', en: 'Type' },
  },
  'explorer.docInfo.eol': {
    label: { ja: 'EOL', en: 'EOL' },
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
  'workspace.document.unavailable': {
    label: {
      ja: '文書設定を表示できません。',
      en: 'Document Settings is unavailable.',
    },
  },
  'workspace.document.internalShortcutUnavailable': {
    label: {
      ja: 'この内部ドキュメントでは文書設定は使用できません。',
      en: 'Document Settings are not available for this built-in document.',
    },
  },
  'workspace.theme.unavailable': {
    label: { ja: 'テーマ設定を表示できません。', en: 'Theme settings are unavailable.' },
  },
  'documentType.label.novel': {
    label: { ja: 'Novel', en: 'Novel' },
  },
  'documentType.label.article': {
    label: { ja: 'Article', en: 'Article' },
  },
  'documentType.label.unset': {
    label: { ja: '未設定', en: 'Unset' },
  },
  'documentType.sublabel.novel': {
    label: { ja: '縦書き推奨', en: 'Vertical recommended' },
  },
  'documentType.sublabel.article': {
    label: { ja: '横書き推奨', en: 'Horizontal recommended' },
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
    label: { ja: '文書設定', en: 'Document Settings' },
  },
  'documentSettings.openPanel': {
    label: { ja: '文書設定を開く', en: 'Open Document Settings' },
  },
  'documentSettings.documentType': {
    label: { ja: '文書タイプ', en: 'Document Type' },
  },
  'documentSettings.option.novel': {
    label: { ja: 'Novel', en: 'Novel' },
  },
  'documentSettings.option.article': {
    label: { ja: 'Article', en: 'Article' },
  },
  'documentSettings.option.unset': {
    label: { ja: '未設定', en: 'Unset' },
  },
  'documentSettings.typeHint.novel': {
    label: {
      ja: 'Novel — テキストエディタに近い操作感。Enterで改行',
      en: 'Novel — Text-editor style. Enter inserts a line break.',
    },
  },
  'documentSettings.typeHint.article': {
    label: {
      ja: 'Article — Markdownエディタの操作感。Enterで段落区切り / Shift+Enterで段落内改行',
      en: 'Article — Markdown-editor style. Enter splits paragraphs, Shift+Enter stays inside one paragraph.',
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
      ja: 'Source Mode 編集中は Document Settings を編集できません。',
      en: 'Document Settings is read-only while Source Mode is active.',
    },
  },
  'documentSettings.readOnly.safePatch': {
    label: {
      ja: 'この frontmatter は安全に書き換えられないため、Document Settings では read-only です。複雑な frontmatter は Source Mode を使ってください。',
      en: 'This frontmatter cannot be patched safely, so Document Settings stays read-only. Use Source Mode for complex frontmatter edits.',
    },
  },
  'documentSettings.writingModeRecommendation': {
    label: { ja: '書字方向の推奨', en: 'Writing Mode Recommendation' },
  },
  'documentSettings.writingMode.vertical': {
    label: { ja: '縦書き', en: 'Vertical' },
  },
  'documentSettings.writingMode.horizontal': {
    label: { ja: '横書き', en: 'Horizontal' },
  },
  'documentSettings.writingMode.useTabSetting': {
    label: { ja: 'このタブの設定を使います', en: 'Use this tab setting' },
  },
  'documentSettings.writingMode.following': {
    label: { ja: 'Type の推奨に従っています', en: 'Following the type recommendation' },
  },
  'documentSettings.writingMode.overridden': {
    label: {
      ja: 'Type の推奨をこのタブで上書きしています',
      en: 'Overriding the type recommendation in this tab',
    },
  },
  'documentSettings.currentDocumentType': {
    label: { ja: '現在の Document Type', en: 'Current Document Type' },
  },
  'documentSettings.currentDisplay': {
    label: { ja: '現在の表示', en: 'Current Display' },
  },
  'documentSettings.resetToRecommendation': {
    label: { ja: '推奨に戻す', en: 'Reset to recommendation' },
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
    label: { ja: 'フロントマター表示', en: 'Frontmatter' },
  },
  'displaySettings.section.uiTheme': {
    label: { ja: 'UIテーマ', en: 'UI Theme' },
  },
  'displaySettings.section.toolbar': {
    label: { ja: 'ツールバー', en: 'Toolbar' },
  },
  'displaySettings.section.appTitle': {
    label: { ja: 'アプリ名', en: 'App Title' },
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
    label: { ja: 'フロントマターを表示', en: 'Show Frontmatter' },
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
} as const satisfies Record<string, UiTextEntry>

export type UiTextKey = keyof typeof UI_TEXT_REGISTRY
