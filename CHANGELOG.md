# Changelog

公開版として配布した変更履歴を、この文書に積み上げていきます。  
現行 beta の既知制限や注意事項は [RELEASE_NOTES.md](./RELEASE_NOTES.md)、導入手順は [INSTALL.md](./INSTALL.md) を参照してください。

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
