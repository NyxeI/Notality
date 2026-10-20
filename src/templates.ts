// Base-Datei und Notiz-Vorlage (pure).
import { aktuelleSprache, alleSprachen, t, type Sprache, type TextKey } from "./i18n.ts";
import { spaltenBreiten, tabellenBreite } from "./spalten.ts";

/** Schlüssel der Ansichten in der Fach-Base (Reihenfolge wie dort); die Namen hängen von der Sprache ab. */
export const ANSICHTEN = ["thema", "zuletzt", "neueste", "alpha", "stufe", "abi", "ohne"] as const;
export type AnsichtKey = (typeof ANSICHTEN)[number];

/** Name einer Ansicht in der aktuellen (oder angegebenen) Sprache. */
export function ansichtName(key: AnsichtKey, s: Sprache = aktuelleSprache()): string {
  return t(`v.${key}` as TextKey, {}, s);
}

/** Sprache, in der eine vorhandene Base erzeugt wurde (an den Ansichtsnamen erkannt); null = unbekannt. */
export function baseSprache(text: string): Sprache | null {
  for (const s of ["de", "en"] as Sprache[]) if (text.includes(`name: ${ansichtName("thema", s)}\n`)) return s;
  return null;
}

/** Schlüssel zu einem Ansichtsnamen in irgendeiner Sprache; null = keine Plugin-Ansicht. */
export function ansichtKey(name: string): AnsichtKey | null {
  return ANSICHTEN.find((k) => alleSprachen(`v.${k}` as TextKey).includes(name)) ?? null;
}

/** Tag, den „Abi-relevant“ zeigt (ohne #). */
export const ABI_TAG = "Abi_Relevant";

/**
 * Eine Base für alle Fach-Hubs: Eingebettet im Hub zeigt sie alle Notes im Ordner des Hubs (samt Unterordnern),
 * direkt geöffnet alles unter dem Ordner der Base. Der Ordner-Filter wirkt auch für Notes ohne Properties.
 */
export function fachBase(baseName = "Themen.base", s: Sprache = aktuelleSprache(), abiTag = ABI_TAG): string {
  const tx = (key: TextKey, vars: Record<string, string> = {}) => t(key, vars, s);
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
  const [aThema, aZuletzt, aNeu, aAlpha, aStufe, aAbi, aOhne] = ANSICHTEN.map((k) => ansichtName(k, s));
  const views = [
    view(aThema, ["file.name", "unterthema", "file.tags", "geaendert"], sortiere(["unterthema", "ASC"], ["file.name", "ASC"]), "", group("thema")),
    view(aZuletzt, ["file.name", "thema", "file.tags", "geaendert"], sortiere(["geaendert", "DESC"], ["file.mtime", "DESC"])),
    view(aNeu, ["file.name", "thema", "file.tags", "erstellt"], sortiere(["erstellt", "DESC"], ["file.ctime", "DESC"])),
    view(aAlpha, ["file.name", "thema", "unterthema", "file.tags"], sortiere(["file.name", "ASC"])),
    view(aStufe, ["file.name", "thema", "geaendert"], sortiere(["thema", "ASC"], ["file.name", "ASC"]), "", group("stufe", "DESC")),
    view(aAbi, ["file.name", "thema", "file.tags"], sortiere(["thema", "ASC"], ["file.name", "ASC"]), `        - file.hasTag("${abiTag}")\n`),
    view(aOhne, ["file.name", "file.folder", "file.mtime"], sortiere(["file.mtime", "DESC"]), `        - not:\n            - file.hasProperty("typ")\n`),
  ];
  return `# ${tx("b.kopf1", { name: baseName, ansicht: aThema })}
# ${tx("b.kopf2")}
properties:
  file.name:
    displayName: ${tx("b.note")}
  file.tags:
    displayName: ${tx("sp.tags")}
  file.folder:
    displayName: ${tx("b.ordner")}
  file.mtime:
    displayName: ${tx("b.dateidatum")}
  note.thema:
    displayName: ${tx("sp.thema")}
  note.unterthema:
    displayName: ${tx("sp.unterthema")}
  note.stufe:
    displayName: ${tx("sp.stufe")}
  note.erstellt:
    displayName: ${tx("sp.erstellt")}
  note.geaendert:
    displayName: ${tx("sp.geaendert")}
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
