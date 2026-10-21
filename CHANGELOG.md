# Changelog

## 0.2.1

- Arrow keys in the dialogs: `←` goes back (navigator levels; new note: title → topic → subject), `→` works like `Enter`, `Shift+→` like `Shift+Enter` in the navigator. With text in the field the arrows move the cursor until it is at the start or end. `Backspace` in the empty field also goes back in the new-note dialog.

## 0.2.0

- New command **Navigate: open subject, topic or note …** (and ribbon icon): pick a subject, then `Enter` goes into its topics and subtopics, `Shift+Enter` opens the hub or a topic's folder note; `Enter` on a note opens it. `Backspace` in the empty field goes back, `Ctrl+Enter` opens in a new tab, and typing finds subtopics and notes further down.

## 0.1.4

- Fixed remaining stutter while typing: the note bar now sits between the tab header and the content, so the stylesheet no longer needs `:has()`, which made every keystroke noticeably slower.

## 0.1.3

- Fixed stutter: the note bar is only rebuilt when its content changes, instead of on every layout change, file open and edit.

## 0.1.2

- Interface in English and German, following Obsidian's language. Property names stay the same.
- No default folder any more: choose the folder that holds your subjects in the settings (with folder suggestions). Grade folders and subject overrides are empty by default.
- The base is created next to the subject folders unless a path is set; an existing base keeps the language of its view names.

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
