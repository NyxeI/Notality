# Architecture

Pure modules contain all decisions and are tested with `node --test`; Obsidian-bound modules only collect data and apply plans.

## Pure modules (`src/`)

| Module | Purpose |
|---|---|
| `config.ts` | Types `Bereich`, `Fach`, `FachOverride`; override parsing; file-name sanitising |
| `pfad.ts` | Path → `Einordnung` (area, subject, topic, subtopic, grade, hub?); subject detection; topic list with counts; folder properties and diffs |
| `tags.ts` | Tag lists, inline tags from the metadata cache, `syncTags` |
| `zeit.ts` | Timestamps `YYYY-MM-DDTHH:mm`, parsing, short relative dates |
| `props.ts` | `propPlan`: everything that should change in a note's frontmatter; date line detection |
| `templates.ts` | `fachBase()` (YAML of `Themen.base`), view names, template placeholders |
| `spalten.ts` | Panel-selectable columns and widths |
| `bases.ts` | `baseUpdate`: compare target and current base, keep panel edits |
| `hubs.ts` | Embed planning, view switching in hubs |
| `nachruesten.ts` | Plan and dry-run report for existing notes |
| `navigation.ts` | Navigator: topics and notes of one level, deeper entries, search order |
| `ansicht.ts` | Display settings, topic colours, previous/next in folder |
| `defaults.ts` | Settings, defaults, `mergeSettings`, `basisPfad` |
| `i18n.ts` | German and English texts, `t()`, language from Obsidian (`getLanguage()`) |

## Obsidian modules

| Module | Purpose |
|---|---|
| `main.ts` | Plugin: commands, events, structure cache, note creation, bulk actions |
| `sync.ts` | Debounced sync after edits/renames with loop protection |
| `modals.ts` | Subject, topic and title dialogs; navigator (`NavModal`); confirmation dialog |
| `anzeige.ts` | Body classes, toolbar, base editing helper |
| `gruppen.ts` | Marks embeds of the base (`.themen-base`) and colours topic group headings |
| `panel.ts` | Side panel |
| `settings.ts` | Settings tab |

## Data flow

1. **Structure**: `main.struktur()` reads the area roots once and caches subjects; any create/delete/rename resets the cache.
2. **New note**: dialogs → `erstelleNote(folder, title)` → `vault.create` → `propPlan` → `processFrontMatter` → `sync.merke()` (remember content so the next change event is not an edit) → open in source mode.
3. **Sync**: `metadataCache.on("changed")` / `vault.on("rename")` → `Sync.planen` (1 s debounce per file, reasons merged) → `Sync.pruefe`:
   - edit = file modified < 15 s ago **and** content key changed (content without the `geaendert` line);
   - `propPlan` → write only if the plan is non-empty → store the new content key.
4. **Bulk**: `nachruestPlan()` / `hubPlan()` produce plans; commands confirm, then apply. Retrofit pauses the sync and restores `mtime` with `fs.utimes`.
