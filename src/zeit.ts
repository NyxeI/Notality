// Zeitstempel für "erstellt"/"geaendert" (pure): Ortszeit im Format der Obsidian-Property „Datum & Uhrzeit“.

const zwei = (n: number) => String(n).padStart(2, "0");

/** ms → "YYYY-MM-DDTHH:mm" (Ortszeit). */
export function stempel(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}T${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

/** "YYYY-MM-DD", "YYYY-MM-DDTHH:mm[:ss]" oder "YYYY-MM-DD HH:mm" → ms (Ortszeit); sonst null. */
export function parseStempel(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const t = new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
  return Number.isNaN(t) ? null : t;
}

/** "zuletzt"-Hinweis: "heute", "gestern", "vor 5 Tagen", sonst "12.03.26". */
export function kurzZeit(ms: number, jetzt = Date.now()): string {
  if (!ms) return "";
  const tag = (x: number) => {
    const d = new Date(x);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const diff = Math.round((tag(jetzt) - tag(ms)) / 86_400_000);
  if (diff <= 0) return "heute";
  if (diff === 1) return "gestern";
  if (diff < 7) return `vor ${diff} Tagen`;
  const d = new Date(ms);
  return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}
