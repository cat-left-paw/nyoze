# Nyoze Markdown frontmatter リファレンス

この文書は、Nyoze が **現行実装** に基づいて Markdown frontmatter をどう読み、どこまで GUI から書き、どこを正本（source of truth）とするかをまとめたユーザー向け正本です。実装の正本は `src/editor-core/io/frontmatter.ts` と `src/editor-core/io/frontmatterDocumentSettings.ts` です。

用語: 右ペインの限定編集 UI は **文書メタデータ / Document Metadata** と呼びます。作品（Project）管理の表示 metadata は **作品** タブと `.nyoze/books.json` v3 が正本です。

---

## 1. frontmatter の基本形

### 対象範囲

- 文書先頭の `---` で囲まれた領域だけが frontmatter です。2 行目以降の `---` までを 1 ブロックとして扱います。
- UTF-8 の Markdown ファイルの一部として保存されます。Nyoze は保存往復で frontmatter の raw 文字列を勝手に壊さないことを優先します。
- Nyoze は **一般的な YAML エディタではありません**。表示・文書挙動・限定 GUI 編集に必要な top-level key だけを限定的に解釈します。
- **未知の key** は raw frontmatter 内に保持されますが、Nyoze は意味を解釈しません。
- 複雑な YAML（ネスト、ブロックスカラー、重複 key など）の編集は **Source Mode** を使ってください。

### 安全な最小例

```yaml
---
title: 短編のタイトル
author: 著者名
documentType: novel
---
```

本文は frontmatter ブロックの直後から始まります。閉じ `---` の直後の改行は通常エディタ本文側に含まれません。

---

## 2. key 一覧

### 分類の見方

| 分類 | 意味 |
| --- | --- |
| **読み取り** | `parseFrontmatterFields` が解釈する key |
| **GUI 書き込み** | 文書メタデータ / Document Metadata から明示保存できる key |
| **表示専用** | 冒頭表示（`FrontmatterView`）などに使うが、Document Metadata では編集しない key |
| **legacy 互換** | 読み取りのみ、または fallback 書き込みのみ。新規記述の推奨 key ではない |
| **廃止（作品分類）** | 現行の作品 / Book 管理の正本ではない key |

### 2.1 表示 metadata

| key | 型・推奨記法 | Nyoze での用途 | Document Metadata から編集 | 作品外単独文書 | 作品内登録ファイル |
| --- | --- | --- | --- | --- | --- |
| `title` | 単一行 scalar（plain / quoted） | 冒頭表示の主タイトル、左ペイン文書情報など | **可** | **frontmatter が正本** | books.json v3 の `title` が表示正本。frontmatter は編集可能だが表示へは反映されない |
| `original_title` | 単一行 scalar | 冒頭表示の原題 | **不可**（Source Mode） | frontmatter が正本。`FrontmatterView` で表示 | frontmatter に保持可能だが、**冒頭表示には使われない**（books.json v3 に原題フィールドはなく、`ProjectFileStartView` も表示しない） |
| `subtitle` | 単一行 scalar | 冒頭表示の副題 | **不可**（Source Mode） | frontmatter が正本。`FrontmatterView` で表示 | frontmatter に保持可能だが、**冒頭表示には使われない**（v3 に副題フィールドはない） |
| `author` | 単一行 scalar | 冒頭表示の著者（主） | **可** | **frontmatter が正本** | v3 の `authors[0]` 相当が表示正本。frontmatter は同期されない |
| `co_authors` | **推奨**: block sequence（`- 名前`）。コード上は flow sequence `[a, b]`、カンマ区切り 1 行、単一 scalar も読める | 冒頭表示の共著者 | **不可**（Source Mode） | frontmatter が正本 | v3 の `authors` 配列が表示正本 |
| `translator` | 単一行 scalar | 冒頭表示の訳者（主） | **可** | **frontmatter が正本** | v3 の `translators[0]` 相当が表示正本 |
| `co_translators` | **推奨**: block sequence。`co_authors` と同様の読み取り範囲 | 冒頭表示の共訳者 | **不可**（Source Mode） | frontmatter が正本 | v3 の `translators` が表示正本 |

#### `co_authors` / `co_translators` の読み取り範囲（実装準拠）

Nyoze の parser（`parseListValue`）が対応するのは次のとおりです。

1. **block sequence（推奨）**

   ```yaml
   co_authors:
     - 共著者A
     - 共著者B
   ```

2. **flow sequence** — `[A, B]` 形式。要素内の quoted 文字列とカンマはある程度尊重します。

3. **カンマ区切り 1 行** — 引用符で囲まれた単一 scalar でない場合に、`,` で分割します。

4. **単一 scalar** — 1 要素の配列として扱います。

flow sequence の高度な YAML 構文、ネストした mapping、block scalar 本体などを **完全対応** とみなさないでください。共著・共訳は **block sequence を推奨** します。

### 2.2 文書挙動

| key | 有効値・記法 | 用途 | GUI 編集 | 備考 |
| --- | --- | --- | --- | --- |
| `documentType` | `novel` / `article`（canonical） | 文書の性格・改行スタイルの主概念 | **可**（`小説・本文` / `記事・文書` / `未設定`） | `未設定` の canonical は **key なし** |
| `writingMode` | `vertical-rl` / `horizontal-tb` | 文書単位の表示方向（read-only 指定） | **可**（表示方向プルダウン） | 空・複雑値・未知値は無視 |
| `nyozePreserveEmptyParagraphs` | `true` / `yes` / `on` / `1`（大文字小文字無視） | Article 向け空段落保持 | **可**（Article 時のみ） | 下記「runtime auto-protect」と区別 |

#### `documentType` の読み取り優先順位

1. 有効な scalar `documentType`（`novel` / `article` / 互換 `note`）
2. 有効な scalar `nyozeType`（legacy）
3. 有効な scalar `type`（legacy、読み取りのみ）
4. いずれも無効・未設定 → **未設定**（`null`）

`note` は読み取り互換として **未設定** と同様に扱われます。

#### 改行ポリシー（間接）

通常 UI では raw 名を出しません。実効改行解釈の優先順位は次のとおりです。

1. `nyozeLineBreakPolicy`（legacy 互換 override）
2. `documentType` 由来（`novel` → `obsidian-paragraph`、`article` → `commonmark-strict`）
3. タブの `lineBreakPolicy`
4. アプリ既定

#### `writingMode` の実効表示方向

優先順位:

1. **タブ単位の手動切替**（ヘッダーの縦横切替。`followsTypeRecommendation=false` の間は最優先）
2. frontmatter の有効な `writingMode`
3. **Display Settings** の文書タイプ別既定表示方向（`novel` / `article` / 未設定それぞれ）

frontmatter に `writingMode` が **無い** ときだけ、文書タイプ別既定が効きます。

#### `nyozePreserveEmptyParagraphs`

- **canonical（明示 ON）**: frontmatter に `nyozePreserveEmptyParagraphs: true` がある状態。Document Metadata で ON 保存したときに書き込まれます。
- **runtime auto-protect（effective）**: `documentType` が Article 相当で、key が無くても load 時に保持対象の連続空行があれば **実行時だけ** 空段落を保護します。frontmatter へは **自動書き込みしません**。
- Document Metadata では auto-protect 中もチェック ON で見えます。**Save as document setting** で explicit ON にできます。OFF にすると key を削除し strict canonical へ戻せます。
- 初期スコープは top-level の `paragraph` / `heading` 間のみです。

### 2.3 legacy 互換

| key | 読み取り互換 | GUI が新規書込 | canonical key | 新規記述の推奨 |
| --- | --- | --- | --- | --- |
| `nyozeType` | **可**（`documentType` と同系） | `documentType` が複雑・ユーザー管理値のとき **fallback 書込** のみ | `documentType` | **非推奨**（新規は `documentType`） |
| `type` | **可**（scalar の `novel` / `article` / `note` のみ） | **しない**（上書き・削除もしない） | `documentType` | **非推奨** |
| `nyozeLineBreakPolicy` | **可**（`obsidian-paragraph` / `commonmark-strict`） | **しない** | `documentType` 由来の改行スタイル | **非推奨**（互換維持用） |

`documentType` が配列・object・複数行 scalar など **安全に patch できない** とき、Document Metadata の保存は `nyozeType` に fallback することがあります。`type` は既存文書の読み取り専用です。

---

## 3. 文書メタデータ / Document Metadata UI

### できること

限定 GUI です。**frontmatter 一般編集 UI ではありません**。

編集・保存できる範囲:

| UI 項目 | frontmatter key |
| --- | --- |
| Document Type | `documentType`（fallback: `nyozeType`） |
| title | `title` |
| author | `author` |
| translator | `translator` |
| 表示方向 | `writingMode`（追加 / 削除） |
| Paragraph Spacing → Preserve empty paragraphs | `nyozePreserveEmptyParagraphs`（Article のみ） |

### できないこと・制限

- `original_title` / `subtitle` / `co_authors` / `co_translators` などは **Source Mode** で編集してください。
- frontmatter が **unsafe** と判定された場合、パネルは **read-only** になり Source Mode を案内します。主な条件は **重複 key**、**top-level として解釈できない孤立したインデント行**、直接 patch する key（`nyozeType` / `nyozePreserveEmptyParagraphs` / `title` / `author` / `translator` / `writingMode`）の **complex scalar** または **複数行の子行** です。未知 key 配下のネストは raw 保持のまま patch できることがあります。`documentType` は例外で、複雑値や複数行値を保持したまま `nyozeType` へ fallback して Document Type を保存できる場合があります（下記 §6）。
- **Source Mode** / **Paragraph Plain** 編集中は編集不可です。
- built-in の read-only 文書（ショートカット一覧など）では利用できません。

### 保存の影響

- 保存は **frontmatter prefix だけ** を patch します。**本文（Markdown 本体）は変更しません**。
- frontmatter-only の変更も **dirty / 未保存保護** の対象です。保存せずにタブを閉じる・終了する導線では警告されます。
- `writingMode` のプルダウン操作でも、その都度 frontmatter へ書き込みます（自動では key を追加しません）。

---

## 4. 作品外と作品内の違い

### 4.1 作品外の単独文書

| 種類 | 正本 |
| --- | --- |
| 表示 title / author / translator / 共著・共訳 | **frontmatter** |
| 冒頭表示（`FrontmatterView`） | frontmatter の表示 metadata |
| 文書挙動（Document Type、表示方向、空段落保持など） | **frontmatter** |
| 左ペイン文書情報のタイトル・著者・訳者 | frontmatter（なければファイル名など fallback） |

### 4.2 作品内の登録済みファイル

| 種類 | 正本 |
| --- | --- |
| Book 名・Book 著者、本文 / 資料の title / authors / translators | **`.nyoze/books.json` v3** |
| 章順・Book 所属・資料 role | **books.json v3** |
| 文書挙動（`documentType` / `writingMode` / `nyozePreserveEmptyParagraphs` など） | **frontmatter**（従来どおり） |

- 作品タブ・文書冒頭（`ProjectFileStartView` の v3 表示）・左ペイン文書情報は **books.json v3 の title / authors / translators** から表示し、frontmatter の `title` / `author` / `translator` へ **fallback しません**。
- `original_title` / `subtitle` は books.json v3 に相当フィールドがなく、作品内登録ファイルの冒頭表示にも **使われません**（frontmatter に書いて保持することは可能）。
- Document Metadata で frontmatter を編集しても **books.json とは自動同期しません**。
- 作品内でも任意の frontmatter は残せます（外部ツール連携・独自 metadata 用）。

### 4.3 新規登録時だけの frontmatter 読取

未登録ファイルを books.json へ登録するとき（body / material 追加）だけ、frontmatter の title / credits を **初期値候補** として読みます。

以後は **自動同期しません**。Markdown / frontmatter を Nyoze が勝手に書き換えることはありません。

---

## 5. 廃止された Project 分類 key

次の frontmatter key は、**現行の作品 / Book 管理の正本ではありません**。

| key | 旧用途 | 現行の正本 |
| --- | --- | --- |
| `book` | 所属 Book 名 | books.json v3 の Book / item 所属 |
| `order` | 作品内の並び順 | books.json v3 の配列順 |
| `role` | 本文 / 資料種別 | books.json v3 の item / material 登録と `material.role` |

`parseBookFrontmatterFields` は read-only でこれらを読めますが、Project タブ・Book 全体 Outline・前後章ナビ・File Explorer の role アイコンは **books.json v3** を参照します。File Explorer の role アイコンは **frontmatter `role` ではなく** v3 registry から解決します。

新規の作品管理用途で `book` / `order` / `role` を frontmatter に書くことは推奨しません。

---

## 6. YAML 記法と制限

Nyoze の frontmatter parser / patcher が前提とするのは **単純な top-level mapping** です。

### おおむね対応するもの

| 記法 | 説明 |
| --- | --- |
| **simple scalar** | `key: value` |
| **quoted scalar** | `'value'` / `"value"`。インライン `#` コメントは quote 外で除去 |
| **block sequence** | `co_authors` / `co_translators` の `- item` 形式（推奨） |
| **flow sequence** | `[a, b]` — 限定的に対応 |
| **inline comment** | 値の後ろの `# comment`（quote 内は保護） |

### 制限・非対応に近いもの

| 状況 | Nyoze の扱い |
| --- | --- |
| **duplicate key** | GUI patch は **unsafe**（read-only）。読み取りは行単位で後勝ち |
| **孤立したインデント行** | top-level key に属さないインデント行があると GUI patch **unsafe** |
| **直接 patch 対象 key の複数行子行** | `nyozeType` / `nyozePreserveEmptyParagraphs` / `title` / `author` / `translator` / `writingMode` が block sequence・block scalar など **複数行の子行** を持つと、その key の安全な直接 patch は不可（全体が unsafe になる） |
| **直接 patch 対象 key の complex scalar** | 上記 key の値が `[`, `{`, `|`, `>` などで始まる complex scalar だと直接 patch 不可 |
| **複雑な `documentType`** | 配列・object・block scalar・複数行値などは直接変更せず raw のまま保持する。frontmatter 全体がほかの条件で unsafe でなければ、**`nyozeType` への fallback 書込**で Nyoze 用 Document Type を保存できる |
| **未知 key 配下のネスト** | 意味解釈しない。**raw 保持**したまま、他の管理 key だけ patch できることがある |
| **nested mapping / object**（未知 key） | 解釈しない。子行ごと raw 保持 |
| **block scalar**（`|`, `>`） | 管理対象 key 直下では patch 不可。未知 key 配下なら保持のみ |

`safeToPatch` は、未知 key のネストを無理に壊さないよう **管理対象 key と孤立インデント** を中心に判定します。raw source を自由に編集する場合は **Source Mode** を使ってください。

**完全な YAML 1.x 対応ではありません。** Obsidian や汎用 YAML エディタの高度な記法をそのまま使えるとは限りません。

---

## 7. 実例

### 7.1 小説・縦書きの単独文書（作品外）

```yaml
---
title: 海辺の記憶
author: 山田太郎
documentType: novel
writingMode: vertical-rl
---
```

- 表示 metadata の正本は frontmatter。
- `documentType: novel` により改行は `obsidian-paragraph` 系が既定。
- `writingMode` があれば文書タイプ別既定より優先（手動切替が無い場合）。

### 7.2 Article・横書き・空段落保持

```yaml
---
title: 技術メモ
author: 佐藤花子
documentType: article
writingMode: horizontal-tb
nyozePreserveEmptyParagraphs: true
---
```

- Article + 明示 ON で top-level 空段落を保持。
- key が無くても auto-protect が効く文書では、UI 上 ON に見えても frontmatter には key が無いことがあります。

### 7.3 複数著者・翻訳者（block sequence 推奨）

```yaml
---
title: 異邦人
original_title: L'Étranger
author: アルベール・カミュ
co_authors:
  - 共著者A
  - 共著者B
translator: 小田切秀雄
co_translators:
  - 共訳者A
---
```

- `co_authors` / `co_translators` は Document Metadata では編集しません。Source Mode で編集してください。

### 7.4 作品内ファイル — 文書挙動 key のみ

```yaml
---
documentType: novel
writingMode: vertical-rl
---
```

- 章の表示名・著者は **作品** タブ（books.json v3）が正本。
- この frontmatter は文書挙動と外部連携用 metadata として残せます。

### 7.5 legacy key を含む既存文書

```yaml
---
nyozeType: novel
type: novel
nyozeLineBreakPolicy: commonmark-strict
title: 旧形式の原稿
author: 著者
---
```

- 読み込み時は `nyozeType` / `type` から Document Type を解釈できます。
- Document Metadata で Document Type を保存すると、可能なら `documentType` へ寄せます。
- `nyozeLineBreakPolicy` は互換 override として読み取りますが、GUI では編集しません。削除・変更は Source Mode で行ってください。
- 新規原稿では `documentType` を使い、legacy key は書かないことを推奨します。

---

## 関連ドキュメント

- 操作説明: [MANUAL.md](../MANUAL.md)（文書メタデータ / Document Metadata、作品管理）
- 改行ポリシー詳細: [line-break-policy-rules.md](../line-break-policy-rules.md)
- books.json v3 設計: [book-manifest-v3-design-2026-06.md](./book-manifest-v3-design-2026-06.md)
