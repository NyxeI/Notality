# Changelog

## 0.1.1

- License changed from MIT to GPL-3.0.

## 0.1.0

First version.
- Dialog subject → topic → title for new topic notes; new topic folders are created on the fly.
- Properties from the folder (`typ`, `fach`, `thema`, `unterthema`, `stufe`) plus `tags`, `erstellt`, `geaendert`.
- Automatic sync while editing: finished inline tags into `tags` (a tag with the cursor right behind it waits), tags deleted from the text are removed again, `geaendert`, folder properties after moving a note.
- `Themen.base` with seven views, embedded into subject hubs by a command.
- Command to add properties to existing notes (keeps the modification date).
- Side panel, toolbar, topic colours, column and row-height controls.
