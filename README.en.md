# Nyoze Beta

[日本語](./README.md) | [English](./README.en.md)

Official website: [Nyoze](https://cat-left-paw.github.io/nyoze/)

Nyoze is an editor that lets you **write vertically as-is**.
Published by Left Paw Studio.

The next GitHub pre-release is `0.3.0-beta.1`. The Microsoft Store build is not being updated in this cycle and remains at app version `0.2.1-beta.1` / Store package version `1.2.1.0`.

- Write novels and essays directly in vertical writing
- Save files in Markdown while keeping them usable as plain text
- Supports Japanese expressions such as ruby text and tate-chu-yoko

Nyoze is a Markdown editor primarily designed for vertical Japanese writing.
In this beta, the priorities are: making day-to-day writing viable, keeping minimum compatibility with Markdown / frontmatter / images, and round-tripping documents without damaging manuscripts.

For detailed usage, see [MANUAL.md](./MANUAL.md).

## Who It Is For

- People who want to write novels or prose in vertical writing
- People who want to try Markdown without dealing with overly technical workflows
- People who want to manage manuscripts as text files
- People who want comfortable Japanese writing with ruby text and tate-chu-yoko

## Terms Used In This README

- **Markdown**: a text format that uses simple symbols for headings, emphasis, and more
- **frontmatter**: a `---`-wrapped block at the top of a document for metadata such as title and author
- **Project**: a folder with `.nyoze/project.json`; it is the unit for sticky notes and Book / Materials management
- **Book**: a unit within a project for navigation and export (e.g. main story, side stories). Project Book structure and display metadata (`title` / `authors` / `translators`) use `.nyoze/books.json` as the source of truth
- **WYSIWYG**: an editing view closer to the final appearance rather than raw markup

## Main Features

- Direct vertical writing editing
- A WYSIWYG editing surface
- Typewriter scroll, Visual Focus, and a pseudo caret to help you stay oriented around the current writing position
- Ruby text and tate-chu-yoko support
- Opens and saves `.txt` as well as `.md`
- Prioritizes safe manuscript round-tripping

## What This Beta Is

- A standalone desktop app for Markdown editing in vertical or horizontal writing
- Primarily aimed at literary writing, while also supporting `Article / Document` files such as blog posts and technical writing
- `Document Type` can be switched between `Fiction` and `Article / Document` so line-break behavior matches the document style (internal values `novel` / `article` are unchanged; Document Type sets the character and line-break style, not the display direction)
- This beta focuses on writing, saving, reloading, and minimum document management
- At this stage, writing experience and manuscript safety take priority

## What You Can Do

- Switch between vertical and horizontal writing
- WYSIWYG editing
- Writing aids such as Typewriter scroll, edit-block highlight, current-line highlight, and a pseudo caret
- Project-based sticky notes attached to text positions, with titles, multi-line Markdown notes, resolved status, and a Notes pane
- A Project pane with Books, Materials, multi-role filters, Markdown preview, and lightweight in-pane material editing (textarea with explicit save)
- Book / Materials management backed by `.nyoze/books.json` (create / rename / unregister Books; register, reorder, and edit body/material `title` / `authors` / `translators`)
- **Document Metadata** pane for frontmatter editing and saving (does not auto-sync with Project display metadata inside a Project)
- Project creation with a Project name and initial Book name, creating both `.nyoze/project.json` and `.nyoze/books.json`
- Library management for creating, registering, switching, renaming, unregistering, and revealing libraries in Finder / Explorer
- File Explorer `Library` / `Projects` tabs, Project-list drill-down into project roots, and outside-library file indication
- Project switching from the Project pane
- Register unassigned `.md` / `.markdown` / `.txt` files into Books or Materials
- Outline pane with `[This document] [Whole book]` toggle, whole-book chapter / heading navigation, and Previous / Next chapter buttons
- Book-wide export (File > Export, LeME / Denden / Aozora / Web Book, read-only disk, page-break / book-info / TOC options prompt)
- Web Book (create either a reader-equipped single HTML file or a web-public package from the current document or an entire Book; for reading and simple print/PDF saving in Chrome or Edge — the only user-facing HTML export)
- A separate read-only Page Viewer for the active document or an entire Book, with CSS Columns pagination, heading jumps from the TOC and outline, local images, and `:::page-break` / `:::blank-page-N` rendering
- Chapter-edge overlays and `Option/Alt + wheel` navigation to the previous chapter end or next chapter start for Book body files
- Open and edit multiple documents in tabs
- Create / rename / duplicate / move / delete files to trash from File Explorer
- Display-only automatic TCY in WYSIWYG (off by default, optional digit-only mode, saved content unchanged)
- Explicit TCY with Nyoze notation
- Aozora Bunko style ruby text and bouten
- Toggle ruby display on/off
- Display-only safeguards for vertical line breaking around ruby-adjacent punctuation and paragraph-ending closing brackets after inline formatting
- Display-only syntax highlight, language labels, and body copy for WYSIWYG code blocks
- Paragraph-level Markdown source editing with `Paragraph Plain`
- Full-document Markdown source editing with `Source Mode`
- Search / replace
- Display Markdown with local image references
- Read-only display of frontmatter
- Limited editing from `Document Settings` (`Document Type` / `title` / `author` / `translator`)
- Switch `Document Type` between `Fiction` and `Article / Document`
- Change line-break policy through `Document Type`
- Workflows for both literary writing and article / technical writing
- Open document links in an external browser with `Cmd/Ctrl + Click` (`https://` absolute URLs only)
- Fold / unfold headings
- Simple preview for folded headings
- Jump to headings from the outline panel
- Heading previews in the outline panel
- Outliner-like list editing (bullet / ordered / checklist)
- Rich theme switching
- Simple GUI theme editing and display settings adjustments
- File save / reload / minimum protection against external file modification conflicts

## Planned For Later

- Detailed Project / Book settings UI (author metadata, export settings, templates, and similar settings)
- Drag-and-drop chapter reordering and missing-file reconnect UI
- Direct EPUB / PDF generation from Nyoze itself, Vivliostyle integration, and press-ready fixed-page composition (book-wide export for external tools, the separate Page Viewer, and simple print/PDF saving via Web Book in Chrome or Edge are supported)
- More Windows Microsoft Store / MSIX related polish
- Tables and formulas
- Page layout editing
- Global previous / next chapter shortcuts
- Shortcut remapping
- Advanced conflict resolution UI

Lower-priority candidates:

- OS-wide `.md` file association
- `Open With` handoff
- Document loading by OS drag and drop

Nyoze uses a **library / workspace** concept similar to an Obsidian vault as the normal entry point. Libraries are created, registered, switched, renamed, and unregistered from **Manage Libraries** in the File menu. Only one library is active at a time. OS-wide file association and drag-and-drop loading are less central and are not near-term priorities.

## Official File Loading Path

In this beta, the officially supported loading paths are **Open File** (formerly `Load`) for standalone files and the File Explorer inside the active library / workspace. To use a folder as a library, register or create it from **File → Manage Libraries**.

- `Open File` (formerly `Load`): open a standalone `.md` / `.markdown` / `.txt` file
- `Shift + Open File`: create a new blank document in a new tab
- `File → Manage Libraries`: create, register, switch, rename, unregister, or reveal libraries

Not supported in beta:

- drag and drop
- `Open With`

These are not treated as official beta features yet.

## About `.txt` and `.md`

Nyoze can open and edit `.txt` documents as well as `.md`.

- `Open File` accepts `.md` / `.markdown` / `.txt`
- Existing `.txt` manuscripts can be used as-is
- Documents opened as `.txt` can be saved back as `.txt`
- Both `.md` and `.txt` are plain text; the main difference is whether the extension clearly indicates Markdown usage
- If frontmatter is present, it is still stored as plain text

However, older text editors and some Japanese writing tools may use Shift-JIS / CP932. In practical beta use, Nyoze supports UTF-8 only. Convert Shift-JIS / CP932 files to UTF-8 before using them.

Markdown syntax such as headings, bold, lists, and links will appear as plain symbols in a normal text editor.

For example, bold text shown nicely in Nyoze will look like `**like this**` in a plain text editor.

If frontmatter is present, it will also appear as plain text:

```text
---
title: Work Title
author: Author Name
---
```

So a practical workflow is:

- Try an existing `.txt` manuscript first
- Use `.md` for documents where you want Markdown intent to be explicit

## Frontmatter Handling

For supported keys, source-of-truth boundaries (standalone vs Project files), YAML limits, and what **Document Metadata** can edit, see [`docs/frontmatter-reference.md`](docs/frontmatter-reference.md) (Japanese, with English UI terms).

- frontmatter is kept as a raw prefix at the start of the document
- Safe round-tripping is prioritized
- This beta does not provide a general YAML editing UI
- **Document Metadata** can update only a limited set of keys explicitly
- Use **Source Mode** if you need to edit other frontmatter values

## Supported Environments

The `0.3.0-beta.1` GitHub pre-release targets are:

- macOS:
  - DMG for Apple Silicon (`arm64`)
  - DMG for Intel Mac (`x64`)
- Windows:
  - Microsoft Store version
  - GitHub Releases zip distribution (open `README.txt` after extraction, then run `Nyoze.exe`)
- Linux: no official package in the current beta

Windows is 64-bit (`x64`) only. 32-bit Windows is not supported in the current beta.
On Windows, `0.3.0-beta.1` is distributed as a GitHub pre-release. The Microsoft Store build remains at app version `0.2.1-beta.1` / package version `1.2.1.0` and does not yet contain the new features in this pre-release. Use the Store build for the currently published installation path, or the GitHub zip to observe the new features or when the Store is unavailable.

macOS has two variants:

- `arm64`: Apple Silicon Macs such as M1 / M2 / M3 / M4
- `x64`: Intel Macs

Installing the wrong one may prevent launch or cause significant slowdown.

On Linux, you can try the source with `npm install` / `npm run dev` / `npm run build`. However, this has not been validated as an official supported environment yet. If you are comfortable with Electron / Linux, you can also build your own Linux package with `electron-builder`, but no official Linux package is currently provided in this beta.

## Downloads and Installation

The current beta is intended to be used via **GitHub Releases or Microsoft Store distribution packages**.
You do not need to build from source for normal use.

Expected paths:

- macOS:
  - Apple Silicon Mac: download the `arm64` DMG
  - Intel Mac: download the `x64` DMG
- Windows:
  - Use the currently published Store build: install `Nyoze` from Microsoft Store
  - Try `0.3.0-beta.1`: download the GitHub Releases zip, extract it, read the bundled `README.txt`, and run `Nyoze.exe`

Installation notes:

- Outside the Microsoft Store version, you may see platform security warnings such as macOS Gatekeeper prompts or Windows Smart App Control / browser protection warnings
- On Windows, even the GitHub zip build may still be blocked by Smart App Control
- If you want the most reliable Windows installation path, prefer the Microsoft Store version
- In particular, the unsigned macOS DMG may trigger stronger first-launch warnings than a typical unidentified developer prompt
- For detailed installation steps and warning recovery paths, see [INSTALL.md](./INSTALL.md)

### About the Store Version

The Microsoft Store version is already available on Windows and should be the default path for normal use.

- Store releases go through review, so smaller low-urgency fixes may not be published immediately and may be bundled into a larger update
- The GitHub zip remains both as an alternative for environments where the Store cannot be used and as a path that may receive smaller beta fixes earlier than the Store version
- The Store version can be updated from the Library screen in the Microsoft Store app
- The Store version and the GitHub zip can coexist, but normal use should stick to one path when possible because they share the same settings
- Microsoft Store deep link: `ms-windows-store://pdp/?productid=9N52TD18DBCR`
- Web Store URL: [Nyoze on Microsoft Store](https://apps.microsoft.com/detail/9N52TD18DBCR)

Notes:

- `0.1.0-beta.1` / `0.1.0-beta.2` used an installer, but `0.1.1-beta.1` switched to zip distribution because of Smart App Control
- If you installed an older installer build, it will not update automatically to this version; extract and run the newer zip build instead
- However, depending on the environment, Smart App Control may still block the zip build as well. If that happens, use the Microsoft Store version instead of trying to force the zip path
- Windows builds are `x64` only

## Uninstall And User Data

- On macOS, remove `Nyoze.app` from `Applications`
- On Windows zip builds, deleting the extracted folder removes the app itself
- Old installer builds (`0.1.0-beta.1` / `0.1.0-beta.2`) should be uninstalled from Windows Settings > Apps
- In every case, settings and backups are not deleted automatically

Locations for settings and backups:

- macOS: `~/Library/Application Support/Nyoze/`
- Windows: `%APPDATA%\\Nyoze\\`

Typical contents:

- `settings.json`
- `backups/`
- `workspace-state.json`

Delete the `Nyoze` folder only if you want to remove everything completely. Leave it in place if you want to preserve settings and backups. For more detail, see [INSTALL.md](./INSTALL.md).

## If You Want To Try From Source

This is mainly for Linux users or people who want to run development builds locally.

Prerequisites:

- Node.js 20 or later recommended
- npm 10 or later recommended

Install:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Create packages:

```bash
npm run package
```

To build explicit macOS architectures:

```bash
npm run package:mac:arm64
npm run package:mac:x64
```

To build the Windows `x64` zip explicitly:

```bash
npm run package:win:x64
```

Packages are written to `release/<version>/`. In the current beta, official distribution targets are macOS DMG and Windows zip only. Linux packages are not officially distributed yet. `npm run package` normally builds the package for the current environment. macOS DMGs include the architecture in the file name. Windows zip output includes a folder like `Nyoze-Windows-<version>-x64/` so extracted files stay organized.

- `Nyoze-Mac-<version>-arm64-Installer.dmg`
- `Nyoze-Mac-<version>-x64-Installer.dmg`
- `Nyoze-Windows-<version>-x64.zip`

## Known Limitations

- The official file loading paths are toolbar `Open File` and the File Explorer inside the active library
- Folders are registered as libraries from `File → Manage Libraries`
- drag and drop is not supported
- `Open With` is not supported
- OS-wide `.md` association is not supported
- No official Linux package is provided in the current beta
- No general frontmatter editing UI
- Complex YAML editing is expected to be done in `Source Mode`
- No advanced conflict resolution or merge UI
- Code block syntax highlighting is WYSIWYG-only; unsupported or unspecified languages fall back to plain display
- Document links open externally with `Cmd/Ctrl + Click`; normal click does not open them
- External open is limited to absolute `https://` URLs without credentials; `http://`, `mailto:`, `tel:`, relative links, and document anchors are not opened from normal editing
- When starting Japanese IME input immediately after ruby text or explicit TCY, some environments may rarely stall on the second typed character right after the first one goes through; pressing `Escape` discards the unfinished input and returns to normal editing
- On some Windows environments using AMD GPUs with Chromium-based rendering, the I-beam cursor over the editor or `Source Mode` may appear white and hard to see. In that case, enable `View Settings > Document Theme > Use arrow pointer in editor` as a workaround for the editor area
- Around 100,000 characters, some environments may become slow for input or rendering; vertical writing, visible ruby, search ON, and Japanese IME input make this more likely
- If performance feels heavy, first try turning ruby display off, using `Paragraph Plain`, or splitting the manuscript into separate files by chapter
- Opening and immediately saving in beta is not guaranteed to preserve the exact original Markdown spelling; content may be normalized to Nyoze’s Markdown representation
- Typical examples not fully preserved in beta include GFM tables, reference-style links / link definitions, footnotes, definition lists, complex lists / blockquotes, code fence marker details / blank lines, and softbreak / hardbreak spelling differences
- `Source Mode` is not a raw-save-only path in beta; Apply / Save still pass through Nyoze’s parser / serializer, so unsupported constructs or spelling differences may be normalized
- In practical beta use, UTF-8 is the only supported encoding; files that cannot be read as UTF-8 are not opened for normal editing. LF / CRLF are preserved where possible, but full mixed-EOL / BOM / multi-encoding round-trip is post-beta scope
- This beta prioritizes stability and manuscript safety, so some flows and polish are still rough

## Documentation

- Official site and task-oriented guides: [Nyoze](https://cat-left-paw.github.io/nyoze/)
- Manual: [MANUAL.md](./MANUAL.md)
- Install and first launch: [INSTALL.md](./INSTALL.md)
- Privacy policy: [PRIVACY.md](./PRIVACY.md)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- Beta release notes: [RELEASE_NOTES.md](./RELEASE_NOTES.md)

Known beta limitations, distribution notes, and reporting notes for testers are primarily documented in `RELEASE_NOTES.md`. Version history is in `CHANGELOG.md`, and installation / first-launch guidance is in `INSTALL.md`.

Windows distribution policy:

- Prefer the Microsoft Store version for normal use
- Keep the GitHub Releases zip as an alternative distribution path when the Store is unavailable
- Smaller beta fixes may appear in the GitHub zip earlier, while Store updates may be bundled into larger reviewed releases
- The Store version and the GitHub zip can coexist, but they share settings. Current builds also prevent simultaneous multi-launch across them

## License

Nyoze is distributed under the GNU Affero General Public License v3.0 or later. See [LICENSE](./LICENSE) for details.

Copyright (C) 2026 猫乃 左手 (cat-left-paw) and Nyoze Project.

Official releases are distributed from `cat-left-paw/nyoze`. If you redistribute a modified version, keep copyright and license notices intact and make sure it is not confused with the official release. See [NOTICE](./NOTICE) for details.

## Feedback

The beta includes in-app feedback paths:

- Help → `フィードバックを送る`
- `View Settings` → `サポート` → `フィードバックを送る`

For bug reports, it helps to include at least:

- OS
- The version you used
- Reproduction steps

See [RELEASE_NOTES.md](./RELEASE_NOTES.md) before reporting.

## Support

Nyoze is developed as a free and open-source application.
If you enjoy it, you can support development here:

[Buy me a coffee](https://buymeacoffee.com/hidarite)

Support is completely optional. There are no supporter-only features and no paid feature unlocks.
