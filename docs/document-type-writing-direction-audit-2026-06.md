# Document Type / writing direction 分離 監査・実装メモ（2026-06）

作成日: 2026-06-17
対象ブランチ: `codex/book-management-audit`
状態: 実装済みメモ + 残課題整理

この文書は、`documentType`（文書の性格・改行スタイル）と writing direction（表示方向）を
分離する作業の現状把握、実装済みの経緯、残課題を記録する。最初の棚卸しでは
**Document Type の UI 表示名整理** までに留めたが、その後のスライスで
frontmatter `writingMode`、Document Type 別の既定表示方向、Document Settings の表示方向 UI まで実装済み。

## 1. 用語の整理（目標）

- `documentType` = 文書の性格・改行スタイル
  - UI 表示名: `小説・本文` / `記事・文書`（en: `Fiction` / `Article / Document`）
  - 内部値: `novel` / `article`（互換のため不変）
  - 決めるもの: Enter / Shift+Enter の改行解釈（lineBreakPolicy）、段落の扱い
- `writingMode` = 表示方向
  - 値: `vertical-rl`（縦書き）/ `horizontal-tb`（横書き）
  - 決めるもの: 表示・キャレット移動・スクロール軸などの方向

長期目標は `novel = 縦書き` の固定を外し、横書き小説・縦書き記事も選べるようにすること。

## 2. 最初のスライスで変えたこと（表示名のみ）

挙動・保存・frontmatter・内部値は不変。UI 表示名と説明文だけを更新した。

- `documentType.label.novel` / `documentSettings.option.novel`: `Novel` → `小説・本文` / `Fiction`
- `documentType.label.article` / `documentSettings.option.article`: `Article` → `記事・文書` / `Article / Document`
- `documentSettings.typeHint.*`: 先頭の型名を新表示名へ（改行スタイルの説明は不変）
- `documentType.sublabel.*`: 「縦書き推奨 / 横書き推奨」→ 文書性格の説明へ（表示方向の語を除去）
- `documentSettings.documentType` に helper を追加し、Document Settings パネルに描画:
  「文書タイプは文書の性格と改行スタイルを決めます。表示方向の設定ではありません。」
- `documentTypePresentation.ts`: fallback ラベル / 確認ダイアログ / 通知メッセージの型名を新表示名へ。

非対象（このスライスで触っていない）:

- `documentType` 内部値・frontmatter key
- `writingMode` の保存仕様・タブ単位保持
- `novel` 既存文書の縦書き互換挙動
- Document Settings の patch 対象キー
- Source Mode / Paragraph Plain / Markdown serializer / round-trip / save path

## 3. writing direction 経路（棚卸しと現在）

writing direction はタブ単位の状態、frontmatter `writingMode`、Document Type 別の既定表示方向で解決する。
初期棚卸し時点では **既定値が `documentType` の推奨に連動**していたことが結合の中心だったが、
現在はユーザー設定の「文書タイプ別の既定表示方向」へ置き換えている。

### 3.1 値・既定・永続化

- 型: `WritingMode = 'vertical-rl' | 'horizontal-tb'`（`src/settings/types.ts`）
- 既定: `DEFAULT_WRITING_MODE = 'vertical-rl'`、storage key `nyoze.writingMode`
  （`src/settings/defaults.ts`）。アプリ全体の初期方向として load/save される
  （`src/settings/storage.ts`、`horizontal-tb` のみ受理し他は既定へ正規化）。
- frontmatter には `writingMode` を保存できる。有効値は `vertical-rl` / `horizontal-tb`。
  未設定または未対応値の場合は、タブ state と Document Type 別の既定表示方向で解決する。

### 3.2 タブ単位の保持

- `EditorTab` は `writingMode` と `writingModeFollowsTypeRecommendation` を持つ
  （`src/ui/hooks/useAppUiState.ts`）。
- 新規タブ / 新規文書は `writingMode = 初期方向`、`followsTypeRecommendation = true`
  で作られる。
- ヘッダーの縦横切替で方向を変えると、`writingMode = 選択値` かつ
  `followsTypeRecommendation = false` になる（手動上書き）。
- Document Settings の「手動切替を解除」で `followsTypeRecommendation = true` に戻す。

### 3.3 documentType との結合点

2026-06-17 時点では、表示方向の実効解決は
`resolveEffectiveWritingMode`（`src/editor-core/io/frontmatterDocumentSettings.ts`）へ集約している。

- `followsTypeRecommendation === false` → タブ単位の手動表示方向。
- frontmatter `writingMode` が有効 → 文書の明示表示方向。
- それ以外 → `resolveTypeDefaultWritingMode(documentType, defaults)`。

`resolveTypeRecommendedWritingMode(type)` は従来互換の helper として残っているが、通常 UI の実効表示方向は
Document Type 別の既定表示方向 settings で決まる。つまり「`novel = 縦書き`」は固定仕様ではなく、
初期設定（小説・本文=縦書き）による互換挙動になった。

### 3.4 lineBreakPolicy（参考。方向とは別軸）

- `resolveTypeDerivedLineBreakPolicy(type)`: `novel → obsidian-paragraph`、
  `article → commonmark-strict`、`未設定 → null`。
- lock 優先順位: frontmatter override > type 由来 > null。
- これは改行解釈であり writing direction とは独立。Document Type 整理後も
  documentType に紐づくのが妥当。

### 3.5 Document Settings パネルの現状

- Document Type とは別に `表示方向` サマリを出している:
  - `現在の表示`（effective writingMode）
  - `適用元`（手動切替 / 文書の指定 / 文書タイプ別の既定）
  - `手動切替を解除` ボタン（手動切替中だけ有効）
  - `この文書の表示方向` select（既定に従う / 縦書きに固定 / 横書きに固定）
- `書字方向の推奨` / `推奨に戻す` という UI 文言は廃止済み。

## 4. 次スライス候補: `writingMode` frontmatter + Document Type 別の既定表示方向

目標: writing direction を documentType から独立した第一級設定にする。挙動互換を
保ちつつ、横書き小説・縦書き記事を選べるようにする。

合意済み方針:

- 文書ごとの明示設定には frontmatter `writingMode` を使う。
- 値は既存内部型に合わせ、`vertical-rl` / `horizontal-tb` とする。
- frontmatter に `writingMode` が無い文書だけ、Document Type 別の既定表示方向へ fallback する。
- Document Type 別の既定表示方向は settings UI で選べるようにする。

実効表示方向の優先順位:

```text
1. タブ単位の手動切替
2. frontmatter の writingMode（明示値）
3. Document Type 別の既定表示方向
   - 小説・本文 / Fiction
   - 記事・文書 / Article / Document
   - 未設定文書
```

初期値は互換のため次を維持する。未設定文書も含めて、各文書タイプの既定方向を
明示的に縦書き / 横書きから選ぶ（`app-default` のような間接指定は持たない）。

```text
小説・本文 / Fiction: vertical-rl
記事・文書 / Article / Document: horizontal-tb
未設定文書: vertical-rl
```

これにより、英語圏や横書き小説ユーザーは「小説・本文の既定表示方向 = 横書き」にでき、
個別作品・個別文書だけ例外にしたい場合は frontmatter `writingMode` で固定できる。

### 4.1 推奨アプローチ（段階導入）

1. frontmatter `writingMode` の read-only 解釈 **（実装済み: 2026-06-17）**
   - `writingMode: vertical-rl` / `writingMode: horizontal-tb` だけを有効値として読む。
   - complex scalar、空、未知値は無効として無視する。
   - frontmatter へはまだ書かない。Document Settings の patch 対象キーも増やさない。
   - source of truth は文書 frontmatter の明示値だが、読み取り専用から始める。
   - 実装メモ:
     - parse: `parseFrontmatterFields`（`src/editor-core/io/frontmatter.ts`）が `writingMode` を
       single scalar として読む。
     - 解釈: `resolveFrontmatterWritingMode`（`src/editor-core/io/frontmatterDocumentSettings.ts`、
       pure helper）が `{ writingMode, unsupported }` を返す。空・未設定は `unsupported=false`、
       complex / 未知値は `unsupported=true` で無効。
     - 実効方向: `resolveEffectiveWritingMode`（pure helper、`useAppUiState.ts` から委譲）の
       優先順位は **タブ単位の明示切替（follows=false）> frontmatter `writingMode` >
       Document Type 別の既定表示方向**。
     - 表示: Document Settings に「文書の指定」/「未対応値」の補助表示。当初は read-only だったが、
       後続スライス（下記 3）で明示保存 / 削除 UI を追加した。
     - test: `tests/writing-mode-frontmatter.test.ts`（旧 `writing-mode-frontmatter-readonly.test.ts`）。
2. Document Type 別の既定表示方向 settings **（実装済み: 2026-06-17）**
   - Display Settings または Document Settings 周辺に次の設定を追加する。

     ```text
     文書タイプ別の既定表示方向
       小説・本文: 縦書き / 横書き
       記事・文書: 横書き / 縦書き
       未設定文書: 縦書き / 横書き
     ```

   - この設定は frontmatter `writingMode` が無い文書にだけ効く。
   - 初期値は従来互換（小説・本文=縦書き、記事・文書=横書き、未設定文書=縦書き）。
   - 実装メモ:
     - settings key: `defaultNovelWritingMode` / `defaultArticleWritingMode` /
       `defaultUnsetDocumentWritingMode`（settings.json）。受理値はいずれも
       `vertical-rl` / `horizontal-tb` のみ。初期値は `vertical-rl` / `horizontal-tb` /
       `vertical-rl`。
     - 正規化 / 既定 / load helper は `src/settings/writingModeDefaults.ts`、
       sanitizer は `electron/settingsSanitizer.ts`（3 キーとも `vertical-rl` /
       `horizontal-tb` のみ受理）。
     - 実効解決 `resolveEffectiveWritingMode`（`frontmatterDocumentSettings.ts`、
       pure helper）に集約。`resolveTypeDefaultWritingMode(type, defaults)` が
       Document Type 別の既定をそのまま返す（未設定文書も明示的な縦/横）。
     - UI: Display Settings に `文書タイプ別の既定表示方向` セクション（縦書き / 横書きの
       select 3 つ）。Document Settings は `現在の表示` / `適用元` / `この文書の表示方向` を表示する。
     - frontmatter へは書き込まない。Document Settings の patch 対象キーも増やさない。
     - test: `tests/document-type-default-writing-mode.test.ts`。
   - 補追（2026-06-17）: 当初 `未設定文書` には `app-default`（= アプリ全体の既定表示方向、
     実体は `nyoze.writingMode`）を持たせていたが、ユーザーから「アプリ全体の既定表示方向」が
     どこにあるか分かりにくいため廃止。未設定文書も縦書き / 横書きの明示 2 択にした。
     `app-default` は型・既定・sanitize・実効解決・UI から除去し、`UnsetDocumentWritingMode`
     型も廃止（`WritingMode` に統一）。
3. Document Settings の文書単位保存 UI **（実装済み: 2026-06-17、UI 整理: 2026-06-17）**
   - `writingMode` を明示保存 / 削除できる UI を Document Settings に追加した。
   - 表示方向サマリと操作（UI 整理後）:

     ```text
     表示方向
       現在の表示: 縦書き / 横書き
       適用元: 手動切替 / 文書の指定 / 文書タイプ別の既定
       （未対応の writingMode は無視されています）
       [手動切替を解除]   ※手動切替中だけ有効

     この文書の表示方向: [既定に従う / 縦書きに固定 / 横書きに固定]  ← select
       既定に従う   → writingMode key を削除
       縦書きに固定 → writingMode: vertical-rl
       横書きに固定 → writingMode: horizontal-tb
     ```

   - 「書字方向の推奨 / 推奨に戻す」という UI 文言は廃止し、`現在の表示` / `適用元` /
     `手動切替を解除` に置き換えた（内部関数 `resetWritingModeToTypeRecommendation` は据え置き、
     UI 文言・prop は `Clear manual override` 系へ寄せた）。
   - 「既定に従う」は frontmatter `writingMode` key を削除し、文書タイプ別の既定表示方向へ戻す。
     未対応値が入っていた場合の掃除にも使える。
   - 操作はボタン 3 つではなく select 1 つ。保存は明示操作のみ。設定変更から frontmatter へ無言同期しない。
   - 実装メモ:
     - patch: `patchFrontmatterKnownScalars` に `writingMode?: WritingMode | null` を追加。
       `EDITABLE_KEYS` / `buildScalarLine` / `buildFrontmatterFromScratch` も対応。受理値は
       `vertical-rl` / `horizontal-tb`、`null` で key 削除。`book` / `order` / `role` は対象外。
     - 安全性: complex / duplicate な frontmatter は既存 `canSafelyPatchFrontmatter` 方針どおり
       patch 不可（select も無効化）。complex な `writingMode` 値があると frontmatter 全体が read-only。
       `Source Mode` / `Paragraph Plain` 編集中も select は無効。
     - 反映: handler `useDocumentWritingModeChange`（`src/ui/hooks/`）が core の frontmatter prefix
       のみ更新する frontmatter-only update。保存 / 削除後は `writingModeFollowsTypeRecommendation`
       を true に戻し、保存した文書指定 / 既定方向を実効表示へ反映する。本文・改行ポリシー・
       Markdown serializer / save path には触れない。
     - 密度: Document Settings の input / select / button / label のフォントサイズと padding を
       右ペイン他タブに合わせて少し小さくした（CSS は `document-settings-*` 節に限定）。
     - test: `tests/writing-mode-frontmatter.test.ts`。
4. 既定の脱結合（最終段階）
   - `novel = 縦書き` 固定を外し、Document Type 別の既定表示方向 + 文書明示値で決める。
   - documentType は改行解釈を主に担い、方向は「既定値を選ぶための分類」に格下げする。

### 4.2 互換方針

- 既存 `documentType: novel` 文書は、初期 settings で縦書き既定を維持する。
- 既存 `documentType: article` 文書は、初期 settings で横書き既定を維持する。
- frontmatter `writingMode` があれば、それを最優先する。
- `documentType` の内部値 `novel` / `article` と既存 frontmatter key は変えない。

### 4.3 リスク / 非対象

- frontmatter へ方向キーを書く場合は原稿破壊リスクが高い。read-only 解釈 → 明示保存の段階を
  守り、Document Settings の patch 対象キーを安易に増やさない。
- Source Mode は方向に関わらず横書き固定（現状維持）。
- Paragraph Plain / Markdown serializer / save path は触らない。
- 設定変更だけで既存文書へ `writingMode` を自動追加しない。
