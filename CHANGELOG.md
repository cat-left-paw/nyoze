# Changelog

公開版として配布した変更履歴を、この文書に積み上げていきます。  
現行 beta の既知制限や注意事項は [RELEASE_NOTES.md](./RELEASE_NOTES.md)、導入手順は [INSTALL.md](./INSTALL.md) を参照してください。

2026-05-06 時点では、GitHub Releases の latest は `0.2.0-beta.1` です。Windows 版は Microsoft Store でも公開済みで、Store 上の初回 package version は `1.2.0.0` です。

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
