# Nyoze Beta Release Notes

Nyoze は、縦書き日本語執筆を主目的とした Markdown デスクトップエディタの beta 版です。
この文書を、beta テスター向けの既知制限・配布上の注意・報告時の注意の正本として扱います。次の GitHub pre-release は `0.3.0-beta.1` です。

`0.3.0-beta.1` の配布方針:

- GitHub Releases だけで pre-release として公開します。
- macOS は Apple Silicon / Intel 向け DMG、Windows は x64 zip を配布します。
- Microsoft Store は今回は更新しません。Store 公開版はアプリ表示 version `0.2.1-beta.1` / package version `1.2.1.0` のままです。
- 公開後は約1週間の観察期間を置き、重大な不具合、回帰、配布上の問題、小さな polish だけを扱います。
- LeME / でんでんコンバーター向け出力の名称・説明・利用方法は、変更する可能性があります。

- 累積の更新履歴: [CHANGELOG.md](./CHANGELOG.md)
- インストールと初回起動: [INSTALL.md](./INSTALL.md)

## 0.3.0-beta.1

`0.2.1-beta.1` から、作品単位の管理、ページ単位の閲覧、Web向け閲覧物と外部制作ツール向け出力を大きく拡張した pre-release です。大規模機能追加はこの版で一度凍結し、公開後の観察と互換性確認を優先します。

### 主な更新

- **Project / Book**: `.nyoze/books.json` を正本とする Books / Materials、作品 metadata、章順、Book 全体 Outline、前章 / 次章ナビゲーション、Book 全体 export を追加しました。
- **付箋とファイル管理**: 作品内付箋、色・タグ・filter、missing / orphan cleanupを追加しました。同一作品内の単一ファイル rename / move では、books.json v3 と notes.json の path を安全側の検査と rollback 付きで追従します。
- **Page Viewer**: 現在の文書と Book 全体を、共通の PageModel / CSS Columns による読み取り専用ウィンドウで閲覧できます。Outline、scrubber、Reader theme、余白・用紙枠、header / footer、簡易表紙、見出し前改ページ、ページ遷移に対応します。
- **Web Book**: 現在の文書 / Book 全体を、reader付きの単一HTMLまたはWeb公開用packageとして作成できます。ローカル画像、目次、metadata、簡易表紙、Reader Settings、画面用header / footer、印刷境界、容量警告とhard limitに対応します。
- **モバイル閲覧**: Web Bookで左右tap / click / swipeによるページ移動と、中央tap / clickによるツールバー表示切替を追加しました。coarse pointerかつ画面短辺600px以下では、用紙枠を既定OFFにします。
- **外部export**: 現在の文書とBook全体を、LeME互換Markdown、でんでん向けMarkdown、青空文庫風TXTへ書き出せます。LeME / でんでんでは任意でauto TCYを反映できます。
- **編集・UI**: 擬似キャレット、文書metadata編集、Book role icon、タブrole icon、ツールバー再配置、出力option modalと作品情報表示のCSS回帰修正を含みます。

### 更新前の注意

- 重要な原稿と作品フォルダは、初めて`0.3.0-beta.1`で開く前に別途バックアップしてください。
- Page ViewerのBook全体表示とBook全体exportは、ディスク上の保存済み章を読み取ります。未保存の編集内容は含みません。
- Web公開用packageは、新規または空のフォルダにだけ作成できます。既存packageの上書き、更新、差分同期は未対応です。
- Microsoft Store版には、この節の新機能はまだ含まれません。

### 観察期間中に確認してほしいこと

- 作品metadata、章順、付箋、File Explorerのpath追従
- 現在文書 / Book全体のPage Viewerでのページ送り、Outline、画像、余白、書字方向切替
- Web BookのPC / モバイル操作、単一HTML / package、画像、印刷 / PDF保存
- LeME / でんでん / 青空文庫風出力の名称、説明、変換結果
- 保存、再読込、外部編集競合、Source Mode / Paragraph Plain、IME入力の回帰

詳細な変更履歴は [CHANGELOG.md](./CHANGELOG.md) を参照してください。以下は開発中に積み上げた詳細記録で、後続項目によって置き換えられた途中段階の記述を含みます。現行仕様は上の要約、`MANUAL.md`、`CHANGELOG.md`の後続項目を優先してください。

### 開発中に積み上げた詳細記録

- **Page Viewer**：現在の文書または Book 全体を、独立した読み取り専用ウィンドウでページ単位に閲覧できるようになりました。目次・Outline からの見出しジャンプ、キーボードと下部 scrubber による移動、`:::page-break` / `:::blank-page-N`、主要な Markdown 装飾、許可された相対ローカル画像に対応します。Viewer は同時に 1 つだけ開きます。Book は保存済み chapter を読み込むため、未保存の編集内容は含みません。
- `小説・本文` / `未設定` の文書で、複数行を選択して **Blockquote** や **Code Block** を適用したときの挙動を修正しました。コードブロックは行ごとに分割されず 1 つのコードブロックになり、引用ブロックは引用内の行間が不自然に広がらないよう、段落境界を blockquote 内の改行として扱います。もう一度トグルして解除した場合も、コードブロック内の改行や引用内の改行を通常の段落へ戻します。`記事・文書` の文書や、リスト・既存の複雑な引用・付箋アンカーを含む範囲は従来の安全な挙動を優先します。
- 青空文庫風テキスト書き出しで、`:::align-center`（５字下げ近似）の直後に `:::align-end`（地付き）が続く場合、字下げ終了注記が地付きの注記の内側に紛れ込んでしまう不具合を修正しました。
- 青空文庫風テキスト書き出しで、字下げ（引用や `:::indent-N`）の中にある箇条書き / 番号付きリストの項目マーカー（`・` / `1. `）の後ろに字下げ開始注記が入り込んでしまう不具合を修正しました。
- `:::align-center`（中央寄せ）の書き出しを見直しました。以前使っていた `［＃ページの左右中央］` は、青空文庫では章扉や献辞などページ全体を配置し直すための注記であり、Nyoze の `:::align-center`（本文中の一部を中央寄せにする用途）とは意味が違うため、代わりに `５字下げ`（`［＃ここから５字下げ］` … `［＃ここで字下げ終わり］`）へ近似するようにしました。既存の字下げの中にある場合はそのレベルに5を加算します。
- 青空文庫風テキスト書き出しを、AozoraEpub3 で EPUB 変換した実機確認結果に合わせて修正しました。字下げ注記の数字は全角（`１`〜`６`）で出力するようにしました（半角のままだと AozoraEpub3 側で「注記未変換」として扱われていました）。引用の入れ子や `:::indent-N` を組み合わせた場合は、現在位置からの相対値ではなく行端からの絶対字下げ量で出力するように改め、三重に入れ子にした引用は `１字下げ` → `２字下げ` → `３字下げ` と絶対値で出て、終了注記 `［＃ここで字下げ終わり］` は完全に字下げが終わるところに1回だけ出るようになりました（以前は入れ子の数だけ重複して出ていました）。`:::align-end`（地付き）は行末に注記を付ける方式から `［＃地付き］本文`（複数行はブロック指定）という前置き型へ変更しました。見出しレベルの扱いも LeME での実機確認結果に合わせ、h1 は大見出し、h2 / h3 は中見出し、h4〜h6 は小見出しに割り当て直しました（以前は h1/h2=大、h3/h4=中、h5/h6=小）。
- 青空文庫風テキスト書き出しの対応範囲を広げました（polish 1）。水平線は `＊　＊　＊`、画像は `［＃説明（ファイル名）入る］` という青空文庫風の注記に近似します（説明は alt を優先し、alt が空なら title、どちらも空なら「画像」。画像サイズの取得やファイルの読み込みはしません）。箇条書き / 番号付きリストは `・項目` / `N. 項目` の本文テキストへ（チェックリストは通常の項目として扱います）、引用は `［＃ここから1字下げ］` 〜 `［＃ここで字下げ終わり］` で本文を近似します（入れ子の引用も本文の順序は保たれます）。コードブロックや GFM 表風のテキストは、これまでどおり本文のみを保持します。この書き出しは公式青空文庫仕様への完全準拠を目指したものではなく、通常の Markdown 保存、LeME / でんでんコンバーター向け書き出しには影響しません。
- 引用（blockquote）の保存不具合を修正しました。二重・三重に入れ子にした引用が保存後に改行や `>` の階層を崩さず維持されるようになり、`obsidian-paragraph` モードで引用のすぐ下に `>` を付けずに書いた本文が、保存・再読込み時に誤って引用の中へ取り込まれる問題も解消しました。
- 二重・三重に入れ子にした引用ブロックの末尾に、編集できない余計な空白が表示される不具合を修正しました。縦書き・横書きどちらでも直しています（表示専用の CSS 修正で、保存される Markdown には影響しません）。
- でんでんコンバーター向け Markdown 書き出しで、斜体・太字斜体・打ち消し線・ハイライト・インラインコード・リンクが、実機の EPUB 表示に合わせて正しく変換されるようになりました。斜体は HTML `<i>`、太字斜体は `<i>**…**</i>`、打ち消し線は `<s>`、ハイライトは `<mark>`、インラインコードは backtick、リンクは Markdown link のまま書き出されます（以前の「斜体は本文のみ」「太字斜体は太字へ丸め」「リンクは本文のみ」という制限は撤回しました）。
- 右ペインの付箋カードで、タイトルと操作ボタンを別行に分け、狭いペインでもタイトル・本文 preview・操作が読みやすくなるよう表示を調整しました。
- 付箋の既存 `color` field を使い、右ペインカードの色バー・編集フォームの palette（黄・灰・青・緑・桃・紫）・本文 marker の色表示を追加しました。色情報は Markdown 本文へは書き込まれません。
- 付箋タグ（Slice 1）を追加しました。作品ごとに最大6件のタグ名を右ペイン上部で登録し、付箋編集から複数タグを付与できます。タグは分類用ラベルで、色や解決済み状態とは別です。データは `.nyoze/notes.json` に保存され、Markdown 本文には書き込まれません。
- 付箋タグの表示フィルタ（Slice 2）を追加しました。右ペインの **表示フィルタ** から登録済みタグで当該文書の付箋一覧を絞り込めます。**すべて** で解除できます。フィルタは表示のみで、保存データは変更しません。
- 付箋 polish 3 を追加しました。付箋マーカーをまたぐテキスト選択中の右クリックでは通常の編集メニューを優先します。付箋タグは登録済み一覧 + 追加/編集/削除 UI に整理され、使用中タグを削除しても付箋自体は残りタグだけが外れます（`.nyoze/notes.json` のみ更新）。
- 付箋 polish 4 を追加しました。長い付箋本文は **全文表示** 中も preview 領域に最大高さがあり、カード内で縦スクロールできます。各カードは折りたたんでタイトル・タグ・操作だけ残せます（折りたたみ状態は保存されません）。本文 marker の hover preview は付箋色を薄く反映しますが、短文 preview 用であり全文確認は右ペイン **Notes / 付箋** タブで行ってください。
- 縦書きで青空ルビ直後の対象約物（`、` `。` `」` `』` `）`）が行頭 / 次列頭へ落ちる問題を、表示専用の nowrap wrapper で緩和しました。保存される Markdown、コピー結果、clipboard には wrapper 情報や不可視文字は混入しません。
- ruby / strong / link / TCY などの inline 装飾を含む通常段落で、段落末の閉じ括弧が列末に来たときに直前 inline 境界まで巻き戻って分割される Chromium 問題を、縦書き WYSIWYG の `p::after` CSS 補正で回避しました。こちらも保存内容には影響しません。
- 上記の表示補正に合わせて、ルビ境界 IME、copy / save 非混入、段落末 caret / IME、縦書き scroll restore の E2E 回帰確認を追加・更新しました。
- WYSIWYG 通常編集向けに、表示専用の擬似キャレットを追加しました。Display Settings から ON/OFF、太さ、点滅 ON/OFF を調整できます。`Source Mode` と `Paragraph Plain` では従来どおり native caret を使います。
- 作品内の本文位置へ紐づく付箋MVPを追加しました。付箋は本文中の `<!-- nyoze-note:ID -->` アンカーと作品フォルダの `.nyoze/notes.json` で管理し、右ペインの Notes タブから確認・編集・解決済み管理・整理ができます。
- 付箋付きファイルの Nyoze 内 rename / move で `note.file` が追従するようにし、本文markerだけが残る場合、本文markerが見つからない場合、参照先ファイルがない場合の手動cleanup導線を追加しました。
- 作品内の登録済み本文 / 資料ファイルを Nyoze の File Explorer から rename / move したとき、物理ファイルだけでなく `.nyoze/books.json` **v3** の登録 path と `.nyoze/notes.json` の `note.file` をまとめて整合更新するようにしました（同一作品内の単一ファイルのみ）。books.json が壊れている / path が衝突する / 別作品へ移動しようとする場合などは安全側で中止し、metadata の保存に失敗したときは物理ファイルを元の場所へ戻します。編集中（未保存）のファイルは保存するまで移動 / 改名できません。フォルダの一括移動やドラッグ＆ドロップは今回の対象外です。
- File Explorer は作業対象の一覧表示と軽い単一ファイル操作用として位置づけます。Finder / Explorer を置き換える本格ファイルマネージャではないため、複雑なフォルダ整理、複数項目操作、Project 間の登録情報移管は OS 標準の Finder / Explorer 側で行う前提です。
- 右ペイン **作品** タブを追加しました。`.nyoze/books.json` を正本にした Books / Materials 一覧（`title` / `authors` / `translators`）、複数 role filter、資料 Markdown preview、右ペイン内の資料簡易編集（textarea + 明示保存 / キャンセル / 外部変更検知）、作品作成 / 作品切り替えに対応します。
- 作品作成時に作品名と最初の Book 名を確認し、`.nyoze/project.json` と `.nyoze/books.json` を初期作成するようにしました。書庫 root の作品一覧、作品タブの作品切り替え、File Explorer の **書庫に戻る** も追加しました。
- 作品フォルダ配下の未登録 `.md` / `.markdown` / `.txt` を検出し、作品タブまたは File Explorer から Book / Materials へ登録できるようにしました。Book / Materials の名称変更、**title / authors / translators** 編集、並び替え、登録解除、missing path 表示、折りたたみ表示にも対応します。
- 右ペイン **Document Metadata**（文書メタデータ）タブで frontmatter の `title` / `author` / `translator` 等を編集できます。作品内の表示 metadata は books.json v3 が正本で、Document Metadata の frontmatter 編集とは自動同期しません。パネル内の保存ボタンは通常の文書保存経路を使い、books.json は変更しません。
- 作品登録解除コマンドを追加しました。Markdown 本文は削除せず、未削除の付箋がある作品は解除を拒否します。
- 右ペイン **Outline** タブに `[現在の文書] [Book全体]` 切替を追加しました。Book全体では同一 Book の body 章を章順に並べ、章 / 見出しクリックによるナビゲーションと **前章** / **次章** ボタンに対応します。
- エディタ上部のツールバー（保存ボタン右隣）にも **前章** / **次章** の常設ボタンを追加しました。縦書き / 横書きのスクロール方向に合わせたアイコンで表示します。
- 章ナビゲーション（前後章・章タイトル・見出しクリック）は、**通常クリックで同じタブ内に章を切り替え**、**Shift+クリックで別タブ**に開く方式へ変更しました。細切れの章ファイルを、一つのファイルのように順に行き来できます。保存確認や Source Mode などの保護は従来どおり働きます。
- Book全体 Outline を単文書 Outline に近づけ、章タイトルを折りたたみ可能な見出し行として表示するようにしました。章ごと・見出しごとの折りたたみ（右ペイン表示のみ。保存はされません）と、現在開いている章・現在カーソル位置の見出しの強調表示に対応します。
- Book全体 Outline の章 root / 見出しに、本文冒頭プレビュー（吹き出しアイコンへの hover、または行の右クリック）を追加しました。章 root はその章ファイルの本文冒頭、見出しはその直後の本文冒頭を短く表示します。単文書 Outline のプレビューと同じ操作感で、表示専用・本文を変更しません。
- 中央エディタで、章頭に **「前章の末尾へ」「章の末尾へ」**、章末に **「章の先頭へ」「次章へ」** を表示できるようにしました。端へ到達したときに一時表示して自動的に消え、端付近へポインターを動かすと再表示します。隣接章へのボタンは通常クリックで同じタブ、Shift+クリックで別タブに開きます。
- Book 本文では、章頭 / 章末で **Option/Alt + wheel** を続けると、前章の末尾 / 次章の先頭へ同じタブで移動できます。通常スクロール、IME 変換中、`Source Mode` / `Paragraph Plain`、資料、作品外では発動せず、1回の操作で複数章へ飛ばないよう制限しています。
- File Explorer の本文 / 資料 role icon は books.json v3 を正本にし、frontmatter `role` への依存を削除しました。
- 作品内の文書冒頭表示は、Book title を本文 H1 より大きく、file title を本文 H1 相当にして階層を明確にしました。
- 未編集のタブを切り替えただけで未保存表示になる問題を修正しました。
- 作品の資料 preview / 簡易編集を切り替えたときに右ペイン下部の高さが縮む問題を修正し、中央で開いている資料は右ペイン内編集できないようにしました。
- 左右ペインの icon / icon button を UI 文字サイズ倍率へ追従させました。Theme Studio の複合設定行は、狭幅時にラベルと操作部を別行へ分けます。
- 対応 frontmatter key、作品内外の source of truth、Document Metadata の編集範囲と YAML 制限を [`docs/frontmatter-reference.md`](docs/frontmatter-reference.md) に整理しました。
- Notes preview と作品の資料 preview は、単一改行を `<br>` として表示するよう揃えました。
- Nyoze 独自のブロック装飾記法を追加しました。`:::align-center` / `:::align-end`（中央寄せ / 行末寄せ）、`:::indent-1`〜`:::indent-6`（段階的な字下げ）、`:::style-<id>`（手紙風 letter / 控えめ muted / 章題風 heading などの semantic style）を `:::` で囲んだブロックとして書くと、通常表示で装飾され、保存時も同じ記法のまま残ります。`style-<id>` は意味を表す id で、組み込み以外の未知 style も消えずに保持されます。文字色やフォントの直接値は本文 Markdown に書き込みません。ツールバーの **ブロック装飾** メニューから、中央寄せ / 行末寄せ、字下げ 1〜6、組み込み style（手紙・控えめ・見出し）を現在ブロックまたは選択範囲へ適用・置換・解除できます。未知 style の手入力、ユーザー定義 style、Project 別 style 定義、右クリックからの適用は未対応です。
- **外部ツール向けの書き出し方針**：Nyoze は当面、EPUB / PDF を本体だけで直接生成せず、日本語原稿を書き、縦書き・ルビ・縦中横・配置を確認したうえで、外部の EPUB 制作ツールやブラウザへ渡しやすい形式で書き出すことを優先します。現在は **青空文庫風 `.txt`** / **LeME 互換 Markdown（`.md` + HTML）** / **でんでんコンバーター向け Markdown（`.md`）** / **standalone HTML（`.html`）** を、**アクティブ文書 1 件**または **Book 全体**（body 章を章順に結合）で書き出せます。いずれも通常の Markdown 保存とは別経路で、書き出し結果には近似・省略が含まれる場合があります。LeME / でんでんは外部ツールであり、完全互換を保証するものではありません（「互換」「向け」「渡しやすい」形式という位置づけです）。各ツールの設定ファイル export、自動 TCY の出力反映、変換 warning の詳細一覧 UIは未対応です。書き出しオプション確認 UI の選択内容は scope × format 別に `settings.json` へ保存されます。
- **Book 全体の書き出し**（File > 書き出し）を追加しました。現在開いているファイルが属する Book の body 章を、ディスク上の保存済み Markdown から章順に結合して LeME / でんでん / 青空文庫風 / HTML の 4 形式へ書き出せます。メニュー項目は body 章を開いているときだけ有効になります。未保存の編集は含まれず、実行前に案内しますがブロックしません。`Source Mode` / `Paragraph Plain` 中でも実行できます。保存ダイアログの前に改ページ・作品情報・章ファイル情報・HTML 目次関連の option を確認できます（既定のままなら従来どおりの挙動です）。1 章でも読み取れない場合は部分 export しません。`.nyoze/books.json` / `notes.json` / frontmatter / 各 chapter ファイルは変更しません。
- **File > 書き出し > 青空文庫風テキストを書き出し...** を追加しました。現在アクティブな文書を、エディタ上の内容から青空文庫に近い UTF-8 `.txt` へ書き出せます。通常の Markdown 保存とは別経路で、未保存のままでも書き出せますが、元ファイルや frontmatter / 作品 metadata は変更しません。ルビ・縦中横・太字 / 斜体・見出し・中央揃え / 地付き・字下げにはおおむね対応しますが、青空文庫の完全準拠ではなく「青空文庫風」です。`style-*` やリスト / 表 / コード / 画像 / HTML などは構造を保持しません。`Source Mode` / `Paragraph Plain` 中は通常表示に戻してから実行してください。Book 全体の一括書き出しは別メニュー項目です（上記参照）。
- **File > 書き出し > LeME 互換 Markdown を書き出し...** を追加しました。現在アクティブな文書を、LeME に渡しやすい UTF-8 `.md`（既定名 `*-leme.md`）として書き出せます。実機確認の結果、LeME の `.md` 入力は基本 Markdown（見出し・太字・斜体・太字斜体）に加えて HTML `<ruby>` によるルビや `style` 属性付き `<div>` / 見出しタグによる配置が広く機能することが分かったため、**`.md` + HTML 併用**を標準にしています（一時 `.txt` / LeME Text(Nor) 向け出力を検討・実装しましたが、この実機確認結果により置き換えました）。明示縦中横は `^13^` の形式へ、ルビは HTML `<ruby>` へ、太字 / 斜体 / 太字斜体は Markdown のまま出力します。中央寄せ / 右寄せの配置は `style="text-align:..."` 付きの `<div markdown="1">` へ、配置ブロック内の見出しは `<h1 style="text-align:...">` のような HTML heading タグへ変換し、見出し構造と配置の両方を保ちます。字下げは `padding-top:Nem` の inline style（縦書き前提。横書き向け `padding-left` への切り替えは未対応）。通常の Markdown 保存とは別経路で、元ファイルや frontmatter / 作品 metadata は変更しません。`Source Mode` / `Paragraph Plain` 中は通常表示に戻してから実行してください。自動 TCY の出力反映と LeME 固有の詳細 option は未対応です。共通の書き出しオプション確認 UI では、改ページ・文書情報・役割ラベルなどを選べます。Book 全体の一括書き出しは別メニュー項目です（上記参照）。追加の実機確認結果に合わせて対応範囲を広げ、打ち消し線 `~~取消~~`、インラインコード（本文中の backtick と衝突しないよう fence を自動調整）、ハイライト `<mark>...</mark>`、水平線 `---`、引用 `>`（引用内の太字 / ルビなども変換）、番号なし / 番号付きリスト、fenced code block（言語表記維持）にも対応しました。改行（Shift+Enter）は単改行が省略されないよう `<br />` へ明示変換します。**タスクリストは LeME 変換エラー回避のため、`[ ]` / `[x]` を出さず通常の番号なしリストへ変換されます。** リンクは LeME 実機で表示できなかったため引き続き本文のみになります。表は今回はまだ LeME 書き出しで構造保持しません。また、配置（中央寄せ / 右寄せ）・字下げの HTML wrapper では、開始タグ直後に空行を入れるよう調整しました。開始タグ直後に本文を続けると、wrapper 内の最初の段落だけ Markdown 装飾（太字など）が LeME 側で解釈されないことを実機で確認したためです。さらに、`| A | B |` のような GFM table 風のテキストを改行区切りで書いている場合、LeME 側で表として解釈されやすいよう改行をそのまま保つよう修正しました（Nyoze 側に表の編集・表示機能が追加されたわけではありません）。加えて、ハイライトと太字 / 斜体 / 打ち消し線を組み合わせたときに装飾の閉じ順序が崩れる不具合を修正し、`*<mark>本文</mark>*` のように正しく入れ子になるようにしました。画像は LeME 実機でローカル画像を表示できることが確認できたため、`![alt](src)` の Markdown image syntax として保持するよう修正しました（title 付きも対応）。画像ファイルのコピーや、書き出し先に合わせた path の付け替えは行わず、保存されている src の文字列をそのまま使います。書き出し先ファイルと画像ファイルの相対位置はご自身で管理してください。Nyoze 編集画面の内部表示専用 URL（`nyoze-img://`）が書き出し結果に含まれることはありません。また、中央寄せ / 右寄せブロックの中に GFM table 風のテキストがある場合、`markdown="1"` の配置 wrapper の内側に表を入れると LeME 側で EPUB 変換エラーになることを確認したため、その部分だけ配置よりも表としての表示を優先し、配置 wrapper を外して物理改行のまま書き出すよう修正しました。この場合、表部分の中央寄せ / 右寄せは失われますが、同じブロック内の見出しや通常の段落の配置には影響しません。
- **File > 書き出し > でんでんコンバーター向け Markdown を書き出し...** を追加しました。現在アクティブな文書を、でんでんコンバーターへ渡しやすい UTF-8 `.md`（既定名 `*-denden.md`）として書き出せます。実機での EPUB 化結果に合わせ、段落は空行区切りで書き出し、Nyoze の空段落（意図的な空行）は、でんでん側で連続空行が畳まれて見た目の空きが消えないよう `<p><br /></p>` へ変換します。ルビは `{親文字|ルビ}` 形式へ、明示縦中横は `^文字^` へ変換します。ルビの親文字またはルビに `{` / `}` / `|` が含まれる場合は、記法が壊れないよう青空文庫風ルビ（`｜親文字《ルビ》`）へ自動的に切り替えます。太字は `**…**` として出力しますが、**斜体**はでんでんの縦書きでは斜体ではなく圏点 / 傍点として表示され Nyoze の意味と異なるため、v1 では本文テキストのみを書き出します。**太字 + 斜体**は太字へ丸めます（`***…***` は出力しません）。中央寄せ / 行末寄せは `text-center` / `text-right` の helper div による近似で、見出しを含めても helper div の中に Markdown 見出しとして残り、でんでん実機で中央寄せ / 行末寄せの見出しとして機能します。`style-*` は中身のテキストのみです。見出し・太字は Markdown として出力します。通常の Markdown 保存とは別経路で、元ファイルや frontmatter / 作品 metadata は変更しません。`Source Mode` / `Paragraph Plain` 中は通常表示に戻してから実行してください。でんでん設定ファイル export、ユーザー CSS / custom class による字下げ再現、自動 TCY の出力反映は未対応です。Book 全体の一括書き出しは別メニュー項目です（上記参照）。対応範囲を追加で広げ、字下げ block（`:::indent-1`〜`:::indent-6`）は「中身のみ」から、LeME 互換 Markdown export と同じ `padding-top:Nem` の `<div markdown="1">` wrapper（縦書き前提。横書き向け `padding-left` への切り替えは未対応。開始タグ直後に空行を入れる調整も同じ）へ変更しました。画像は保存されている `src` をそのまま `![alt](src)` の Markdown image syntax として保持するようにしました（画像ファイルのコピーや path の付け替えはせず、`nyoze-img://` の内部表示用 URL も含めません）。水平線 `---`、引用 `>`（引用内の太字などの inline 変換も維持）、fenced code block（言語表記維持、backtick 衝突回避）、番号なし / 番号付きリストにも対応しました。**タスクリストは `[ ]` / `[x]` を出さず通常の番号なしリストへ変換されます。** `| A | B |` のような GFM table 風のテキストは、でんでんの改行がもともと `<br>` 変換なしの物理改行のままのため、追加の変換なしでそのまま書き出されます（Nyoze の編集・表示画面に表機能が追加されたわけではありません）。

## 0.2.1-beta.1

Nyoze 0.2.1-beta.1 は、`0.2.0-beta.1` 公開後の追加安定化と執筆補助 polish をまとめた beta 更新です。主に Typewriter / Visual Focus の本実装、Paragraph Plain の回帰修正、日本語 IME 境界入力の改善、Help / 配布文書の整理を含みます。

### 今回の更新

- Typewriter Mode を本実装し、Typewriter scroll、scroll past end、Visual Focus、current line highlight、toolbar quick toggle を追加しました。
- current line overlay を縦書き中心に安定化し、空行補正、fallback anchoring、frontmatter 表示直後の再 anchor 漏れを改善しました。
- `Paragraph Plain` の click 遅延を追加最適化し、pane 開閉時の overlay 再配置、空段落境界ナビゲーション、境界 E2E の flaky を修正しました。
- ルビ / 明示 TCY 直後の日本語 IME 入力を boundary sentinel bridge で改善し、論理行頭 ruby 前入力や後方 composition の崩れを抑制しました。
- Help メニューに `MANUAL を開く` と `ショートカットキー一覧` を追加し、現在の UI 言語に応じた read-only internal shortcut doc を開けるようにしました。
- Windows の一部 AMD GPU + Chromium 系環境で I-beam カーソルが白く見える問題に対し、`エディタで矢印ポインターを使う` 回避設定を追加しました。
- README / INSTALL / Release Notes / 配布手順を更新し、Store と GitHub zip の更新方針、Smart App Control の注意、Store 版の更新導線、共存可否を整理しました。

### Windows 配布と Store 状況

- GitHub Releases の Windows 配布物は引き続き zip 版です。
- Microsoft Store 版は通常利用の推奨導線ですが、審査を伴うため、小さな beta 修正を毎回すぐ反映するとは限りません。
- GitHub zip は Store を使えない環境向けの代替配布であると同時に、Store 版より細かい beta 修正を先に含むことがあります。
- Windows 実機では、Store 版と GitHub zip 版の共存および起動を確認しています。ただし設定は共有されるため、通常利用ではどちらか一方へ寄せることを推奨します。
- 現行 `0.2.0` 系では single-instance により両方の同時起動は抑止されます。旧版どうしでは同時起動できる場合がありますが、同じ設定を共有するため推奨しません。
- Smart App Control により、zip 展開後の `Nyoze.exe` も実行を拒否される場合があります。Windows で確実に使いたい場合は Microsoft Store 版を優先してください。

## 0.2.0-beta.1

Nyoze 0.2.0-beta.1 は、縦書き日本語執筆を主目的とした Markdown デスクトップエディタの beta 更新版です。公開時点ではこの版を GitHub Releases の latest とし、Windows では GitHub zip 配布を継続しつつ Microsoft Store 版も公開済みでした。

### 今回の更新

- Electron を `41.3.0` へ更新し、縦書き、scroll restore、shortcut 周辺の既存 E2E / package 確認を合わせて行いました。
- Paragraph Plain で `# 見出し`、`- list`、`1. list`、`> quote`、fenced code、`---` などを単一 block として入力した場合、明示解除・境界矢印移動・Enter 分割時に通常表示側へ反映されるよう改善しました。
- special inline boundary を `aozoraRuby` / `aozoraTcy` 共通へ整理し、WORD JOINER sentinel、delayed composition suppression、診断ログ改善で日本語 IME 境界入力を安定化しました。
- Windows の native titlebar overlay controls と header toolbar / Document Type badge が重ならないよう調整しました。
- 拡大表示や狭幅で header toolbar の一部が隠れる場合、toolbar 上の wheel / trackpad 操作で隠れたボタンへ移動できるようにしました。
- Windows の native select では選択中 option に check prefix を表示し、テーマ選択メニューではテーマ名の右側に 2 色 swatch を表示するようにしました。
- App icon を円形シンプルアイコンへ差し替え、開発起動時の icon も更新しました。
- Microsoft Store / MSIX 配布準備として、`package:win:store`、Store 専用 AppX config、privacy policy、Partner Center 入力方針を追加しました。

### Windows 配布と Store 状況

- GitHub Releases の Windows 配布物は引き続き `Nyoze-Windows-0.2.0-beta.1-x64.zip` です。
- Microsoft Store 向けには `npm run package:win:store` を追加し、Store 用 identity / publisher / AppX version の分離管理を入れています。
- Microsoft Store 版は 2026-05-06 時点で公開済みで、Store 上の初回 package version は `1.2.0.0` です。
- Store 版は審査を伴うため、緊急度の低い小修正を毎回すぐ反映するとは限りません。ある程度まとまった単位で更新することがあります。
- GitHub zip は、Store を使えない環境向けの代替配布として残すだけでなく、Store 版より細かい beta 修正を先に含むことがあります。
- Store 版は Microsoft Store アプリのライブラリ画面から更新できます。
- Store 版と GitHub zip 版は、Windows 実機で共存と起動を確認しています。ただし設定は共有されるため、通常利用ではどちらか一方へ寄せることを推奨します。
- 現行 `0.2.0` 系では多重起動を抑止しているため、両方を同時には起動できません。旧版どうしでは同時起動できる場合がありますが、同じ設定を共有するため推奨しません。

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

ルビや明示 TCY（縦中横）の直後で日本語 IME 入力を始めたとき、環境やタイミングによっては、まれに 1 タイプ目の直後に 2 タイプ目で入力が詰まることがあります。その場合は `Escape` を押すと未確定入力を破棄して通常の編集状態へ復帰できます。

縦書きのルビ直後約物や、inline 装飾を含む通常段落の末尾閉じ括弧については、表示専用補正を入れています。保存される Markdown には影響しません。見出し / list / blockquote など通常段落以外の複雑なケースは、今後の追加確認対象です。

`Paragraph Plain` は通常表示と近い折り返しを目指していますが、ウィンドウ幅やペイン幅の微妙な境界では、まれに overlay textarea 側だけ 1 文字ぶん多く、または少なく折り返されて見えることがあります。保存内容や block 構造には影響しません。

## まだ対応していない導線

- OS からの drag and drop 読み込み
- Open With からの起動引き渡し
- `.md` の OS 全体関連付け
- frontmatter の一般編集 UI
- 高度な競合解決 / merge UI
- autosave / crash recovery journal
- Linux 向け公式パッケージ

ただし、drag and drop / Open With / OS 関連付けは当面の高優先度ではありません。次の Project / Book 管理では、Obsidian の Vault に近い **書庫（workspace）** を通常の入口として整える方針です。書庫対応が進むと、OS 全体の関連付けや drag and drop の必要性は相対的に下がります。

## post-beta へ送った主項目

- Markdown 未対応構文を、そのまま保持する仕組み
- Source Mode の raw save 専用導線
- mixed EOL / BOM / 複数 encoding の完全な保存往復
- content hash ベースの外部編集競合検知と diff / merge UI
- autosave / recovery journal
- 長大文書向けの仮想化 / 表示範囲に応じた描画最適化
- frontmatter の一般編集 UI
- drag and drop / Open With / OS 関連付け（書庫対応後の低優先度候補）

## テスター向けの確認事項

最低限、次の条件を理解した上で試してください。

- 正式な読み込み導線はアプリ内の **ファイルを開く** と、activeな書庫内の File Explorer です
- beta では「原稿を壊さず保存往復できること」を優先しており、Markdown 表記の完全保持までは保証しません
- 重要な原稿では、Nyoze beta で初めて開く前に別途バックアップを取ってください
- `Source Mode` でも raw のまま保存されるとは限りません
- 非 UTF-8 原稿や mixed EOL を含む原稿は、beta では検証用に留めるのが安全です

## フィードバック

不具合報告やフィードバックは、アプリ内の `Bug Report` / `Feedback` から送れます。
Google フォームの質問に沿って、使用環境や再現手順、原稿への影響などを記入してください。
