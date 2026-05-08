---
documentType: article
---

# Nyoze ショートカットキー一覧

この一覧では、macOS では `Cmd`、Windows / Linux では `Ctrl` を使います。  
`Alt/Option` は、Windows / Linux では `Alt`、macOS では `Option` です。

---

## 通常編集

### 基本操作

文書タイプ によって、`Enter` と `Shift + Enter` の扱いが変わります。

> 文書タイプは、右ペインの文書設定から設定できます。  
> または直接フロントマターを編集することでも設定できます。フロントマターの編集はソースモードを使用します。

#### Article モード（記事・ドキュメント向け）

- `Enter` — 段落を分ける。表示上は段落間に行間が開きます
- `Shift + Enter` — 段落内で改行します

Article モードは、一般的な Markdown 文書に近い改行動作です。

#### Novel モード（文芸・小説向け）

- `Enter` — 改行します。内部的には段落分割ですが、表示上は行間を開けず、詰まった本文として表示します
- `Shift + Enter` — 通常本文（paragraph / heading）では無効です

Novel モードは、小説本文のように、1行ごとに自然に改行して書くための動作です。

#### 共通の基本操作

- `Backspace` — 前の文字を削除、またはブロックをマージ
- 矢印キー — カーソル移動

リスト・引用などの構造ブロック内では、`Shift + Enter` が hardBreak として扱われる場合があります。

ルビや明示 TCY（縦中横）の直後で日本語 IME 入力がまれに進まなくなった場合は、`Escape` を押すと未確定入力を破棄して通常の編集状態へ復帰できます。

### 装飾・編集

- `Cmd/Ctrl + B` — 太字
- `Cmd/Ctrl + I` — 斜体
- `Cmd/Ctrl + Shift + X` — 取り消し線
- `Cmd/Ctrl + K` — リンク設定
- `Cmd/Ctrl + Alt/Option + R` — ルビ / 傍点ダイアログを開く
- `Cmd/Ctrl + Shift + C` — 書式クリア
- `Cmd/Ctrl + Z` — Undo
- `Cmd/Ctrl + Shift + Z` — Redo

### 見出し

- `Cmd/Ctrl + Alt + 1` — 見出し 1 に切り替え
- `Cmd/Ctrl + Alt + 2` — 見出し 2 に切り替え
- `Cmd/Ctrl + Alt + 3` — 見出し 3 に切り替え
- `Cmd/Ctrl + Alt + 0` — 段落に戻す

### モード切替

- `Cmd/Ctrl + Alt/Option + P` — Paragraph Plain モードを切り替える

Source Mode 中は、このショートカットでは Paragraph Plain モードに切り替わりません。

### アウトライン・折りたたみ

- `Cmd/Ctrl + Shift + ,` — 見出しへ移動
- `Cmd/Ctrl + Shift + .` — 見出しへ移動
- `Cmd/Ctrl + Shift + L` — 現在の見出しを折りたたみ / 展開

縦書きでは、`,` / `.` の視覚的な向きに合わせて、前後の意味が横書きと入れ替わります。

- 横書き: `,` が前の見出し、`.` が次の見出し
- 縦書き: `,` が次の見出し、`.` が前の見出し

### ペイン開閉

- `Cmd/Ctrl + Alt/Option + ,` — 左ペイン（File Explorer）を開閉
- `Cmd/Ctrl + Alt/Option + .` — 右ペイン（Outline / Document など）を開閉

この操作は編集コマンドではないため、Paragraph Plain / Source Mode 中でも使えます。

### リスト操作

- `Tab` — リスト項目を1段深くする
- `Shift + Tab` — リスト項目を1段浅くする

リスト項目の移動は、書字方向によってキーが変わります。

横書き:

- `Cmd/Ctrl + ArrowUp` — リスト項目を上へ移動
- `Cmd/Ctrl + ArrowDown` — リスト項目を下へ移動

縦書き:

- `Cmd/Ctrl + ArrowRight` — リスト項目を上（文書先頭方向）へ移動
- `Cmd/Ctrl + ArrowLeft` — リスト項目を下（文書末尾方向）へ移動

リスト外、IME変換中、Paragraph Plain / Source Mode 中は無効です。

### カーソル移動

- `Home` — 1回目: 表示行頭へ移動。2回目: 論理行頭（ブロック先頭）へ移動
- `End` — 1回目: 表示行末へ移動。2回目: 論理行末（ブロック末尾）へ移動
- `PageUp` — 1ページ前へ移動し、キャレットも表示範囲へ追従
- `PageDown` — 1ページ先へ移動し、キャレットも表示範囲へ追従

`Shift + Home` などの修飾キー付き操作は、ブラウザ標準の挙動になります。  
IME変換中は標準挙動に委ねます。

### 検索・置換

- `Cmd/Ctrl + F` — 検索バーを開く
- `Cmd/Ctrl + H` — 検索・置換バーを開く

検索バー内では、以下のキーも使えます。

- `Enter` — 次の一致へ移動
- `Shift + Enter` — 前の一致へ移動
- `Escape` — 検索バーを閉じる

検索入力欄 / 置換入力欄では、IME文字確定の `Enter` は検索・置換を実行しません。

---

## Paragraph Plain モード

Paragraph Plain モードでは、フォーカス中のブロックだけを Markdown ソースとして編集します。

### モードの終了

- `Cmd/Ctrl + Alt/Option + P` — 編集内容を確定して終了
- `Escape` — 編集内容を確定して終了

### paragraph / heading ブロック

- `Enter` — カーソル位置でブロックを分割
- `Backspace` — カーソルが先頭にあるとき、直前の textblock とマージ
- `Shift + Enter` — 無効
- `Cmd/Ctrl + Enter` — 無効

ブロック間移動は、書字方向によってキーが変わります。

縦書き:

- `ArrowLeft` — カーソルが末尾にあるとき、次のブロックへ移動
- `ArrowRight` — カーソルが先頭にあるとき、前のブロックへ移動

横書き:

- `ArrowDown` — カーソルが末尾にあるとき、次のブロックへ移動
- `ArrowUp` — カーソルが先頭にあるとき、前のブロックへ移動

### codeBlock / html_block_atom ブロック

- `Enter` — textarea の標準動作
- `Shift + Enter` — textarea の標準動作
- `Backspace` — textarea の標準動作
- 矢印キー — textarea の標準動作
- `Cmd/Ctrl + Alt/Option + P` — 編集内容を確定して終了
- `Escape` — 編集内容を確定して終了

---

## Source Mode

Source Mode では、文書全体を Markdown ソースとして編集します。

- `Cmd/Ctrl + F` — 検索
- `Cmd/Ctrl + H` — 検索・置換
- `Cmd/Ctrl + Alt/Option + ,` — 左ペインを開閉
- `Cmd/Ctrl + Alt/Option + .` — 右ペインを開閉

通常編集専用の装飾ショートカットやリスト移動ショートカットは、Source Mode 中は通常編集側のコマンドとしては動作しません。
