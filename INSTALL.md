# Install

公式配布物の導入と初回起動の案内です。  
現行 beta の既知制限や注意事項は [RELEASE_NOTES.md](./RELEASE_NOTES.md)、更新履歴は [CHANGELOG.md](./CHANGELOG.md) を参照してください。

## 公式配布物

- macOS (Apple Silicon): `Nyoze-Mac-<version>-arm64-Installer.dmg`
- macOS (Intel): `Nyoze-Mac-<version>-x64-Installer.dmg`
- Windows: `Nyoze-Windows-<version>-Setup.exe`

Apple Silicon Mac では `arm64`、Intel Mac では `x64` を使ってください。

## macOS

1. GitHub Releases から、自分の環境に合った DMG をダウンロードします。
2. DMG を開き、`Nyoze.app` を `Applications` へドラッグします。
3. `Applications` から `Nyoze.app` を起動します。

### 初回起動時に開けない場合

beta 配布物は未署名のため、macOS の Gatekeeper 警告が出ることがあります。まずは次の方法を試してください。

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

### 「ゴミ箱に入れる必要があります」「このアプリはコンピュータに損害を与える可能性があります」など、より強い警告が出る場合

通常の未署名アプリ警告より強い拒否です。macOS のバージョンや判定内容によっては、アプリがゴミ箱へ移されることもあります。

- まずは、GitHub Releases からダウンロードしたファイルが壊れていないか確認してください
- いったん DMG と `Nyoze.app` を削除し、GitHub Releases から再ダウンロードしてやり直してください
- 再ダウンロード後も同じ警告が続く場合は、その build は使わず、配布元へ報告してください

### 補足: 上級者向けの回避方法

上の方法でも起動できない場合、Terminal で quarantine 属性を外す方法が使われることがあります。ただしこれは Apple の通常手順ではなく、誤った対象へ実行すると危険です。信頼できる配布物だと自分で判断できる場合だけ、自己責任で行ってください。

```bash
xattr -dr com.apple.quarantine "/Applications/Nyoze.app"
```

この操作の前に、必ず GitHub Releases から取得した正規の配布物であることを確認してください。

## Windows

1. GitHub Releases から `Nyoze-Windows-<version>-Setup.exe` をダウンロードします。
2. Installer を起動して案内に従います。

## 原稿を開く前に

- beta 版では、重要な原稿を初めて開く前に別途バックアップを取ってください。
- 実用上対応している文字コードは UTF-8 のみです。Shift-JIS / CP932 の `.txt` は先に UTF-8 へ変換してください。
- 正式な読み込み導線はアプリ内の `Load` です。

## ソースコードから試す場合

ソースコードから起動・build・package したい場合は [README.md](./README.md) を参照してください。
