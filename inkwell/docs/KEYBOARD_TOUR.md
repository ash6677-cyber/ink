# INKWELL without a mouse

A full tour of the app using only the keyboard. Every step here works today;
this document is the §24 acceptance walkthrough, kept honest by the harnesses
that drive the same paths (`palette-search-check.mjs`, `robustness-check.mjs`,
`focus-mode-check.mjs`).

The one key to remember is **Ctrl+K** (⌘K on a Mac): the command palette is
the keyboard's front door to everything — screens, scenes, characters,
Almanac entries, and the words of the book itself.

## Getting anywhere

| You want | Press |
| --- | --- |
| The palette | `Ctrl+K` |
| Any screen (Projects, Editor, Read, Almanac, Playground, Planning, Cover Studio, Series, Stats) | `Ctrl+K`, type its name, `Enter` |
| A scene by title | `Ctrl+K`, type the title, `Enter` |
| A scene by *what it says* | `Ctrl+K`, type three or more words from the prose, pick from "In the prose", `Enter` — it opens with the match highlighted |
| A character card | `Ctrl+K`, type the name, `Enter` |
| Settings | `Ctrl+,` |
| Collapse or grow the sidebar | `Ctrl+B` |

Within the palette: `↑`/`↓` move, `Enter` chooses, `Esc` closes.
All six of the shortcuts above can be rebound in Settings → Shortcuts —
navigate to the row, `Tab` to **Change**, press the new keys.

## Around a screen

`Tab` and `Shift+Tab` walk every interactive control; the focus ring is
visible on all of them. The nav rail is a list of links — `Tab` onto one,
`Enter` follows it. Cards and list rows are buttons or links throughout, so
`Enter` opens them.

Dialogs, menus, and drawers trap focus while open (Radix primitives),
`Esc` closes them, and focus returns to what opened them. Dropdown menus
and selects follow the platform conventions: arrows move, `Enter` picks,
`Esc` backs out.

## Writing

| In the editor | Press |
| --- | --- |
| Focus mode on/off | `Ctrl+.` |
| Leave focus mode | `Esc` |
| Find in this scene | `Ctrl+F`, then `Enter` / `Shift+Enter` for next/previous, `Esc` to close |
| Search the whole manuscript | `Ctrl+Shift+F` |
| Bold / italic and the rest | The standard editing keys (TipTap defaults: `Ctrl+B`, `Ctrl+I`, …) |

The prose itself is a contenteditable document: every arrow, selection and
editing key behaves as in any text editor.

## Reading

In the page-flip reader: `→` / `Page Down` / `Space` turn forward,
`←` / `Page Up` turn back.

## Character chat

`Enter` sends; `Shift+Enter` makes a new line instead.

## The desktop app

The Windows build adds the native menu bar with its own accelerators:
`Ctrl+N` new project, `Ctrl+I` import a library file, `Ctrl+Shift+E`
export the whole library, `Ctrl+Q` save and quit. `Alt` opens the menus
themselves, as on any Windows application.

## Known boundaries

- The Cover Studio's drag-to-frame gesture is pointer-only by design; the
  sliders beside it (zoom, horizontal, vertical, rotation) do the same job
  and are plain range inputs — arrows adjust them.
- The outline board's drag-to-reorder likewise has button/menu equivalents for
  every operation.
