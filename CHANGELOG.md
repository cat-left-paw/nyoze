# Changelog

公開版として配布した変更履歴を、この文書に積み上げていきます。  
現行 beta の既知制限や注意事項は [RELEASE_NOTES.md](./RELEASE_NOTES.md)、導入手順は [INSTALL.md](./INSTALL.md) を参照してください。

## 0.1.0-beta.2

- `Paragraph Plain` で文書先頭 / 末尾段落を編集中、外側方向の境界矢印のあとに `Enter` を押すと、段落分割されず textarea 内で改行されたり、解除時に変更が反映されないことがある不具合を修正
- `Paragraph Plain` で文書末尾段落を `Enter` で分割した直後、新しい段落へ移る際にスクロールが追従せず、overlay とキャレットが画面外へ出ることがある不具合を修正
- beta 配布向け文書を整理し、README / リリースノート / 導入案内を見直し

## 0.1.0-beta.1

- 初回 beta 版を公開
- 縦書き / 横書きの WYSIWYG 編集、Paragraph Plain、Source Mode、Document Settings、File Explorer などの主要導線を公開
- beta テスター向けに既知制限、配布物、報告導線を整理
