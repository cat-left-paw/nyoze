# Changelog

公開版として配布した変更履歴を、この文書に積み上げていきます。  
現行 beta の既知制限や注意事項は [RELEASE_NOTES.md](./RELEASE_NOTES.md)、導入手順は [INSTALL.md](./INSTALL.md) を参照してください。

次の GitHub pre-release は `0.3.0-beta.2` です。Microsoft Store は今回は更新せず、公開中のアプリ表示 version `0.2.1-beta.1` / Store package version `1.2.1.0` を維持します。

## 未リリース

- 現時点ではありません

## 0.3.0-beta.2

`0.3.0-beta.1` 公開後に確認された不具合を修正する pre-release です。

### 不具合修正

- 章境界ナビゲーションが無効な状態でrendererの再描画が繰り返され、アイドル時にもCPU使用率が高くなる問題を修正
- 見出し先頭の全角空白が再解析や保存を繰り返すたびに増殖する問題を修正
- タブ列右端の操作アイコンでtooltipが表示されない問題を修正

### 表示・案内

- 書庫未登録時の案内を、現在の書庫作成・登録手順に合わせて更新

## 0.3.0-beta.1

`0.2.1-beta.1` からの主な変更です。

### 主な変更

- 書庫管理と右ペインの **作品タブ** を追加し、`.nyoze/books.json` を正本として Books / Materials、作品・文書 metadata、章順を管理できるようにした
- Book 全体 Outline、前章 / 次章ナビゲーション、章頭・章末の移動導線を追加。現在の文書または Book 全体を、LeME / でんでん / 青空文庫風テキスト / Web Book へ書き出せるようにした
- 作品内の本文位置に紐づく付箋を追加。色、タグ、表示フィルタ、Markdown preview、解決済み管理、不整合の整理に対応した。同一作品内の単一ファイルを Nyoze で移動・改名した場合は、Book と付箋の登録 path も安全に追従する
- 現在の文書と Book 全体をページ単位で閲覧できる、読み取り専用の **Page Viewer** を追加。Outline、scrubber、Reader theme、画像、見出し前改ページ、余白・用紙枠、header / footer、簡易表紙、ページ遷移に対応した
- 現在の文書と Book 全体を、reader 付きの単一 HTML または Web 公開用 package として作成できる **Web Book** を追加。画像埋め込み、見出しのない章も含む章タイトル単位の目次・Outline、metadata、簡易表紙、Reader Settings、印刷 / PDF 用境界、容量警告に対応し、モバイルでは tap / swipe によるページ送りも利用できる。従来の standalone HTML 書き出しは Web Book に一本化した
- LeME 互換 Markdown、でんでんコンバーター向け Markdown、青空文庫風 TXT の書き出しを追加。実機確認に基づくルビ、縦中横、装飾、画像、改ページなどの変換に対応した
- 中央寄せ・行末寄せ・字下げ・組み込みスタイルのブロック装飾、改ページ、複数枚指定可能な空白ページ、下線を追加し、通常編集と各書き出し経路で扱えるようにした
- WYSIWYG 通常編集向けの擬似キャレットと、frontmatter を編集する **Document Metadata** を追加。作品内ファイルのタブには本文 / 資料の role icon を表示し、非装飾系の操作をタブ列右端へ整理した
- App icon を、紙面と墨円を背景にした新しい「n」アイコンへ更新した

### 不具合修正

- 入れ子の引用を保存・再読込したときに、改行や引用階層が崩れたり、引用直後の本文が引用内へ取り込まれたりする問題を修正した。入れ子の引用末尾に編集できない余分な空白が表示される問題も修正した
- 複数の段落や見出しを選択して引用またはコードブロックへ変換・解除したときに、段落境界や改行が崩れる問題を修正した
- 縦書きでルビ直後の約物が次の列頭へ分離しやすい問題と、inline 装飾を含む段落末の閉じ括弧が不自然な位置で折り返される問題を、保存内容を変えない表示補正で緩和した

## 0.2.1-beta.1

- Typewriter Mode を本実装し、Typewriter scroll、scroll past end、Visual Focus、current line highlight、toolbar quick toggle を追加
- Visual Focus の current line overlay を縦書き中心に安定化し、frontmatter 表示直後の再 anchor 漏れも修正
- `Paragraph Plain` の click 遅延を追加最適化し、pane 開閉時の overlay 追従、空段落境界ナビゲーションなどの回帰を修正
- ルビ / 明示 TCY 直後の日本語 IME 入力を boundary sentinel bridge で改善し、論理行頭 ruby 前入力や後方 composition の崩れを抑制
- Help メニューに `MANUAL を開く` と `ショートカットキー一覧` を追加し、read-only internal shortcut doc を実装
- Windows の一部 AMD GPU + Chromium 系環境で I-beam カーソルが白く見える問題に対し、`エディタで矢印ポインターを使う` 回避設定を追加
- README / INSTALL / Release Notes / 配布手順を更新し、Store と GitHub zip の更新方針、SAC 注意、Store 版の更新導線、共存可否を整理

## 0.2.0-beta.1

- Electron を `41.3.0` へ更新し、縦書き・scroll restore・shortcut E2E と macOS arm64 / Windows x64 package の確認を実施
- Paragraph Plain 解除時に、単一 top-level block として解釈できる `# heading` / list / quote / fenced code / `---` を通常表示へ反映するよう改善
- special inline boundary を `aozoraRuby` / `aozoraTcy` 共通へ整理し、WORD JOINER sentinel、delayed composition suppression、診断ログ改善で日本語 IME 境界入力を安定化
- Windows / Linux の native titlebar overlay controls と header toolbar / Document Type badge が重ならないよう、window controls overlay reservation と狭幅 header layout を調整
- 拡大表示や狭幅で header toolbar が clipped される場合、toolbar 上の wheel / trackpad で隠れたボタンへ pan できるよう改善
- Windows の native select で選択中 option に check prefix を付け、テーマ選択は 2 色 swatch 付きの軽量 custom menu へ変更
- App icon を円形シンプルアイコンへ差し替え、開発起動時の icon も更新
- Microsoft Store / MSIX 配布準備として、`package:win:store`、Store 専用 AppX config、privacy policy、Partner Center 入力方針を追加

## 0.1.1-beta.1

- `UI Language` に `ja` / `en` / `mixed` を追加し、主要 UI の stage1 i18n を導入
- Theme / slider / chip / tooltip / header 周辺を polish し、`Display Settings` の `TCY` を独立セクション化
- shortcut を整理し、Ruby 挿入、左右 pane toggle、outline previous / next、outline fold toggle を実運用向けの組み合わせへ更新
- 左ペイン文書情報の `Type` / `EOL` 表示、Ruby 挿入時スクロールジャンプ修正、縦書き見出し先頭 `ArrowLeft` 修正、writing-mode / tab / Source Mode の scroll restore 改善を追加
- 日本語引用符つき強調の reopen / round-trip を改善し、`**A**や**B**` 系の単一装飾隣接ペアを安定化
- Windows 配布物を zip 形式へ切り替え、旧 installer 利用者向けの導入案内を整理
- Windows 配布対象が `x64` のみで、32bit Windows は対象外であることを文書へ明記

## 0.1.0-beta.2

- `Paragraph Plain` で文書先頭 / 末尾段落を編集中、外側方向の境界矢印のあとに `Enter` を押すと、段落分割されず textarea 内で改行されたり、解除時に変更が反映されないことがある不具合を修正
- `Paragraph Plain` で文書末尾段落を `Enter` で分割した直後、新しい段落へ移る際にスクロールが追従せず、overlay とキャレットが画面外へ出ることがある不具合を修正
- beta 配布向け文書を整理し、README / リリースノート / 導入案内を見直し

## 0.1.0-beta.1

- 初回 beta 版を公開
- 縦書き / 横書きの WYSIWYG 編集、Paragraph Plain、Source Mode、Document Settings、File Explorer などの主要導線を公開
- beta テスター向けに既知制限、配布物、報告導線を整理
