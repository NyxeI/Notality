// Anzeige-Einstellungen, Themenfarben und Navigation im Thema (pure).

export type Zeilenhoehe = "" | "medium" | "tall" | "extra";

export interface AnzeigeSettings {
  /** Kompakte Base-Darstellung (Toolbar/Rahmen) */
  kompakt: boolean;
  /** Properties-Block in Themennotes zeigen */
  propertiesInNotes: boolean;
  /** Kleine Leiste oben in Hubs und Themennotes */
  menueleiste: boolean;
  /** Base über die Lesebreite hinaus auf volle Fensterbreite */
  volleBreite: boolean;
  /** Neue Notes erben das Banner der Themen-Note bzw. des Fach-Hubs */
  bannerErben: boolean;
  /** Zeilenhöhe der Tabellen (Bases: "", medium, tall, extra) */
  zeilenhoehe: Zeilenhoehe;
  /** Schriftgröße der Themenköpfe als Faktor (1 = normal) */
  gruppenGroesse: number;
  /** Standardfarbe der Themenköpfe ("" = Akzentfarbe) */
  gruppenFarbe: string;
  /** Farbe je Thema: Schlüssel "<Fach>::<Thema>" */
  themaFarben: Record<string, string>;
  /** Knöpfe der Leiste: ID → sichtbar */
  leisteKnoepfe: Record<string, boolean>;
}

/** Schalter, die per Klick umgeschaltet werden (boolesche Felder). */
export type AnzeigeSchalter = "kompakt" | "propertiesInNotes" | "menueleiste" | "volleBreite" | "bannerErben";

export const DEFAULT_ANZEIGE: AnzeigeSettings = {
  kompakt: true,
  propertiesInNotes: true,
  menueleiste: true,
  volleBreite: false,
  bannerErben: true,
  zeilenhoehe: "medium",
  gruppenGroesse: 1.2,
  gruppenFarbe: "",
  themaFarben: {},
  leisteKnoepfe: {},
};

/** Schlüssel für die Farbe eines Themas. */
export function farbSchluessel(fach: string, thema: string): string {
  return `${fach}::${thema}`;
}

/** Farbe eines Themenkopfs: eigene Themenfarbe, sonst Standardfarbe, sonst null (= Akzentfarbe aus dem Theme). */
export function themaFarbe(a: AnzeigeSettings, fach: string, thema: string): string | null {
  return a.themaFarben[farbSchluessel(fach, thema)] || a.gruppenFarbe || null;
}

/** "#abc" → "#aabbcc"; ungültig → null. */
export function normalisiereFarbe(farbe: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(farbe.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}

/** Knopf der Leiste sichtbar? (nicht eingetragen = sichtbar) */
export function knopfSichtbar(a: AnzeigeSettings, id: string): boolean {
  return a.leisteKnoepfe[id] !== false;
}

/** Klassen am <body>, die styles.css auswertet. */
export function bodyClasses(a: AnzeigeSettings): Record<string, boolean> {
  return {
    "themen-kompakt": a.kompakt,
    "themen-props-aus": !a.propertiesInNotes,
    "themen-breit": a.volleBreite,
  };
}

/** Vorige und nächste Note im selben Ordner (alphabetisch, natürliche Sortierung „2“ vor „10“). */
export function nachbarn(pfade: string[], aktuell: string): { prev: string | null; next: string | null; pos: number; von: number } {
  const ordner = (p: string) => p.slice(0, p.lastIndexOf("/") + 1);
  const name = (p: string) => p.slice(p.lastIndexOf("/") + 1);
  const o = ordner(aktuell);
  const list = pfade.filter((p) => ordner(p) === o).sort((a, b) => name(a).localeCompare(name(b), "de", { numeric: true }));
  const i = list.indexOf(aktuell);
  return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null, pos: i + 1, von: list.length };
}
