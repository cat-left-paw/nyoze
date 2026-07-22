---
documentType: article
---
# Nyoze Keyboard Shortcuts

In this list, use `Cmd` on macOS and `Ctrl` on Windows / Linux.  
`Alt/Option` means `Option` on macOS and `Alt` on Windows / Linux.

---

## Normal Editing

### Basic Editing

The behavior of `Enter` and `Shift + Enter` depends on the Document Type.

> You can set the Document Type in the Document Settings panel on the right.  
> You can also change it by editing the frontmatter directly in Source Mode.

#### Article Mode

Article Mode is intended for articles, notes, and documentation.

- `Enter` — Create a new paragraph. Paragraph spacing is shown between paragraphs
- `Shift + Enter` — Insert a line break inside the current paragraph

Article Mode behaves closer to a typical Markdown document.

#### Novel Mode

Novel Mode is intended for literary writing and fiction.

- `Enter` — Start a new line. Internally this splits the paragraph, but it is displayed as compact body text without extra paragraph spacing
- `Shift + Enter` — Disabled in normal body text, such as paragraph / heading blocks

Novel Mode is designed for writing prose line by line, like a manuscript.

#### Common Basic Editing

- `Backspace` — Delete the previous character or merge blocks
- Arrow keys — Move the cursor

Inside structured blocks such as lists or blockquotes, `Shift + Enter` may be handled as a hard break.

If Japanese IME input rarely becomes stuck just after ruby text or explicit TCY, press `Escape` to discard the unconfirmed input and return to normal editing.

### Formatting and Editing

- `Cmd/Ctrl + B` — Bold
- `Cmd/Ctrl + I` — Italic
- `Cmd/Ctrl + Shift + X` — Strikethrough
- `Cmd/Ctrl + K` — Set or edit a link
- `Cmd/Ctrl + Alt/Option + R` — Open the Ruby / Emphasis Dot dialog
- `Cmd/Ctrl + Shift + C` — Clear formatting
- `Cmd/Ctrl + Z` — Undo
- `Cmd/Ctrl + Shift + Z` — Redo

### Headings

- `Cmd/Ctrl + Alt + 1` — Toggle Heading 1
- `Cmd/Ctrl + Alt + 2` — Toggle Heading 2
- `Cmd/Ctrl + Alt + 3` — Toggle Heading 3
- `Cmd/Ctrl + Alt + 0` — Change back to a normal paragraph

### Mode Switching

- `Cmd/Ctrl + Alt/Option + P` — Toggle Paragraph Plain mode

This shortcut does not enable Paragraph Plain mode while Source Mode is active.

### Outline and Folding

- `Cmd/Ctrl + Shift + ,` — Move to the previous or next heading, depending on writing mode
- `Cmd/Ctrl + Shift + .` — Move to the next or previous heading, depending on writing mode
- `Cmd/Ctrl + Shift + L` — Fold or unfold the current heading

In vertical writing, the meaning of `,` and `.` follows the visual direction, so it is reversed from horizontal writing.

- Horizontal writing: `,` moves to the previous heading, `.` moves to the next heading
- Vertical writing: `,` moves to the next heading, `.` moves to the previous heading

### Side Panes

- `Cmd/Ctrl + Alt/Option + ,` — Toggle the left pane, such as File Explorer
- `Cmd/Ctrl + Alt/Option + .` — Toggle the right pane, such as Outline / Document

These are not editing commands, so they can also be used in Paragraph Plain mode and Source Mode.

### Lists

- `Tab` — Indent the current list item
- `Shift + Tab` — Outdent the current list item

Moving list items depends on the writing direction.

Horizontal writing:

- `Cmd/Ctrl + ArrowUp` — Move the list item up
- `Cmd/Ctrl + ArrowDown` — Move the list item down

Vertical writing:

- `Cmd/Ctrl + ArrowRight` — Move the list item up, toward the beginning of the document
- `Cmd/Ctrl + ArrowLeft` — Move the list item down, toward the end of the document

These shortcuts do not run outside a list, during IME composition, or in Paragraph Plain / Source Mode.

### Cursor Movement

- `Home` — First press: move to the visual line start. Second press: move to the logical line start, or block start
- `End` — First press: move to the visual line end. Second press: move to the logical line end, or block end
- `PageUp` — Move one page back and keep the caret in the visible area
- `PageDown` — Move one page forward and keep the caret in the visible area

Modified shortcuts such as `Shift + Home` use the browser’s default behavior.  
During IME composition, Nyoze leaves these keys to the default behavior.

### Search and Replace

- `Cmd/Ctrl + F` — Open the search bar
- `Cmd/Ctrl + H` — Open search and replace

Inside the search bar:

- `Enter` — Move to the next match
- `Shift + Enter` — Move to the previous match
- `Escape` — Close the search bar

In the search and replace fields, pressing `Enter` to confirm IME text does not trigger search or replace.

---

## Paragraph Plain Mode

In Paragraph Plain mode, only the focused block is edited as Markdown source.

### Leaving the Mode

- `Cmd/Ctrl + Alt/Option + P` — Commit changes and leave Paragraph Plain mode
- `Escape` — Commit changes and leave Paragraph Plain mode

### paragraph / heading Blocks

- `Enter` — Split the block at the cursor
- `Backspace` — At the beginning of the block, merge with the previous text block
- `Shift + Enter` — Disabled
- `Cmd/Ctrl + Enter` — Disabled

Moving between blocks depends on the writing direction.

Vertical writing:

- `ArrowLeft` — At the end of the block, move to the next block
- `ArrowRight` — At the beginning of the block, move to the previous block

Horizontal writing:

- `ArrowDown` — At the end of the block, move to the next block
- `ArrowUp` — At the beginning of the block, move to the previous block

### codeBlock / html_block_atom Blocks

- `Enter` — Standard textarea behavior
- `Shift + Enter` — Standard textarea behavior
- `Backspace` — Standard textarea behavior
- Arrow keys — Standard textarea behavior
- `Cmd/Ctrl + Alt/Option + P` — Commit changes and leave Paragraph Plain mode
- `Escape` — Commit changes and leave Paragraph Plain mode

---

## Source Mode

In Source Mode, the entire document is edited as Markdown source.

- `Cmd/Ctrl + F` — Search
- `Cmd/Ctrl + H` — Search and replace
- `Cmd/Ctrl + Alt/Option + ,` — Toggle the left pane
- `Cmd/Ctrl + Alt/Option + .` — Toggle the right pane

Formatting shortcuts and list movement shortcuts for normal editing do not run as normal editing commands while Source Mode is active.

---

## Editing Sticky Notes

The following keys are available in the sticky-note editing form in the right pane.

- `Cmd/Ctrl + Enter` — Save the note from its body field
- `Escape` — Cancel editing from the title or body field

---

## Page Viewer

Use the following keys in the Page Viewer reading surface.

- `PageDown` / `Space` — Next page
- `PageUp` / `Shift + Space` — Previous page
- `Home` — First page of the document
- `End` — Last page of the document

The left and right arrow directions depend on the writing direction.

- Horizontal writing: `ArrowLeft` moves to the previous page and `ArrowRight` moves to the next page
- Vertical writing: `ArrowLeft` moves to the next page and `ArrowRight` moves to the previous page

When the bottom page scrubber has focus, use the left and right arrow keys to move one page at a time, and `Home` / `End` to move to the first / last page. The up and down arrow keys are also available in vertical writing.

Press `Escape` to close menus such as Settings, Theme, Page Transition, and Outline.

---

## Web Book

When the Web Book reader body has focus, use the following keys to move between pages.

- `PageDown` — Next page
- `PageUp` — Previous page
- `Home` — First page of the document
- `End` — Last page of the document
- Horizontal writing: `ArrowLeft` moves to the previous page and `ArrowRight` moves to the next page
- Vertical writing: `ArrowLeft` moves to the next page and `ArrowRight` moves to the previous page

When Settings or Outline is open, press `Escape` to close it.
