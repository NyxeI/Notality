# Themen-Notes

An [Obsidian](https://obsidian.md) plugin for **topic notes per subject** in a vault that is organised by folders. It keeps your existing structure and adds what is tedious by hand:

```
01-Schule/<Subject>/<Topic>[/<Subtopic>]/<Title>.md
```

- a quick dialog **subject → topic → title** that files the new note into the right folder (and creates new topic folders),
- **properties** on every note (`fach`, `thema`, `tags`, `erstellt`, `geaendert` …), derived from the folder,
- inline `#tags` you type are **copied into the `tags` property** automatically,
- one [Bases](https://help.obsidian.md/bases) file with sortable views that is embedded at the top of every **subject hub**.

It is the sibling of [Schul-Tagesnotes](https://github.com/schildi208-lgtm/obsidian-schul-tagesnotes), which uses one dated note per lesson instead. Themen-Notes needs no migration: notes stay where they are.

> The plugin's interface is in **German** and the defaults fit a German school vault (`01-Schule/<Fach>/…`). Folders, subjects and the base path can be changed in the settings. Command names below are given in German with a translation.

## Features

- **New note in three steps.** Pick a subject (recently used first, with note count), a topic folder (recently used first, nested topics shown as paths) and type a title. A title that already exists in that folder opens the existing note. Typing a new topic creates its folder; `Dramen/Faust` creates a subtopic.
- **Properties from the folder.** Every note gets:

  | Property | Value |
  |---|---|
  | `typ` | `themennote` |
  | `fach` | link to the subject hub, e.g. `"[[Physik]]"` |
  | `thema` | top-level topic folder |
  | `unterthema` | rest of the folder path (only for nested topics) |
  | `stufe` | grade folder directly under the subject (`11`, `12-1` …), configurable |
  | `tags` | inline tags from the text plus your own |
  | `erstellt` / `geaendert` | created / last edited (`YYYY-MM-DDTHH:mm`) |

- **Automatic sync while you write.** When you edit a note, finished inline `#tags` are added to `tags` (not while you are still typing one), tags you delete from the text disappear from `tags` again, and `geaendert` is set to now (at most once a minute). Moving a note to another folder updates `fach`, `thema` and `unterthema`. Notes you don't touch are never changed, and the plugin never edits the text of a note.
- **Hub overview.** One base (`01-Schule/Themen.base`) serves all subject hubs: embedded in a hub it shows all notes in that hub's folder. Views:
  - *Nach Thema* (grouped by topic), *Zuletzt bearbeitet* (last edited), *Neueste* (newest), *Alphabetisch*, *Nach Stufe* (by grade), *Abi-relevant* (tag `Abi_Relevant`), *Ohne Properties* (notes still without properties).
- **Existing notes.** A command adds the properties to all existing notes after a confirmation. Only the frontmatter changes, and the file's modification date is restored.
- **Control panel and toolbar.** A side panel follows the active note (subject, topic, tags, dates, previous/next note, view switcher, topic colours, table columns, row height). A slim toolbar sits on top of hubs and topic notes.
- **Readable tables.** Column widths fit the note width; topic headings are coloured and larger (right-click a heading to pick a colour).
- **Banners.** New notes inherit the banner of their topic note (`A Auge/A Auge.md`) or of the subject hub.

## Installation

The plugin is not in the community catalogue. Install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable *BRAT* from the community plugins.
2. Run *BRAT: Add a beta plugin for testing* and enter `schildi208-lgtm/obsidian-themen-notes`.
3. Enable *Themen-Notes* under *Settings → Community plugins*.

## Quick start

1. Check *Settings → Themen-Notes*: area folder (`01-Schule`), subjects whose hub is not `<Folder>/<Folder>.md`, ignored folders.
2. Assign hotkeys under *Settings → Hotkeys* (search "Themen-Notes"), e.g.
   - `Ctrl+Alt+N`: **Neue Themennote …** (new topic note),
   - `Ctrl+Alt+Shift+N`: **Neue Themennote im Fach der aktuellen Note …** (in the current note's subject).
3. Run **Fach-Hubs einrichten** (set up subject hubs) to embed the overview into every hub. Your link lists stay below it.
4. Optional: **Properties für alle vorhandenen Notes nachrüsten** (add properties to existing notes). Make a backup first.

## Commands

| Command | What it does |
|---|---|
| Neue Themennote … | Dialog subject → topic → title |
| Neue Themennote im Fach der aktuellen Note … | Skips the subject step; the current topic is on top |
| Neue Themennote im Thema der aktuellen Note … | Straight to the title |
| Properties der aktuellen Note jetzt abgleichen | Sync the active note now |
| Properties für alle vorhandenen Notes nachrüsten … | Add properties to all notes (with confirmation) |
| Base-Datei anlegen/aktualisieren | Create or update `Themen.base` (keeps columns chosen in the panel) |
| Fach-Hubs einrichten … | Embed the base at the top of every subject hub (with confirmation) |
| Themen-Panel öffnen | Open the side panel |
| Anzeige umschalten: … | Display toggles |

## Documentation

| | |
|---|---|
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | Settings, properties, sync rules, views |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules and data flow |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Build, tests, test vault, releases |
| [CHANGELOG.md](CHANGELOG.md) | Versions |

## Safety

- The plugin only writes frontmatter, never the text of a note (exception: *Fach-Hubs einrichten* inserts the embed into hubs after you confirm).
- Automatic sync only reacts to notes you are editing right now; re-indexing on startup changes nothing.
- Bulk actions show what they will do and ask first. Back up your vault before running them.

## License

[MIT](LICENSE) © Nyxel
