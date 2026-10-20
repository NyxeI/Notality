// Was soll im Frontmatter einer Themennote stehen? (pure) – für die Automatik und fürs Nachrüsten.
import { abweichungen, pfadProps, type Einordnung } from "./pfad.ts";
import { syncTags } from "./tags.ts";
import { parseStempel, stempel } from "./zeit.ts";

export interface PropEingabe {
  fm: Record<string, unknown> | undefined;
  einordnung: Einordnung;
  /** Fertig getippte Inline-Tags (werden übernommen). */
  fertig: string[];
  /** Alle Inline-Tags im Text, auch halb getippte (entscheiden übers Entfernen). */
  alle: string[];
  /** Tags, die das Plugin früher aus dem Text übernommen hat. */
  verwaltet: string[];
  /** Der Nutzer hat die Note gerade bearbeitet (setzt "geaendert" auf jetzt). */
  bearbeitet: boolean;
  jetzt: number;
  ctime: number;
  mtime: number;
  /** Datum aus dem Text der Note (z. B. "16-09-2026" in der ersten Zeile), falls erkannt. */
  textDatum?: number | null;
  tagsEntfernen: boolean;
}

export interface PropErgebnis {
  /** Änderungen am Frontmatter: Schlüssel → Wert (null = löschen); leer = nichts zu tun. */
  plan: Record<string, unknown>;
  /** Neuer Stand der vom Plugin übernommenen Tags. */
  verwaltet: string[];
}

export function propPlan(e: PropEingabe): PropErgebnis {
  const plan: Record<string, unknown> = abweichungen(e.fm, pfadProps(e.einordnung));
  if (parseStempel(e.fm?.erstellt) === null) {
    const kandidaten = [e.ctime, e.mtime, e.textDatum ?? Infinity].filter((x) => x > 0);
    plan.erstellt = stempel(Math.min(...kandidaten));
  }
  const geaendert = e.bearbeitet ? stempel(e.jetzt) : parseStempel(e.fm?.geaendert) === null ? stempel(e.mtime) : null;
  if (geaendert && geaendert !== e.fm?.geaendert) plan.geaendert = geaendert;
  const t = syncTags(e.fm?.tags, e.fertig, e.alle, e.verwaltet, e.tagsEntfernen);
  if (t.tags) plan.tags = t.tags;
  return { plan, verwaltet: t.verwaltet };
}

/** Plan aufs Frontmatter anwenden (in processFrontMatter); Reihenfolge der Schlüssel wie in einer neuen Note. */
export function wendeAn(fm: Record<string, unknown>, plan: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(plan)) {
    if (v === null) delete fm[k];
    else fm[k] = v;
  }
}

/** Datum "DD-MM-YYYY" bzw. "DD.MM.YYYY" in einer der ersten Zeilen nach dem Frontmatter (Vorlage „{{date}}“) → ms. */
export function textDatum(inhalt: string): number | null {
  const body = inhalt.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const zeilen = body.split("\n").map((z) => z.trim()).filter(Boolean).slice(0, 4);
  for (const z of zeilen) {
    const m = z.match(/^(\d{2})[-.](\d{2})[-.](\d{4})$/);
    if (!m) continue;
    const t = new Date(+m[3], +m[2] - 1, +m[1]).getTime();
    if (!Number.isNaN(t) && +m[2] >= 1 && +m[2] <= 12) return t;
  }
  return null;
}

/** Notes, die das Plugin nie anfasst (Kanban-Boards, Excalidraw-Zeichnungen). */
export function fremdeNote(fm: Record<string, unknown> | undefined): boolean {
  return !!fm && ("kanban-plugin" in fm || "excalidraw-plugin" in fm);
}
