// Pfad → Fach, Thema, Unterthema, Stufe (pure). Die Ordnerstruktur ist die einzige Quelle; Properties folgen ihr.
import type { Bereich, Fach, FachOverride } from "./config.ts";

export interface Einordnung {
  bereich: Bereich;
  fach: Fach;
  /** Oberster Themenordner (ohne Stufe), null = Note liegt direkt im Fach. */
  thema: string | null;
  /** Restlicher Ordnerpfad unter dem Thema, z. B. "Maria Stuart". */
  unterthema: string | null;
  /** Stufen-Ordner direkt unter dem Fach ("11", "12-1"), falls vorhanden. */
  stufe: string | null;
  /** Die Note ist der Hub des Fachs (<Fach>/<Hub>.md). */
  istHub: boolean;
}

export interface Struktur {
  bereiche: Bereich[];
  /** Fächer je Bereichs-ID. */
  faecher: Map<string, Fach[]>;
  /** Ordnernamen, die nie Themen sind (attachments …), Vergleich ohne Groß-/Kleinschreibung. */
  ignoriert: string[];
  /** Erkennt Stufen-Ordner direkt unter dem Fach. */
  stufe: RegExp | null;
}

export function istIgnoriert(name: string, ignoriert: string[]): boolean {
  const n = name.toLowerCase();
  return ignoriert.some((i) => i.toLowerCase() === n);
}

/**
 * Fächer eines Bereichs aus seinen direkten Unterordnern. Hub ist `<Ordner>/<Ordner>.md`, falls vorhanden;
 * Overrides setzen Namen und Hub (z. B. "Politik und Gesellschaft | PuG | PuG").
 */
export function faecherIn(
  bereich: Bereich,
  unterordner: string[],
  gibtEs: (path: string) => boolean,
  overrides: FachOverride[],
  ignoriert: string[],
): Fach[] {
  return unterordner
    .filter((o) => !istIgnoriert(o, ignoriert))
    .sort((a, b) => a.localeCompare(b, "de"))
    .map((folder) => {
      const o = overrides.find((x) => x.folder === folder);
      if (o) return { name: o.name, folder, hub: o.hub };
      return { name: folder, folder, hub: gibtEs(`${bereich.root}/${folder}/${folder}.md`) ? folder : "" };
    });
}

/** Einordnung einer Datei; null = außerhalb aller aktiven Bereiche, direkt im Bereichsordner oder in einem ignorierten Ordner. */
export function einordnen(path: string, s: Struktur): Einordnung | null {
  if (!path.endsWith(".md")) return null;
  for (const bereich of s.bereiche) {
    if (!bereich.aktiv || !bereich.root.trim()) continue;
    const prefix = `${bereich.root}/`;
    if (!path.startsWith(prefix)) continue;
    const parts = path.slice(prefix.length).split("/");
    if (parts.length < 2) return null;
    const fach = s.faecher.get(bereich.id)?.find((f) => f.folder === parts[0]);
    if (!fach) return null;
    const ordner = parts.slice(1, -1);
    if (ordner.some((o) => istIgnoriert(o, s.ignoriert))) return null;
    const basename = parts[parts.length - 1].replace(/\.md$/, "");
    let stufe: string | null = null;
    if (ordner.length && s.stufe?.test(ordner[0])) stufe = ordner.shift()!;
    return {
      bereich,
      fach,
      thema: ordner[0] ?? null,
      unterthema: ordner.length > 1 ? ordner.slice(1).join("/") : null,
      stufe,
      istHub: parts.length === 2 && fach.hub !== "" && basename === fach.hub,
    };
  }
  return null;
}

/** Ein wählbarer Themenordner eines Fachs. */
export interface ThemaInfo {
  /** Pfad relativ zum Fachordner, z. B. "A Auge" oder "Dramen/Maria Stuart". */
  pfad: string;
  /** Notes im Ordner samt Unterordnern. */
  anzahl: number;
  /** Letzte Änderung einer dieser Notes (ms), 0 = keine. */
  zuletzt: number;
}

/**
 * Alle Themenordner eines Fachs, zuletzt benutzte zuerst. `ordner` und `notes` sind Vault-Pfade;
 * ignorierte Ordner und alles darunter fallen weg.
 */
export function themenVon(
  bereich: Bereich,
  fach: Fach,
  ordner: string[],
  notes: { path: string; mtime: number }[],
  ignoriert: string[],
): ThemaInfo[] {
  const basis = `${bereich.root}/${fach.folder}/`;
  const gueltig = (rel: string) => !rel.split("/").some((t) => istIgnoriert(t, ignoriert));
  const map = new Map<string, ThemaInfo>();
  for (const o of ordner) {
    if (!o.startsWith(basis)) continue;
    const rel = o.slice(basis.length);
    if (rel && gueltig(rel)) map.set(rel, { pfad: rel, anzahl: 0, zuletzt: 0 });
  }
  for (const n of notes) {
    if (!n.path.startsWith(basis) || !n.path.endsWith(".md")) continue;
    const teile = n.path.slice(basis.length).split("/").slice(0, -1);
    for (let i = 1; i <= teile.length; i++) {
      const t = map.get(teile.slice(0, i).join("/"));
      if (!t) continue;
      t.anzahl++;
      t.zuletzt = Math.max(t.zuletzt, n.mtime);
    }
  }
  return [...map.values()].sort((a, b) => b.zuletzt - a.zuletzt || a.pfad.localeCompare(b.pfad, "de"));
}

/** Properties, die sich aus dem Pfad ergeben; null = Property soll fehlen. */
export function pfadProps(e: Einordnung): Record<string, string | null> {
  return {
    typ: "themennote",
    [e.bereich.property]: e.fach.hub ? `[[${e.fach.hub}]]` : e.fach.name,
    thema: e.thema,
    unterthema: e.unterthema,
    stufe: e.stufe,
  };
}

/** Abweichungen zwischen Frontmatter und Soll: Schlüssel → neuer Wert (null = löschen). Leer = nichts zu tun. */
export function abweichungen(fm: Record<string, unknown> | undefined, soll: Record<string, string | null>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(soll)) {
    const ist = fm?.[k];
    const leer = ist === undefined || ist === null || ist === "";
    if (v === null ? !leer : leer || String(ist) !== v) out[k] = v;
  }
  return out;
}
