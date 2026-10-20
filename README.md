# Notality

An [Obsidian](https://obsidian.md) plugin for **topic notes per subject** in a vault that is organised by folders. It keeps your existing structure and adds what is tedious by hand:

```
<your folder>/<Subject>/<Topic>[/<Subtopic>]/<Title>.md
```

- a quick dialog **subject → topic → title** that files the new note into the right folder (and creates new topic folders),
- **properties** on every note (`fach`, `thema`, `tags`, `erstellt`, `geaendert` …), derived from the folder,
- inline `#tags` you type are **copied into the `tags` property** automatically,
- one [Bases](https://help.obsidian.md/bases) file with sortable views that is embedded at the top of every **subject hub**.

It is the sibling of [Schul-Tagesnotes](https://github.com/NyxeI/obsidian-schul-tagesnotes), which uses one dated note per lesson instead. Notality needs no migration: notes stay where they are.

> The interface is available in **English and German** and follows Obsidian's language setting. Property names (`fach`, `thema`, `erstellt` …) are the same in every language, so switching the language never changes your notes.

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
- **Hub overview.** One base (`Themen.base` next to your subjects) serves all subject hubs: embedded in a hub it shows all notes in that hub's folder. Views: *By topic*, *Recently edited*, *Newest*, *Alphabetical*, *By grade*, *Exam-relevant* (tag `Abi_Relevant`), *Without properties* (German names when created in German).
- **Existing notes.** A command adds the properties to all existing notes after a confirmation. Only the frontmatter changes, and the file's modification date is restored.
- **Control panel and toolbar.** A side panel follows the active note (subject, topic, tags, dates, previous/next note, view switcher, topic colours, table columns, row height). A slim toolbar sits on top of hubs and topic notes.
- **Readable tables.** Column widths fit the note width; topic headings are coloured and larger (right-click a heading to pick a colour).
- **Banners.** New notes inherit the banner of their topic note (`A Auge/A Auge.md`) or of the subject hub.

## Installation

The plugin is not in the community catalogue. Install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable *BRAT* from the community plugins.
2. Run *BRAT: Add a beta plugin for testing* and enter `NyxeI/Notality`.
3. Enable *Notality* under *Settings → Community plugins*.

## Quick start

1. Open *Settings → Notality* and choose the **folder that holds your subjects** (e.g. `School`). There is no default folder; until you set one, the plugin does nothing. Optionally: subjects whose hub is not `<Folder>/<Folder>.md`, ignored folders, grade folders.
2. Assign hotkeys under *Settings → Hotkeys* (search "Notality"), e.g.
   - `Ctrl+Alt+N`: **New topic note …**,
   - `Ctrl+Alt+Shift+N`: **New topic note in the current note's subject …**.
3. Run **Set up subject hubs** to embed the overview into every hub. Your link lists stay below it.
4. Optional: **Add properties to all existing notes**. Make a backup first.

## Commands

| Command (English / German) | What it does |
|---|---|
| New topic note … / Neue Themennote … | Dialog subject → topic → title |
| … in the current note's subject / … im Fach der aktuellen Note | Skips the subject step; the current topic is on top |
| … in the current note's topic / … im Thema der aktuellen Note | Straight to the title |
| Sync properties of the current note now / Properties der aktuellen Note jetzt abgleichen | Sync the active note now |
| Add properties to all existing notes / Properties für alle vorhandenen Notes nachrüsten | Add properties to all notes (with confirmation) |
| Create/update base file / Base-Datei anlegen/aktualisieren | Create or update `Themen.base` (keeps columns chosen in the panel and the base's language) |
| Set up subject hubs / Fach-Hubs einrichten | Embed the base at the top of every subject hub (with confirmation) |
| Open topic panel / Themen-Panel öffnen | Open the side panel |
| Toggle display / Anzeige umschalten | Display toggles |

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

Copyright (C) 2026 Nyxel

This program is free software: you can redistribute it and/or modify it under the terms of the [GNU General Public License, version 3](LICENSE), as published by the Free Software Foundation.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
