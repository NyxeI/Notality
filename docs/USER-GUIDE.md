# User guide

## Folder model

```
<area root>/<Subject>/<Subject hub>.md
<area root>/<Subject>/[<Grade>/]<Topic>[/<Subtopic>…]/<Title>.md
```

- **Area** (*Bereich*): a root folder with one folder per subject. Defaults: `01-Schule` (property `fach`, on) and `04-Projekte` (property `projekt`, off).
- **Subject** (*Fach*): every direct subfolder of the area root, except ignored folders. Its hub is `<Folder>/<Folder>.md`; exceptions go into *Abweichende Fächer* as `Folder | Name | Hub`, e.g. `Politik und Gesellschaft | Politik und Gesellschaft | PuG`.
- **Grade** (*Stufe*): a folder directly under the subject that matches the regular expression *Stufen-Ordner* (default `^(11|12|13)(-[12])?$`). It becomes the property `stufe`, and the next folder is the topic.
- **Topic** (*Thema*): the first folder below the subject (or grade); deeper folders become `unterthema` (`Maria Stuart`, `A/B`).
- **Ignored folders** (*Ignorierte Ordner*, compared case-insensitively): never subjects or topics; notes inside them are left alone. Default: `attachments`, `AufgabenFiles`, `Ink`, `Excalidraw`, `Drawing`, `Writing`.
- Notes with `kanban-plugin` or `excalidraw-plugin` in their frontmatter are always left alone.

## Properties

| Property | Set when | Value |
|---|---|---|
| `typ` | always | `themennote` |
| `fach` (or the area's property) | always | `"[[Hub]]"`, or the plain subject name when it has no hub |
| `thema`, `unterthema`, `stufe` | always; removed when not applicable | from the folder path |
| `tags` | inline tags appear | inline tags are appended; existing entries stay |
| `erstellt` | missing | earliest of file creation date, modification date and a date line (`DD-MM-YYYY` / `DD.MM.YYYY`) in the first lines of the note |
| `geaendert` | the note is edited | now, minute precision |

Other properties (e.g. `banner`) are never touched.

## Automatic sync

The sync runs about a second after Obsidian has re-read a changed note.

- It only counts as an **edit** if the file was modified in the last 15 seconds and its content (ignoring the `geaendert` line) differs from what the plugin saw last. Re-indexing on startup or sync tools touching old files therefore change nothing.
- After an edit, the note gets all properties from the table above. A note that had no properties gets them on its first edit.
- After **moving or renaming**, notes with `typ: themennote` get updated folder properties (`geaendert` stays).
- *Gelöschte #tags auch aus „tags“ entfernen* (off by default): tags that disappear from the text are removed from `tags` as well, but only tags that the plugin saw in the text during this session. Tags you typed into the property yourself are never removed.
- Switch the sync off with *Properties automatisch abgleichen*.

## New notes

- **Neue Themennote …** (`Ctrl+Alt+N` suggested): subject → topic → title.
  - Topic step: *Ohne Thema* puts the note directly into the subject folder; typing a name that does not exist offers *Neues Thema: …* (with `/` for subtopics).
  - Title step: the target path is shown; matching notes in that folder can be opened instead.
- **… im Fach der aktuellen Note** (`Ctrl+Alt+Shift+N` suggested): starts at the topic step, the current topic first.
- **… im Thema der aktuellen Note**: straight to the title.
- **Template** (*Vorlage*): optional note path. Placeholders `{{titel}}`/`{{title}}`, `{{fach}}`, `{{thema}}`, `{{datum}}`/`{{date}}` (date format of the core Templates plugin). Frontmatter in the template is kept; its tags are merged.
- **Banner**: with *Banner für neue Notes* on, the note gets the banner of the closest folder note (`Topic/Topic.md`) or of the subject hub.

## The base

`Themen.base` (path in the settings) has a per-view filter `file.inFolder(this.file.folder)`. Embedded in a hub it shows every note in the hub's folder and below, without the hub itself. Opened directly, it shows everything below the base's own folder.

| View | Content |
|---|---|
| Nach Thema | grouped by `thema`, sorted by subtopic and name |
| Zuletzt bearbeitet | by `geaendert`, newest first |
| Neueste | by `erstellt`, newest first |
| Alphabetisch | by name |
| Nach Stufe | grouped by `stufe` |
| Abi-relevant | notes with the tag `Abi_Relevant` |
| Ohne Properties | notes without `typ` – candidates for *nachrüsten* |

**Base-Datei anlegen/aktualisieren** brings the file up to date; columns, widths and row height chosen in the panel are kept per view.

**Fach-Hubs einrichten** inserts this below the frontmatter (and below a first line that only holds tags):

```markdown
## Übersicht
![[Themen.base#Nach Thema]]
```

Hubs that already embed the base are skipped. Switch the view with the panel chips or the base's view menu.

## Adding properties to existing notes

**Properties für alle vorhandenen Notes nachrüsten …** lists how many notes per subject will change and asks first. Hubs and Kanban/Excalidraw notes are skipped. Only the frontmatter changes, and on desktop the file's modification date is restored, so `geaendert` and *Zuletzt bearbeitet* stay true. `erstellt` can only be as good as the dates the files still have.

## Panel and toolbar

- **Panel** (*Themen-Panel öffnen*):
  - In a note: subject, topic and position in the folder, tags, dates, buttons for hub, previous/next note, new note in this topic or subject.
  - In a hub: counts, view chips, topic colours, columns per view.
  - Everywhere: display toggles, row height, heading size, toolbar buttons, recently edited notes.
- **Toolbar**: hub button, previous/next note in the same folder, new note in this topic; display toggles on the right.
