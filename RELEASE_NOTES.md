# Nyoze Beta Release Notes

Nyoze は、縦書き日本語執筆を主目的とした Markdown デスクトップエディタの beta 版です。
この文書を、beta テスター向けの既知制限・配布上の注意・報告時の注意の正本として扱います。現行公開版は `0.2.0-beta.1` です。

- 累積の更新履歴: [CHANGELOG.md](./CHANGELOG.md)
- インストールと初回起動: [INSTALL.md](./INSTALL.md)

## 0.2.0-beta.1

Nyoze 0.2.0-beta.1 は、縦書き日本語執筆を主目的とした Markdown デスクトップエディタの beta 更新版です。Windows では引き続き GitHub Releases の zip 配布を継続しつつ、Microsoft Store / MSIX 申請準備を進めています。

### 今回の更新

- Electron を `41.3.0` へ更新し、縦書き、scroll restore、shortcut 周辺の既存 E2E / package 確認を合わせて行いました。
- Paragraph Plain で `# 見出し`、`- list`、`1. list`、`> quote`、fenced code、`---` などを単一 block として入力した場合、明示解除・境界矢印移動・Enter 分割時に通常表示側へ反映されるよう改善しました。
- special inline boundary を `aozoraRuby` / `aozoraTcy` 共通へ整理し、WORD JOINER sentinel、delayed composition suppression、診断ログ改善で日本語 IME 境界入力を安定化しました。
- Windows の native titlebar overlay controls と header toolbar / Document Type badge が重ならないよう調整しました。
- 拡大表示や狭幅で header toolbar の一部が隠れる場合、toolbar 上の wheel / trackpad 操作で隠れたボタンへ移動できるようにしました。
- Windows の native select では選択中 option に check prefix を表示し、テーマ選択メニューではテーマ名の右側に 2 色 swatch を表示するようにしました。
- App icon を円形シンプルアイコンへ差し替え、開発起動時の icon も更新しました。
- Microsoft Store / MSIX 配布準備として、`package:win:store`、Store 専用 AppX config、privacy policy、Partner Center 入力方針を追加しました。

### Windows 配布と Store 準備

- GitHub Releases の Windows 配布物は引き続き `Nyoze-Windows-0.2.0-beta.1-x64.zip` です。
- Microsoft Store 向けには `npm run package:win:store` を追加し、Store 用 identity / publisher / AppX version の分離管理を入れています。
- Partner Center では検証用 `0.1.1-beta.1` appx の validation と申請フォーム入力を完了済みで、最終送信前に `0.2.0-beta.1` appx へ差し替える前提です。
- Store 版公開後も、GitHub zip は Store を使えない環境向けの代替配布として残す予定です。

## 0.1.1-beta.1

Nyoze 0.1.1-beta.1 は、縦書き日本語執筆を主目的とした Markdown デスクトップエディタの beta 更新版です。

### 今回の更新

- `UI Language` に `ja` / `en` / `mixed` を追加し、主要 UI の stage1 i18n を導入しました。
- Theme / slider / chip / tooltip / header 周辺を見直し、`Display Settings` の `TCY` を独立セクション化しました。
- shortcut を整理し、Ruby 挿入は `Cmd/Ctrl + Alt/Option + R`、左右 pane toggle は `Cmd/Ctrl + Alt/Option + ,` / `.`、outline previous / next は `Cmd/Ctrl + Shift + ,` / `.`、outline fold toggle は `Cmd/Ctrl + Shift + L` に統一しました。
- 左ペイン文書情報に `Type` / `EOL` を追加し、Ruby 挿入時の scroll jump と、縦書き見出し先頭付近の `ArrowLeft` 不具合を修正しました。
- 同一文書内の scroll restore を改善し、writing-mode 切替、tab restore、`Source Mode` 往復で先頭へ戻りにくくしました。`Source Mode → 通常` は近似復元ですが、「大きく先頭へ戻る」回帰は Playwright E2E で固定しています。
- 日本語引用符つき強調の reopen / round-trip を改善し、`**「文学的な気分」**や**「情緒」**` のような単一装飾の隣接ペアが崩れにくくなりました。
- Windows 配布物は installer から zip へ切り替えました。`0.1.0-beta.1` / `0.1.0-beta.2` の installer 利用者も、`0.1.1-beta.1` は zip を展開して同梱の `Nyoze.exe` を起動してください。

### 対象

- Markdown 原稿を縦書き / 横書きで編集したいユーザー
- UTF-8 の Markdown ファイルを中心に扱うユーザー
- beta 版として、未対応機能や表記の正規化を確認しながら試せるユーザー

### 配布物

- macOS:
  - `Nyoze-Mac-0.1.1-beta.1-arm64-Installer.dmg`
  - `Nyoze-Mac-0.1.1-beta.1-x64-Installer.dmg`
- Windows:
  - `Nyoze-Windows-0.1.1-beta.1-x64.zip`
- Linux:
  - 現時点の beta では公式パッケージを提供しません

Apple Silicon Mac では `arm64`、Intel Mac では `x64` を使ってください。
Windows 版は `x64` 向け zip のみで、32bit Windows は現行 beta の対象外です。

macOS 配布物は現状、Developer ID 署名と Apple notarization（公証）に未対応です。初回起動時に Gatekeeper の強い警告が出ることがあり、`完了` で閉じたあとに `システム設定 > プライバシーとセキュリティ > このまま開く` が必要になる場合があります。対処は [INSTALL.md](./INSTALL.md) を参照してください。

Windows では、`0.1.0-beta.1` / `0.1.0-beta.2` では installer を配布していましたが、`0.1.1-beta.1` は Smart App Control の影響により zip 配布へ切り替えています。既存 installer 利用者も、この版では zip 展開後の `README.txt` を確認し、同梱の `Nyoze.exe` を使ってください。

## 主な機能

- 縦書き / 横書きの WYSIWYG 編集
- `.md` / `.markdown` / `.txt` 文書の読み書き
- Markdownでの基本的な装飾と、ルビ、縦中横の表示と編集
- `Document Type` の `Novel` / `Article` 切り替えによる、文芸用途と、ブログ記事 / 技術文書系の両方に合わせた文書運用
- 複数タブ、File Explorer、保存前バックアップ、外部編集競合の最小検知
- `UI Language` の `ja` / `en` / `mixed` 切り替えと、豊富なテーマ / 表示設定の調整
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

開いてすぐ保存しても Markdown の表記がまったく変わらないことは、現行 beta の対象外です。元の Markdown 表記が Nyoze の Markdown 表現へ正規化される場合があります。

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

日本語引用符つき強調のうち、`**A**や**B**` / `*A*や*B*` / `~~A~~や~~B~~` のような単一装飾の隣接は改善済みです。ただし、`***A***や***B***` や `**~~A~~**や**~~B~~**` のような複合装飾が隣接する場合は、beta では reopen / 保存後に表記が崩れることがあります。

beta で実用上対応している文字コードは UTF-8 のみです。非 UTF-8 ファイルは文字化け状態で上書きしないよう、通常編集対象として開きません。Shift-JIS / CP932 などの文書は、事前に UTF-8 へ変換してから利用してください。

`UI Language` は stage1 導入です。主要な visible label / tooltip は切り替わりますが、長い helper 文や一部通知文、詳細 error 文面までは完全移行していません。

長大文書では、特に次の組み合わせで入力や描画が重くなる場合があります。

- 縦書き
- ルビ表示
- 検索 ON
- 日本語 IME 入力

目安としては 10万文字前後から、環境によっては重さが出る場合があります。ルビを多用した文書では、それより少ない文量でも影響が出ることがあります。

重く感じたときは、まずルビ表示をオフにする、`Paragraph Plain` を使って編集する、それでも重い場合は章などの区切りのよい単位でファイルを分ける、といった運用をおすすめします。

beta では、長大文書に対する仮想化や表示範囲に応じた描画最適化はまだ入れていません。

ルビや明示 TCY（縦中横）の直後で日本語 IME 入力を始めたとき、環境やタイミングによっては、まれに 1 タイプ目で入力が進まない状態になることがあります。その場合は `Escape` を押すと未確定入力を破棄して通常の編集状態へ復帰できます。

縦書きでルビ直後に句読点が続き、ちょうど行頭 / 行末の境界にかかる場合、Chromium 系では句読点が行頭側に表示されることがあります。頻度は高くありませんが、現行 beta では既知制限として扱います。

## まだ対応していない導線

- OS からの drag and drop 読み込み
- Open With からの起動引き渡し
- `.md` の OS 全体関連付け
- Windows Microsoft Store / MSIX 配布（`0.2.0-beta` 向けに準備中）
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
