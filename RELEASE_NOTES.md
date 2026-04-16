# Nyoze 0.1.0-beta.1 Release Notes

Nyoze 0.1.0-beta.1 は、縦書き日本語執筆を主目的とした Markdown デスクトップエディタの初回 beta 版です。
この文書を、beta テスター向けの既知制限・配布上の注意・報告時の注意の正本として扱います。

## 対象

- Markdown 原稿を縦書き / 横書きで編集したいユーザー
- UTF-8 の Markdown ファイルを中心に扱うユーザー
- beta 版として、未対応機能や表記の正規化を確認しながら試せるユーザー

## 配布物

- macOS:
  - `Nyoze-Mac-0.1.0-beta.1-arm64-Installer.dmg`
  - `Nyoze-Mac-0.1.0-beta.1-x64-Installer.dmg`
- Windows:
  - `Nyoze-Windows-0.1.0-beta.1-Setup.exe`
- Linux:
  - beta 初回では公式パッケージを提供しません

Apple Silicon Mac では `arm64`、Intel Mac では `x64` を使ってください。

## 主な機能

- 縦書き / 横書きの WYSIWYG 編集
- `.md` / `.markdown` / `.txt` 文書の読み書き
- Markdownでの基本的な装飾と、ルビ、縦中横の表示と編集
- `Document Type` の `Novel` / `Article` 切り替えによる、文芸用途と、ブログ記事 / 技術文書系の両方に合わせた文書運用
- 複数タブ、File Explorer、保存前バックアップ、外部編集競合の最小検知
- 豊富なテーマ切り替えと、GUI での簡単なテーマ編集と表示設定の調整
- Paragraph Plain による段落単位の Markdown ソース編集
- Source Mode による全文 Markdown ソース編集
- frontmatter の読み取り表示と、Document Settings からの限定キー編集
- 検索 / 置換

## `.txt` を使っている人へ

Nyoze は `.md` だけでなく、`.txt` の文書もそのまま開いて編集できます。

- これまでテキストエディタで `.txt` を使っていた原稿も、そのまま試せます
- `.txt` で開いた文書は、`.txt` のまま保存できます
- Nyoze の中では Markdown として表示されますが、普通のテキストエディタで開くと Markdown 記号はそのまま見えます

ただし、古いテキストエディタや文芸向けエディタで作られた `.txt` は、Shift-JIS / CP932 のことがあります。beta で実用上対応している文字コードは UTF-8 のみです。Shift-JIS / CP932 の `.txt` はそのままでは開けないため、先に UTF-8 へ変換してから利用してください。

Nyoze で見出し、太字、リスト、リンクなどの Markdown 記法を使った部分は、一般的なテキストエディタで開くとそのまま記号として見えます。

たとえば、Nyoze では太字として見えている箇所も、通常のテキストエディタでは `**このように**` と表示されます。

まずは慣れた `.txt` の原稿をそのまま開き、必要に応じて `.md` を使う、という流れで問題ありません。

## beta 版の重要な既知制限

開いてすぐ保存しても Markdown の表記がまったく変わらないことは、beta 初回の対象外です。元の Markdown 表記が Nyoze の Markdown 表現へ正規化される場合があります。

特に次の構文や表記は完全保持しません。

- GFM table
- reference-style link / collapsed reference link / link definition
- footnote
- definition list
- 複雑な list / blockquote の空行、lazy continuation、tight / loose 表現
- code fence の文字種、長さ、末尾空行などの表記差分
- softbreak / hardbreak / `<br>` / two-space hardbreak の表記差分
- mixed EOL
- BOM や複数 encoding

Source Mode は raw save 専用導線ではありません。Apply / Save 時には Nyoze の parser / serializer を通るため、reference-style link や table などは raw のまま保存されない場合があります。

beta で実用上対応している文字コードは UTF-8 のみです。非 UTF-8 ファイルは文字化け状態で上書きしないよう、通常編集対象として開きません。Shift-JIS / CP932 などの文書は、事前に UTF-8 へ変換してから利用してください。

長大文書では、特に次の組み合わせで入力や描画が重くなる場合があります。

- 縦書き
- ルビ表示
- 検索 ON
- 日本語 IME 入力

目安としては 10万文字前後から、環境によっては重さが出る場合があります。ルビを多用した文書では、それより少ない文量でも影響が出ることがあります。

重く感じたときは、まずルビ表示をオフにする、`Paragraph Plain` を使って編集する、それでも重い場合は章などの区切りのよい単位でファイルを分ける、といった運用をおすすめします。

beta 初回では、長大文書に対する仮想化や表示範囲に応じた描画最適化は入れていません。

## まだ対応していない導線

- OS からの drag and drop 読み込み
- Open With からの起動引き渡し
- `.md` の OS 全体関連付け
- frontmatter の一般編集 UI
- 高度な競合解決 / merge UI
- autosave / crash recovery journal
- Linux 向け公式パッケージ

## post-beta へ送った主項目

- Markdown 未対応構文を、そのまま保持する仕組み
- Source Mode の raw save 専用導線
- mixed EOL / BOM / 複数 encoding の完全な保存往復
- content hash ベースの外部編集競合検知と diff / merge UI
- autosave / recovery journal
- 長大文書向けの仮想化 / 表示範囲に応じた描画最適化
- frontmatter の一般編集 UI
- drag and drop / Open With / OS 関連付け

## テスター向けの確認事項

最低限、次の条件を理解した上で試してください。

- 正式な読み込み導線はアプリ内の `Load` です
- beta では「原稿を壊さず保存往復できること」を優先しており、Markdown 表記の完全保持までは保証しません
- 重要な原稿では、Nyoze beta で初めて開く前に別途バックアップを取ってください
- `Source Mode` でも raw のまま保存されるとは限りません
- 非 UTF-8 原稿や mixed EOL を含む原稿は、beta では検証用に留めるのが安全です

## フィードバック

不具合報告やフィードバックは、アプリ内の `Bug Report` / `Feedback` から送れます。
Google フォームの質問に沿って、使用環境や再現手順、原稿への影響などを記入してください。
