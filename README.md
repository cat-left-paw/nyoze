# Nyoze Beta

[日本語](./README.md) | [English](./README.en.md)

公式サイト: [Nyoze](https://cat-left-paw.github.io/nyoze/)

Nyoze は、**縦書きでそのまま文章を書けるエディタ**です。
Published by Left Paw Studio.

次の GitHub pre-release は `0.3.0-beta.2` です。Microsoft Store 版は今回は更新せず、公開中の `0.2.1-beta.1` / Store package version `1.2.1.0` を維持します。

`0.3.0-beta.1` では、章境界ナビゲーションが無効な状態で renderer の CPU 使用率が高止まりする問題が確認されています。`0.3.0-beta.2` で修正するため、公開後は更新を推奨します。

- 小説やエッセイを縦書きでそのまま書けます
- Markdown 形式で保存されますが、普通のテキストとして扱えます
- ルビや縦中横など、日本語の表現にも対応しています

Nyoze は、縦書き日本語執筆を主目的とした Markdown エディタです。
beta 版では、日常執筆で破綻しないこと、Markdown / frontmatter / 画像の最低限の互換があること、原稿を壊さず保存往復できることを優先しています。

詳細な操作は [MANUAL.md](./MANUAL.md) を参照してください。

## こんな人に向いています

- 小説や文章を縦書きで書きたい
- Markdown を使ってみたいが、難しい操作はできるだけ避けたい
- テキストファイルで原稿を管理したい
- ルビや縦中横を使いながら、日本語の文章を気持ちよく書きたい

## この README で使う言葉

- **Markdown**: 見出しや強調などを、簡単な記号で書けるテキスト形式です
- **frontmatter**: 文書のタイトルや著者名などを入れる、文書冒頭の `---` で囲まれた領域です
- **作品**: `.nyoze/project.json` を持つフォルダです。内部仕様では Project と呼び、付箋や Book / Materials 管理の単位になります
- **Book**: 作品内でまとめて閲覧・ナビゲーションする単位です（本編、外伝など）。作品内の Book 構造と表示 metadata（title / authors / translators）は `.nyoze/books.json` が正本です
- **WYSIWYG**: 記号を直接見ながらではなく、見た目に近い形で編集できる表示です

## 主な特徴

- 縦書きでそのまま編集できます
- 見た目のまま書ける編集画面があります
- Typewriter scroll、Visual Focus、擬似キャレットで、今書いている場所へ視線を戻しやすくできます
- ルビや縦中横に対応しています
- `.md` だけでなく `.txt` もそのまま開いて保存できます
- 原稿を壊さず保存往復することを重視しています

## この beta 版の位置づけ

- 単体デスクトップアプリとして Markdown を編集し、縦書き・横書きで執筆できます
- 文芸用途を主対象としつつ、ブログ記事や技術文書などの `記事・文書`（Article）も扱えます
- `Document Type` を `小説・本文`（Fiction）/ `記事・文書`（Article / Document）で切り替えることで、文書に合った改行解釈で執筆できます（内部値 `novel` / `article` は不変。Document Type は表示方向ではなく文書性格・改行スタイルの設定です）
- beta では「執筆・保存・再読込・最低限の文書管理」までを提供範囲にします
- 現時点では、執筆体験と原稿保全を優先しています

## できること

- 縦書き / 横書きの切り替え
- WYSIWYG 編集
- Typewriter scroll、編集ブロックハイライト、現在行ハイライト、擬似キャレットなどの執筆補助表示
- 作品内の本文位置へ紐づく付箋（タイトル、複数行Markdownメモ、解決済み管理、Notesタブ）
- 作品タブでの Books 一覧、Materials 一覧、複数 role filter、資料Markdown preview、右ペイン内の資料簡易編集（textarea + 明示保存）
- `.nyoze/books.json` による Book / Materials 管理（Book 作成・名称変更・登録解除、本文/資料の title / authors / translators 編集、登録・並び替え・登録解除）
- 右ペイン **Document Metadata** で frontmatter を編集・保存（作品内表示 metadata とは自動同期しない）
- 作品未所属時に、作品名と最初の Book 名を確認して `.nyoze/project.json` と `.nyoze/books.json` を作成
- 書庫管理画面による書庫の作成 / 登録 / 切り替え / 名前変更 / 登録解除 / Finder・Explorer 表示
- 左ペイン File Explorer の「書庫 / 作品」タブ、作品一覧からの project root 表示、書庫外ファイル表示
- 作品タブでの作品切り替え
- 作品フォルダ配下の未登録 `.md` / `.markdown` / `.txt` を Books / Materials へ登録
- Outline タブの `[現在の文書] [Book全体]` 切替、Book全体の章 / 見出しナビゲーション、前章 / 次章ボタン
- Book 全体 export（File > 書き出し、LeME / でんでん / 青空文庫風 / Web Book、read-only disk、改ページ・作品情報・目次 options 確認 UI）
- Web Book（現在文書 / Book 全体を、reader付きの単一HTMLまたはWeb公開用packageとして作成。Chrome / Edgeでの閲覧・簡易印刷/PDF保存向け。ユーザー向けHTML出力はこの経路のみ）
- 独立した読み取り専用 Page Viewer（現在の文書 / Book 全体、CSS Columns によるページ単位の閲覧、目次・アウトラインからの見出しジャンプ、ローカル画像、`:::page-break` / `:::blank-page-N` の表示）
- Book 本文の章頭 / 章末オーバーレイと `Option/Alt + wheel` による前章末尾 / 次章先頭への移動
- 複数タブでの文書の表示と編集
- File Explorer での一覧表示と軽い単一ファイル操作（作成 / 名前変更 / 複製 / 移動 / ゴミ箱への削除）。Finder / Explorer を置き換える本格ファイルマネージャではありません
- WYSIWYG での 自動 TCY （縦中横）表示（表示のみ、初期 OFF、数字だけ対象のオプションあり、保存内容は不変）
- 独自記法を使った明示 TCY（縦中横）
- 青空文庫形式のルビ、傍点への対応
- ルビ表示 / 非表示の切り替え
- 縦書きでのルビ直後約物や inline 装飾を含む段落末閉じ括弧の表示補正（保存内容は不変）
- WYSIWYG コードブロックの表示専用シンタックスハイライト、言語ラベル、本文コピー
- `Paragraph Plain` による段落単位の Markdown ソース編集（その段落だけをテキストとして直接編集できます。単一ブロックなら見出し・リスト・引用などの Markdown 記法も通常表示へ反映されます）
- `Source Mode` による全文 Markdown ソース編集（文書全体をテキストとして編集できます）
- 検索 / 置換
- ローカル画像参照付き Markdown の表示
- frontmatter（文書のタイトルや著者名などを入れる領域）の読み取り表示
- `Document Settings` からの限定編集（`Document Type` / `title` / `author` / `translator`）
- `Document Type` の `小説・本文`（Fiction）/ `記事・文書`（Article / Document）切り替え
- `Document Type` の切り替えによる改行ポリシー変更
- 文芸用途と、ブログ記事 / 技術文書系の両方に合わせた文書運用
- 通常編集上のリンクを `Cmd/Ctrl + Click` で外部ブラウザに開く導線（`https://` の絶対 URL のみ）
- 見出しの折りたたみ / 展開
- 折りたたまれた見出しの簡易プレビュー
- アウトラインパネルからの見出しジャンプ
- アウトラインパネル上での見出しプレビュー
- リスト（箇条書きリスト、番号付きリスト、チェックリスト）のアウトライナー的な操作
- 豊富なテーマ切り替え
- GUI での簡単なテーマ編集と表示設定の調整（テーマ選択メニューには色の目安となる 2 色プレビューが表示されます）
- ファイル保存、再読込、外部編集競合の最小保護

## 今後対応予定のもの

- Project / Book の詳細設定 UI（著者情報、出力設定、テンプレート生成など）
- 章順のドラッグ変更、missing file の再接続 UI
- EPUB / PDF の Nyoze 本体直接生成、Vivliostyle 連携、印刷所入稿品質の固定ページ組版（外部ツール向け Book 全体書き出し、独立した Page Viewer、Web Book による Chrome / Edge 向けの簡易印刷/PDF保存は対応済み）
- Windows の Store 版と GitHub zip 版での更新導線の追加整理
- テーブルや数式への対応
- ページレイアウト編集
- 前後章のグローバルショートカット
- ショートカット再割り当て
- 高度な競合解決 UI

優先度が下がった候補:

- `.md` の OS 全体関連付け
- `Open With` からの起動引き渡し
- OS からの drag and drop による文書読み込み

Nyoze は Obsidian の Vault に近い **書庫** を通常の入口として扱います。書庫は File メニューの **書庫を管理** から作成 / 登録 / 切り替えでき、同時に active な書庫は 1 つだけです。OS 全体の関連付けや drag and drop の必要性は相対的に低いため、これらは急いで実装する対象ではありません。

## 正式な読み込み導線

beta 版で正式にサポートする読み込み導線は、単独ファイルを開く **ファイルを開く**（旧 `Load`）と、active 書庫内の File Explorer です。フォルダを書庫として使う場合は File メニューの **書庫を管理** から登録 / 作成します。

- `ファイルを開く`（旧 `Load`）: `.md` / `.markdown` / `.txt` の単独ファイルを開く
- `Shift + ファイルを開く`: 新規タブで空の文書を作る
- `File → 書庫を管理`: 書庫の作成 / 既存フォルダ登録 / 切り替え / 名前変更 / 登録解除 / Finder・Explorer 表示

未対応導線:

- drag and drop
- `Open With`

これらは beta 版の正式機能として扱いません。

## `.txt` と `.md` について

Nyoze は `.md` だけでなく、`.txt` の文書もそのまま開いて編集できます。

- `ファイルを開く` では `.md` / `.markdown` / `.txt` を開けます
- すでに `.txt` で書いている原稿も、そのまま読み込んで使えます
- `.txt` で開いた文書は、`.txt` のまま保存できます
- `.md` も `.txt` も中身はテキストです。違いは「この文書を Markdown として扱うことを、拡張子でわかりやすくしているかどうか」に近いです
- frontmatter（文書冒頭の `---` で囲まれた値）を入れている場合も、その内容は普通のテキストとしてそのまま保存されます

ただし、古いテキストエディタや文芸向けエディタで作られた `.txt` は、Shift-JIS / CP932 のことがあります。Nyoze beta で実用上対応している文字コードは UTF-8 のみです。Shift-JIS / CP932 の `.txt` はそのままでは開けないため、先に UTF-8 へ変換してから使ってください。

Nyoze で見出し、太字、リスト、リンクなどの Markdown 記法を使った部分は、一般的なテキストエディタで開くとそのまま記号として見えます。

たとえば、Nyoze では太字として見えていても、普通のテキストエディタでは `**このように**` と表示されます。

frontmatter を付けている場合も、普通のテキストエディタでは次のようにそのまま表示されます。

```text
---
title: 作品名
author: 著者名
---
```

そのため、

- まずは慣れた `.txt` の原稿をそのまま開いて試す
- Markdown として扱うことをはっきりさせたい原稿は `.md` にする

という使い分けができます。

## frontmatter の扱い

詳細な key 一覧・作品内外の正本・YAML 制限は [`docs/frontmatter-reference.md`](docs/frontmatter-reference.md) を参照してください。

- frontmatter は文書先頭の raw prefix として保持します
- 保存往復で勝手に壊さないことを優先しています
- beta では一般的な YAML 編集 UI はありません
- 右ペインの **文書メタデータ / Document Metadata** から限定キーだけを明示操作で更新できます
- 上記以外の frontmatter を編集したい場合は `Source Mode` を使ってください

## 対応環境

`0.3.0-beta.2` のGitHub pre-release配布対象は次の環境です。

- macOS:
  - Apple Silicon Mac 用 DMG（`arm64`）
  - Intel Mac 用 DMG（`x64`）
- Windows:
  - Microsoft Store 版
  - GitHub Releases の zip 配布（展開後に `README.txt` を確認し、`Nyoze.exe` を起動）
- Linux: 現時点の beta では公式パッケージなし

Windows 版は 64bit (`x64`) 専用です。32bit Windows は現行 beta のサポート対象外です。
Windowsでは、GitHub Releasesに`0.3.0-beta.2`をpre-releaseとして配布します。Microsoft Store公開版はアプリ表示version `0.2.1-beta.1` / package version `1.2.1.0`のままで、今回の新機能は含みません。Store版は通常利用向け、GitHub zipは新機能の観察またはStoreを使えない環境向けです。

macOS 版は 2 種類あります。

- `arm64`: Apple Silicon Mac 用です。M1 / M2 / M3 / M4 などの Mac はこちらです
- `x64`: Intel Mac 用です。古い Intel 搭載 Mac はこちらです

間違った方を入れると、起動できない、または著しく遅くなることがあります。自分の Mac の種類に合ったものを使ってください。

Linux 環境では公開ソースから `npm install` / `npm run dev` / `npm run build` を試せます。ただし実機検証は未実施で、公式サポート対象は macOS / Windows の配布物を優先します。Electron / Linux に慣れている場合は、必要に応じて `electron-builder` で Linux 向けパッケージを作成できますが、現時点の beta では公式配布物としては提供しません。

## ダウンロードとインストール

現行 beta 版は **GitHub Releases または Microsoft Store の公開配布物を使う** 想定です。
通常の利用では、ソースコードからのビルドは不要です。

想定している導線:

- macOS:
  - Apple Silicon Mac: `arm64` の DMG をダウンロードして起動
  - Intel Mac: `x64` の DMG をダウンロードして起動
- Windows:
  - 公開済みStore版を使う: Microsoft Storeから`Nyoze`を導入
  - `0.3.0-beta.2`を試す: GitHub Releasesのzipをダウンロードして展開し、同梱の`README.txt`を確認して`Nyoze.exe`を起動

インストール時の注意:

- Microsoft Store 版以外では、macOS の Gatekeeper 警告や Windows の Smart App Control / ブラウザ保護などによる警告が出ることがあります
- Windows では、GitHub zip 版でも Smart App Control により `Nyoze.exe` の実行が拒否されることがあります
- Windows で確実に使いたい場合は、Microsoft Store 版の利用を優先してください
- 特に macOS の未署名 DMG では、初回起動時に通常より強い警告が出る場合があります
- 詳しい導入手順と警告時の対処は [INSTALL.md](./INSTALL.md) を参照してください

### ストア版について

Windows では Microsoft Store 版がすでに公開されています。通常利用では Store 版を優先してください。

- Store 版は審査を伴うため、緊急度の低い小修正を毎回すぐ反映するとは限りません。ある程度まとまった単位で更新されることがあります
- GitHub zip は、Store を使えない環境向けの代替配布であると同時に、Store 版より細かい beta 修正を先に含むことがあります
- Store 版は、Microsoft Store アプリのライブラリ画面から更新できます
- Store 版と GitHub zip 版は共存自体は可能ですが、通常利用ではどちらか一方に寄せることを推奨します。設定は共有されます
- Microsoft Store ディープリンク: `ms-windows-store://pdp/?productid=9N52TD18DBCR`
- Web ストア URL: [Nyoze on Microsoft Store](https://apps.microsoft.com/detail/9N52TD18DBCR)

補足:

- `0.1.0-beta.1` / `0.1.0-beta.2` の Windows 版は installer でしたが、`0.1.1-beta.1` は Smart App Control の影響により zip 配布へ切り替えています。
- 旧 installer 版を入れている場合でも、この版は自動更新されません。新しく zip 版を展開して起動してください。
- ただし zip 版でも、環境によっては Smart App Control により実行が止められることがあります。その場合は zip 版で回避しようとせず、Microsoft Store 版を使ってください。
- Windows 版は `x64` のみです。32bit Windows 向け配布物はありません。

## アンインストールとユーザーデータ

- macOS では `Applications` から `Nyoze.app` を削除すれば、アプリ本体は取り除けます。
- Windows の zip 版は、展開したフォルダを削除すればアプリ本体は取り除けます。
- `0.1.0-beta.1` / `0.1.0-beta.2` の旧 installer 版は、Windows の「設定 > アプリ」からアンインストールしてください。
- ただし、どの方法でも設定ファイルやバックアップは自動では消えません。

設定やバックアップの保存先:

- macOS: `~/Library/Application Support/Nyoze/`
- Windows: `%APPDATA%\Nyoze\`

この中には、たとえば次が入ります。

- `settings.json`
- `backups/`
- `workspace-state.json`

完全に削除したい場合だけ、この `Nyoze` フォルダも手動で削除してください。設定やバックアップを引き継ぎたい場合は残してください。詳しい導入・アンインストール手順は [INSTALL.md](./INSTALL.md) を参照してください。

## ソースコードから試す場合

Linuxユーザーや、開発版を手元で試したい人向けの手順です。

前提:

- Node.js 20 以上推奨
- npm 10 以上推奨

初期化:

```bash
npm install
```

開発起動:

```bash
npm run dev
```

ビルド:

```bash
npm run build
```

配布物を作る場合:

```bash
npm run package
```

macOS で現在の実行環境に対応する arch の配布物を作る場合は、上の `npm run package` で十分です。

macOS の `arm64` / `x64` の両方を明示的に作る場合:

```bash
npm run package:mac:arm64
npm run package:mac:x64
```

Windows の `x64` zip を明示的に作る場合:

```bash
npm run package:win:x64
```

配布物は `release/<version>/` に出力されます。現時点の beta では公式配布物は macOS DMG と Windows zip を対象とし、Linux 向け公式パッケージはまだ提供していません。`npm run package` は通常、その実行環境に対応する 1 つの配布物を作ります。macOS DMG は arch を含む名前で出力されます。Windows zip は、展開時にファイルが散らからないよう `Nyoze-Windows-<version>-x64/` フォルダを含む形で作成します。

- `Nyoze-Mac-<version>-arm64-Installer.dmg`
- `Nyoze-Mac-<version>-x64-Installer.dmg`
- `Nyoze-Windows-<version>-x64.zip`

## 既知の制限

- 正式なファイル読み込み導線はツールバーの「ファイルを開く」と、active 書庫内の File Explorer です
- フォルダを書庫にする導線は File メニューの「書庫を管理」です
- File Explorer は一覧表示と軽い単一ファイル操作用です。フォルダ配下一括移動、複数選択、Project 間の登録情報移管などの本格ファイルマネージャ機能は対象外です
- drag and drop は未対応です
- `Open With` は未対応です
- `.md` の関連付けは未対応です
- Linux 向け公式パッケージは現時点の beta では提供していません
- frontmatter の一般編集 UI はありません
- 複雑な YAML の編集は `Source Mode` での編集が前提です
- 高度な競合解決やマージ UI はありません
- コードブロックのシンタックスハイライトは WYSIWYG 表示のみです。言語未指定・未対応言語では自動判定せず、プレーン表示になります
- 文書内リンクは `Cmd/Ctrl + Click` で外部ページへ移動できます。通常クリックでは開きません
- `Cmd/Ctrl + Click` で開ける文書内リンクは、`https://` の認証情報なし絶対 URL のみです。`http://`、`mailto:`、`tel:`、相対リンク、文書内アンカーは通常編集上の外部オープン対象ではありません
- ルビや明示 TCY（縦中横）の直後で日本語 IME 入力を始めたとき、環境やタイミングによっては、まれに 1 タイプ目の直後に 2 タイプ目で入力が詰まることがあります。その場合は `Escape` を押すと未確定入力を破棄して通常の編集状態へ復帰できます
- Windows の一部 AMD GPU + Chromium 系環境では、本文や `Source Mode` 上の I-beam カーソルが白く見えて視認しづらくなることがあります。その場合は `View Settings > 文書テーマ > エディタで矢印ポインターを使う` を有効にすると、本文上だけ矢印ポインターへ切り替えて回避できます
- 10万文字前後から、環境によっては入力や描画が重くなる場合があります。特に縦書き・ルビ表示・検索 ON・日本語 IME 入力の組み合わせでは重くなりやすく、ルビを多用した文書ではそれより少ない文量でも影響が出ることがあります
- 重く感じたときは、まずルビ表示をオフにする、`Paragraph Plain` を使って編集する、それでも重い場合は章などの区切りのよい単位でファイルを分ける、といった運用をおすすめします
- beta 版では、開いてすぐ保存しても Markdown の表記がまったく変わらないことまでは保証しません。元の Markdown 表記が Nyoze の Markdown 表現へ正規化される場合があります
- beta で完全保持しない代表例は、GFM table、reference-style link / link definition、footnote、definition list、複雑な list / blockquote、code fence の文字種・長さ・空行、softbreak / hardbreak の表記差分です
- `Source Mode` も beta では raw save 専用導線ではありません。Apply / Save 時に Nyoze の parser / serializer を通るため、上記の未対応構文や表記差分は正規化される場合があります
- beta で実用上対応している文字コードは UTF-8 のみです。UTF-8 として読み込めないファイルは通常編集対象として開きません。Shift-JIS / CP932 などの原稿は、先に UTF-8 へ変換してから使ってください。改行コードは可能な範囲で LF / CRLF を維持しますが、混在 EOL や BOM / 複数 encoding の完全な保存往復は post-beta 対象です
- beta では安定性と原稿保全を優先しているため、導線や表現がまだ粗い箇所があります

## ドキュメント

- 公式サイト・目的別ガイド: [Nyoze](https://cat-left-paw.github.io/nyoze/)
- 操作マニュアル: [MANUAL.md](./MANUAL.md)
- インストールと初回起動: [INSTALL.md](./INSTALL.md)
- プライバシーポリシー: [PRIVACY.md](./PRIVACY.md)
- 更新履歴: [CHANGELOG.md](./CHANGELOG.md)
- beta リリースノート: [RELEASE_NOTES.md](./RELEASE_NOTES.md)

beta テスター向けの既知制限、配布上の注意、報告時の注意は `RELEASE_NOTES.md` を正本としてまとめています。版ごとの履歴は `CHANGELOG.md`、配布物の導入と初回起動の案内は `INSTALL.md` にまとめています。

Windows 版の運用方針:

- 通常利用は Microsoft Store 版を優先します
- GitHub Releases の zip は、Store を使えない環境向けの代替配布として継続します
- beta の小修正は GitHub zip の方が先に含むことがあり、Store 版は審査都合である程度まとまった単位で更新される場合があります
- Store 版と GitHub zip 版は共存可能ですが、設定は共有されます。現行版は多重起動を抑止するため、両方を同時には起動できません

## ライセンス

Nyoze は GNU Affero General Public License v3.0 or later の下で公開されています。詳細は [LICENSE](./LICENSE) を参照してください。

Copyright (C) 2026 猫乃 左手 (cat-left-paw) and Nyoze Project.

公式リリースは `cat-left-paw/nyoze` から配布します。改変版を配布する場合は、著作権表示・ライセンス表示を保持し、公式版と誤認されないようにしてください。詳しくは [NOTICE](./NOTICE) を参照してください。

## フィードバック

beta 版のフィードバック導線はアプリ内にあります。

- Help → `フィードバックを送る`
- `View Settings` → `サポート` → `フィードバックを送る`

バグ報告では、少なくとも次があると助かります。

- OS
- 使用していた版
- 再現手順

報告前の注意事項は [RELEASE_NOTES.md](./RELEASE_NOTES.md) を参照してください。

## Support

Nyoze は無料・オープンソースのアプリとして開発しています。
もし気に入っていただけた場合は、以下から開発を支援できます。

[Buy me a coffee](https://buymeacoffee.com/hidarite)

＊支援は完全に任意です。支援者限定機能や有料での機能解放はありません。
