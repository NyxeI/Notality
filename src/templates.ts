// Base-Datei und Notiz-Vorlage (pure).
import { spaltenBreiten, tabellenBreite } from "./spalten.ts";

/** Namen der Ansichten in der Fach-Base (Reihenfolge wie dort). */
export const ANSICHTEN = ["Nach Thema", "Zuletzt bearbeitet", "Neueste", "Alphabetisch", "Nach Stufe", "Abi-relevant", "Ohne Properties"] as const;

/** Tag, den „Abi-relevant“ zeigt (ohne #). */
export const ABI_TAG = "Abi_Relevant";

/**
 * Eine Base für alle Fach-Hubs: Eingebettet im Hub zeigt sie alle Notes im Ordner des Hubs (samt Unterordnern),
 * direkt geöffnet alles unter dem Ordner der Base. Der Ordner-Filter wirkt auch für Notes ohne Properties.
 */
export function fachBase(abiTag = ABI_TAG): string {
  const mine = `        - file.inFolder(this.file.folder)
        - file.path != this.file.path
        - not:
            - file.hasProperty("kanban-plugin")
            - file.hasProperty("excalidraw-plugin")
`;
  const sortiere = (...s: [string, "ASC" | "DESC"][]) => s.map(([p, d]) => `      - property: ${p}\n        direction: ${d}\n`).join("");
  const view = (name: string, order: string[], sort: string, extra = "", group = "") =>
    `  - type: table
    name: ${name}
    rowHeight: medium
    columnSize:
${Object.entries(spaltenBreiten(order, tabellenBreite(false)))
  .map(([k, w]) => `      ${k}: ${w}`)
  .join("\n")}
    filters:
      and:
${mine}${extra}${group}    order:
${order.map((o) => `      - ${o}`).join("\n")}
    sort:
${sort}`;
  const group = (prop: string, dir = "ASC") => `    groupBy:\n      property: ${prop}\n      direction: ${dir}\n`;
  const [aThema, aZuletzt, aNeu, aAlpha, aStufe, aAbi, aOhne] = ANSICHTEN;
  const views = [
    view(aThema, ["file.name", "unterthema", "file.tags", "geaendert"], sortiere(["unterthema", "ASC"], ["file.name", "ASC"]), "", group("thema")),
    view(aZuletzt, ["file.name", "thema", "file.tags", "geaendert"], sortiere(["geaendert", "DESC"], ["file.mtime", "DESC"])),
    view(aNeu, ["file.name", "thema", "file.tags", "erstellt"], sortiere(["erstellt", "DESC"], ["file.ctime", "DESC"])),
    view(aAlpha, ["file.name", "thema", "unterthema", "file.tags"], sortiere(["file.name", "ASC"])),
    view(aStufe, ["file.name", "thema", "geaendert"], sortiere(["thema", "ASC"], ["file.name", "ASC"]), "", group("stufe", "DESC")),
    view(aAbi, ["file.name", "thema", "file.tags"], sortiere(["thema", "ASC"], ["file.name", "ASC"]), `        - file.hasTag("${abiTag}")\n`),
    view(aOhne, ["file.name", "file.folder", "file.mtime"], sortiere(["file.mtime", "DESC"]), `        - not:\n            - file.hasProperty("typ")\n`),
  ];
  return `# Notality: eine Base für alle Fach-Hubs (eingebettet mit ![[Themen.base#Nach Thema]]).
# Zeigt alle Notes im Ordner des Hubs. Ansicht über das Dropdown oder das Themen-Panel wechseln.
properties:
  file.name:
    displayName: Note
  file.tags:
    displayName: Tags
  file.folder:
    displayName: Ordner
  file.mtime:
    displayName: Dateidatum
  note.thema:
    displayName: Thema
  note.unterthema:
    displayName: Unterthema
  note.stufe:
    displayName: Stufe
  note.erstellt:
    displayName: Erstellt
  note.geaendert:
    displayName: Geändert
filters:
  and:
    - file.ext == "md"
views:
${views.join("")}`;
}

/** Eingebaute Vorlage für neue Notes; die Properties setzt das Plugin danach selbst. */
export const DEFAULT_VORLAGE = "\n";

export interface VorlagenWerte {
  titel: string;
  fach: string;
  thema: string;
  datum: string;
}

/** Ersetzt {{titel}}, {{fach}}, {{thema}} und {{datum}} (bzw. {{date}}, {{title}} wie bei den Core-Vorlagen). */
export function renderVorlage(vorlage: string, v: VorlagenWerte): string {
  return vorlage
    .replace(/\{\{(titel|title)\}\}/g, () => v.titel)
    .replace(/\{\{fach\}\}/g, () => v.fach)
    .replace(/\{\{thema\}\}/g, () => v.thema)
    .replace(/\{\{(datum|date)\}\}/g, () => v.datum);
}
