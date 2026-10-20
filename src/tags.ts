// Inline-#tags ↔ Property "tags" (pure).

/** Tags aus dem Frontmatter als Liste ohne führendes "#" (String, Komma-Liste oder Array). */
export function tagList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim().replace(/^#/, "");
    if (t && !enthaelt(out, t)) out.push(t);
  }
  return out;
}

/** Enthält die Liste den Tag (Obsidian unterscheidet bei Tags nicht nach Groß-/Kleinschreibung)? */
export function enthaelt(list: string[], tag: string): boolean {
  const t = tag.toLowerCase();
  return list.some((x) => x.toLowerCase() === t);
}

/** Inline-Tag aus dem Metadaten-Cache (`cache.tags`); `end` = Offset direkt hinter dem Tag. */
export interface CacheTag {
  tag: string;
  position?: { end: { offset: number } };
}

/** Inline-Tags aus dem Metadaten-Cache: ohne "#", ohne Duplikate, erste Schreibweise gewinnt. */
export function inlineTags(cacheTags: CacheTag[] | undefined): string[] {
  const out: string[] = [];
  for (const { tag } of cacheTags ?? []) {
    const t = tag.replace(/^#/, "");
    if (t && !enthaelt(out, t)) out.push(t);
  }
  return out;
}

/**
 * Fertig getippte Inline-Tags: Steht ein Cursor direkt hinter dem Tag („#Duch|“), tippt der Nutzer vielleicht noch –
 * der Tag zählt erst, wenn danach etwas kommt (Leerzeichen, Satzzeichen, Enter) oder der Cursor woanders steht.
 * `cursor` = Offsets aller Cursor im selben Text (leer = keine offene Bearbeitung).
 */
export function fertigeTags(cacheTags: CacheTag[] | undefined, cursor: number[]): string[] {
  const out: string[] = [];
  for (const c of cacheTags ?? []) {
    const end = c.position?.end.offset;
    if (end !== undefined && cursor.includes(end)) continue;
    const t = c.tag.replace(/^#/, "");
    if (t && !enthaelt(out, t)) out.push(t);
  }
  return out;
}

export interface TagSync {
  /** Neue Liste für "tags" oder null, wenn sich nichts ändert. */
  tags: string[] | null;
  /** Tags, die das Plugin aus dem Text übernommen hat (für das spätere Entfernen). */
  verwaltet: string[];
}

/**
 * Fertige Inline-Tags anhängen; mit `entfernen` fallen vom Plugin übernommene Tags weg, die gar nicht mehr im Text stehen
 * (`alle` = alle Inline-Tags, auch halb getippte – so verschwindet ein Tag nicht, nur weil der Cursor dahinter steht).
 * Von Hand in den Properties eingetragene Tags bleiben immer.
 */
export function syncTags(fmTags: unknown, fertig: string[], alle: string[], verwaltet: string[], entfernen: boolean): TagSync {
  const alt = tagList(fmTags);
  let neu = [...alt];
  // Von Hand aus den Properties gelöschte Tags gelten nicht mehr als verwaltet
  let verw = verwaltet.filter((t) => enthaelt(alt, t));
  for (const t of fertig) {
    if (enthaelt(neu, t)) continue;
    neu.push(t);
    verw.push(t);
  }
  if (entfernen) {
    const weg = verw.filter((t) => !enthaelt(alle, t));
    neu = neu.filter((t) => !enthaelt(weg, t));
    verw = verw.filter((t) => !enthaelt(weg, t));
  }
  const gleich = neu.length === alt.length && neu.every((t, i) => t === alt[i]);
  return { tags: gleich ? null : neu, verwaltet: verw };
}
