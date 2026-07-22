/**
 * Fallback emphasis re-parsing for text that markdown-it left as plain text.
 *
 * ## Background
 *
 * CommonMark's emphasis algorithm requires that a closing delimiter run
 * is "right-flanking", which (among other things) means the character
 * preceding the delimiter must not be Unicode punctuation unless the
 * character following the delimiter is also punctuation or whitespace.
 *
 * In Japanese text this rule often fails: when a closing bracket / quote
 * (」、》、"、）、】 etc.) immediately precedes `**` and the following
 * character is a Japanese letter (ひらがな、カタカナ、漢字), markdown-it
 * does not recognise the delimiter as closing and emits the whole span
 * as a single `text` token.
 *
 * Affected patterns include cases where markdown-it leaves the WHOLE span as
 * a single text token, for example:
 *   **「テスト」**です。
 *   *「テスト」*です。
 *   ~~「テスト」~~です。
 *   ***「テスト」***です。         (bold + italic)
 *   **~~「テスト」~~**です。       (bold + strike)
 *   **これは｜漢字《かんじ》**です。
 *
 * When markdown-it does recognise an inner mark but leaves only the outer
 * delimiter run as text (for example `text("これは***") s_open ... s_close
 * text("***よ。")`), `rescueOrphanDelimiters()` handles that token-level
 * repair before this regex runs.
 *
 * ## Strategy
 *
 * This module extends the combined inline-pattern regex used by
 * `addTextWithAozora` in `parseMarkdown.ts`. The extended regex adds
 * alternations for `***…***`, `**…**`, `*…*`, and `~~…~~` as the
 * lowest-priority branches (after ruby, tcy, highlight). Because
 * `addTextWithAozora` only sees remaining plain text after token-level
 * rescue, there is no risk of double-interpreting a span that the main
 * inline token walker already handled.
 *
 * The inner content of a matched fallback emphasis span is recursively
 * passed back through `addTextWithAozora`, so ruby / tcy / highlight /
 * nested emphasis inside the span are still recognised.
 *
 * ## Safety constraints
 *
 * To avoid turning literal `*` / `**` / `~~` into spurious emphasis,
 * the inner content must:
 *   - Not start or end with a space
 *   - Not contain the delimiter character (`*` for bold/italic, `~` for strike)
 *   - Not contain a newline
 *
 * These constraints match the Nyoze serializer's output format: it never
 * emits emphasis with leading/trailing spaces or embedded delimiter chars.
 * Literal uses like `2 * 3 * 4` or `foo ** bar ** baz` are excluded.
 *
 * ## Scope of rescued punctuation
 *
 * All Unicode characters classified as "closing punctuation" (Pc/Pe/Pf)
 * or "other punctuation" used as closing brackets in CJK text are covered,
 * because the regex simply matches any non-delimiter, non-newline,
 * non-space-boundary content between the opening and closing delimiter
 * runs — the same approach used for highlight (`==…==`).
 */

/**
 * Combined regex for all custom inline patterns including fallback emphasis.
 *
 * Group assignments:
 *   [1]  Ruby delimiter body  (｜body《ruby》)
 *   [2]  Ruby kanji-only body (漢字《ruby》)
 *   [3]  Ruby annotation
 *   [4]  TCY body             (｟body｠)
 *   [5]  Highlight body       (==text==)
 *   [6]  Bold+italic body     (***text***)
 *   [7]  Bold body            (**text**)
 *   [8]  Italic body          (*text*)   — negative lookbehind/ahead for *
 *   [9]  Strike body          (~~text~~)
 *   [10] Underline body       (||text||)
 *
 * Priority / ordering notes:
 * - Ruby & TCY are first (most specific delimiters, no ambiguity).
 * - Highlight `==…==` comes before emphasis to avoid `=` confusion.
 * - Bold+italic `***…***` MUST precede bold `**…**` to avoid partial match.
 * - Bold `**…**` MUST precede italic `*…*` so `**x**` is not mis-parsed
 *   as `*` + italic(`x`) + `*`.
 * - Italic uses lookbehind/ahead to avoid matching inside `**…**`.
 * - Strike `~~…~~` is last among the emphasis group and unambiguous.
 * - Underline `||…||` is appended last. It is unambiguous with every branch
 *   above it: none of them can start a match on `|`, since the ruby-delimiter
 *   branch (`[｜|]…`) excludes `|` itself from the base body, so a leading
 *   `||` always falls through to the underline alternative. Ordering
 *   relative to the other alternatives therefore does not matter.
 *
 * Inner content constraints (bold/italic/strike/bold+italic):
 * - Must not start or end with space (excludes `** foo **`)
 * - Must not contain the delimiter char (excludes cross-match)
 * - Single-char inner is allowed via the `|[^ D\n]` alternation
 *
 * Inner content constraints (underline, same shape as highlight `==…==`):
 * - Must not be empty (excludes bare `||||`)
 * - Must not contain `|` or a newline (excludes cross-match and
 *   line-crossing `||…||`); leading/trailing spaces are allowed, matching
 *   highlight's permissiveness.
 */
export const INLINE_PATTERN_WITH_EMPHASIS_REGEX =
  /(?:[｜|]([^｜|《》]+?)|([\u4E00-\u9FFF\u3005\u3400-\u4DBF]+?))《([^》]+?)》|｟([A-Za-z0-9!?]{1,4})｠|==([^=\n]+)==|\*\*\*([^ *\n][^*\n]*[^ *\n]|[^ *\n])\*\*\*|\*\*([^ *\n][^*\n]*[^ *\n]|[^ *\n])\*\*|(?<!\*)\*([^ *\n][^*\n]*[^ *\n]|[^ *\n])\*(?!\*)|~~([^ ~\n][^~\n]*[^ ~\n]|[^ ~\n])~~|\|\|([^|\n]+)\|\|/g
