# Install

公式配布物の導入と初回起動の案内です。  
現行 beta の既知制限や注意事項は [RELEASE_NOTES.md](./RELEASE_NOTES.md)、更新履歴は [CHANGELOG.md](./CHANGELOG.md) を参照してください。

## 公式配布物

- macOS (Apple Silicon): `Nyoze-Mac-<version>-arm64-Installer.dmg`
- macOS (Intel): `Nyoze-Mac-<version>-x64-Installer.dmg`
- Windows: `Nyoze-Windows-<version>-x64.zip`

Apple Silicon Mac では `arm64`、Intel Mac では `x64` を使ってください。
Windows 版は 64bit (`x64`) 環境向けです。32bit Windows は現行 beta の対象外です。

## macOS

1. GitHub Releases から、自分の環境に合った DMG をダウンロードします。
2. DMG を開き、`Nyoze.app` を `Applications` へドラッグします。
3. `Applications` から `Nyoze.app` を起動します。

現行 beta の macOS 配布物は、Developer ID 署名と Apple notarization（公証）に未対応です。初回起動時に、通常の「未確認の開発元」より強い Gatekeeper 警告が出ることがあります。

### 初回起動時に開けない場合

beta 配布物は未署名かつ未公証のため、macOS の Gatekeeper 警告が出ることがあります。まずは次の方法を試してください。

方法 1:

1. `Nyoze.app` を一度開こうとして、警告を出します。
2. `システム設定` → `プライバシーとセキュリティ` を開きます。
3. 画面下部の `このまま開く` を選びます。
4. 確認ダイアログでもう一度 `開く` を選びます。

方法 2:

1. `Applications` フォルダで `Nyoze.app` を右クリックします。
2. `開く` を選びます。
3. 確認ダイアログでもう一度 `開く` を選びます。

macOS のバージョンや警告の種類によっては、従来の `右クリック → 開く` が効かないことがあります。その場合は、上の「方法 1」の `このまま開く` を優先してください。

### 「ゴミ箱に入れる必要があります」「このアプリはコンピュータに損害を与える可能性があります」「マルウェアが含まれていないことを検証できませんでした」など、より強い警告が出る場合

通常の未署名アプリ警告より強い拒否です。macOS のバージョンや判定内容によっては、アプリがゴミ箱へ移される扱いになります。

現状の beta 配布物は未公証のため、GitHub Releases から取得した正規の DMG でもこの系統の警告になることがあります。まずは慌てて `ゴミ箱に入れる` を押さず、`完了` で閉じてから `システム設定` → `プライバシーとセキュリティ` の `このまま開く` を確認してください。

実際に `「マルウェアが含まれていないことを検証できませんでした」` と表示されても、いったん `完了` で閉じたあとに `このまま開く` を選ぶことで起動できる場合があります。

- まずは、GitHub Releases からダウンロードしたファイルが壊れていないか確認してください
- 強い警告が出た場合でも、まず `完了` で閉じて `このまま開く` が出るかを確認してください
- 一度起動を拒否されたあと、`システム設定` → `プライバシーとセキュリティ` に `このまま開く` が出ていれば、それを優先してください
- いったん DMG と `Nyoze.app` を削除し、GitHub Releases から再ダウンロードしてやり直してください
- 再ダウンロード後も `このまま開く` が出ない、または同じ警告が続く場合は、その build は使わず、配布元へ報告してください

### 補足: 上級者向けの回避方法

上の方法でも起動できない場合、Terminal で quarantine 属性を外す方法が使われることがあります。ただしこれは Apple の通常手順ではなく、誤った対象へ実行すると危険です。信頼できる配布物だと自分で判断できる場合だけ、自己責任で行ってください。

```bash
xattr -dr com.apple.quarantine "/Applications/Nyoze.app"
```

この操作の前に、必ず GitHub Releases から取得した正規の配布物であることを確認してください。

## Windows

`0.1.1-beta.1` の Windows 配布物は installer ではなく zip です。

`0.1.0-beta.1` / `0.1.0-beta.2` では installer を配布していましたが、`0.1.1-beta.1` では一部の Windows 環境で Smart App Control により installer や単一 exe がブロックされたため、zip 形式へ切り替えています。

Windows 版は `x64` 専用です。32bit Windows では起動できません。

1. GitHub Releases から `Nyoze-Windows-<version>-x64.zip` をダウンロードします。
2. zip を任意のフォルダへ展開します。
3. 展開したフォルダ内の `README.txt` を必要に応じて確認します。
4. 展開したフォルダ内の `Nyoze.exe` を起動します。
5. 必要ならショートカットを自分で作成してください。

### 旧 installer 版を使っている人へ

- `0.1.0-beta.1` / `0.1.0-beta.2` を installer で入れている場合でも、`0.1.1-beta.1` は自動で上書き更新されません。
- `0.1.1-beta.1` を使うには、新しく zip 版をダウンロードして展開し、その中の `README.txt` と `Nyoze.exe` を使ってください。
- 旧 installer 版を残したまま zip 版を試しても構いませんが、混乱を避けるため同時起動はしないでください。
- 旧 installer 版が不要になった場合は、Windows のアプリ設定からアンインストールしてください。

### Smart App Control について

今回確認できた範囲では、zip を展開した中の `Nyoze.exe` は起動できましたが、installer や単一 exe 形式は Smart App Control によってブロックされることがありました。

- `0.1.1-beta.1` の Windows 版は zip 展開後の `Nyoze.exe` を使ってください。
- 以前の installer 版を使っている環境でも、`0.1.1-beta.1` へ更新するときは zip 版へ切り替えてください。

## アンインストール

### macOS

- `Applications` から `Nyoze.app` を削除します。
- ただし、設定ファイルやバックアップは自動では消えません。
- 完全に削除したい場合は、後述の「ユーザーデータ保存先」にある `Nyoze` フォルダも手動で削除してください。

### Windows

- zip 版はインストール型ではないため、展開したフォルダを削除すればアプリ本体は取り除けます。
- `0.1.0-beta.1` / `0.1.0-beta.2` の旧 installer 版を使っていた場合は、Windows の「設定 > アプリ」からアンインストールしてください。
- ただし、設定ファイルやバックアップは自動では消えません。
- 完全に削除したい場合は、後述の「ユーザーデータ保存先」にある `Nyoze` フォルダも手動で削除してください。

## ユーザーデータ保存先

Nyoze の設定、バックアップ、ワークスペース状態は、アプリ本体とは別にユーザーデータフォルダへ保存されます。zip 版でも DMG 版でも、この保存先は同じです。

代表的な保存内容:

- `settings.json`
  - 表示設定、テーマ、UI 言語、登録フォントなど
- `backups/`
  - 保存前バックアップ
- `workspace-state.json`
  - 最近のワークスペース状態

場所:

- macOS:
  - `~/Library/Application Support/Nyoze/`
- Windows:
  - `%APPDATA%\Nyoze\`

開き方の例:

- macOS:
  - Finder で `移動 > フォルダへ移動...` を開き、`~/Library/Application Support/Nyoze/` を入力します。
- Windows:
  - エクスプローラーのアドレス欄に `%APPDATA%\Nyoze\` と入力します。

注意:

- アプリ本体を削除しても、このフォルダは自動では消えません。
- 設定やバックアップを引き継ぎたい場合は残してください。
- 完全削除したい場合だけ、内容を確認した上で手動削除してください。

## 原稿を開く前に

- beta 版では、重要な原稿を初めて開く前に別途バックアップを取ってください。
- 実用上対応している文字コードは UTF-8 のみです。Shift-JIS / CP932 の `.txt` は先に UTF-8 へ変換してください。
- 正式な読み込み導線はアプリ内の `Load` です。

## ソースコードから試す場合

ソースコードから起動・build・package したい場合は [README.md](./README.md) を参照してください。
