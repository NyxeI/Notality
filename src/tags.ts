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

/** Inline-Tags aus dem Metadaten-Cache (`cache.tags`): ohne "#", ohne Duplikate, erste Schreibweise gewinnt. */
export function inlineTags(cacheTags: { tag: string }[] | undefined): string[] {
  const out: string[] = [];
  for (const { tag } of cacheTags ?? []) {
    const t = tag.replace(/^#/, "");
    if (t && !enthaelt(out, t)) out.push(t);
  }
  return out;
}

/**
 * Neue Liste für "tags" oder null, wenn sich nichts ändert. Neue Inline-Tags werden angehängt.
 * Mit `entfernen` fallen Tags weg, die seit `vorher` (letzter bekannter Stand der Inline-Tags) aus dem Text verschwunden sind;
 * von Hand in den Properties eingetragene Tags bleiben immer.
 */
export function syncTags(fmTags: unknown, jetzt: string[], vorher: string[] | null, entfernen: boolean): string[] | null {
  const alt = tagList(fmTags);
  let neu = [...alt];
  for (const t of jetzt) if (!enthaelt(neu, t)) neu.push(t);
  if (entfernen && vorher) {
    const weg = vorher.filter((t) => !enthaelt(jetzt, t));
    neu = neu.filter((t) => !enthaelt(weg, t));
  }
  const gleich = neu.length === alt.length && neu.every((t, i) => t === alt[i]);
  return gleich ? null : neu;
}
