// Reine Datentypen und Hilfsfunktionen ohne Obsidian-Abhängigkeit (testbar mit node --test).

/** Ein Bereich des Vaults: Wurzelordner mit einem Ordner pro Kategorie (Fach, Projekt). */
export interface Bereich {
  id: string;
  name: string;
  /** Wurzelordner, z. B. "01-Schule". */
  root: string;
  /** Property, die die Kategorie verlinkt ("fach", "projekt"). */
  property: string;
  aktiv: boolean;
}

/** Eine Kategorie (Fach, Projekt) eines Bereichs. */
export interface Fach {
  /** Anzeigename. */
  name: string;
  /** Ordner unter dem Bereichsordner. */
  folder: string;
  /** Name der Hub-Note im Fachordner ohne ".md" (meist gleich dem Ordner); "" = kein Hub. */
  hub: string;
}

/** Abweichungen von der automatischen Erkennung: Ordner → Name und Hub. */
export interface FachOverride {
  folder: string;
  name: string;
  hub: string;
}

/** Zeilen "Ordner | Name | Hub". Name und Hub dürfen fehlen. */
export function parseOverrides(text: string): FachOverride[] {
  const out: FachOverride[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [folder, name, hub] = line.split("|").map((p) => p.trim());
    if (!folder) continue;
    out.push({ folder, name: name || folder, hub: hub ?? folder });
  }
  return out;
}

export function formatOverrides(list: FachOverride[]): string {
  return list.map((o) => `${o.folder} | ${o.name} | ${o.hub}`).join("\n");
}

/** Zeichen, die in Datei- und Ordnernamen nicht erlaubt sind oder Links brechen. */
const VERBOTEN = /[\\:*?"<>|#^[\]]/g;

/** Titel → gültiger Dateiname (ohne ".md"); Schrägstriche werden zu Bindestrichen. */
export function dateiName(titel: string): string {
  return titel.replace(VERBOTEN, "").replace(/\//g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
}

/** Themenpfad "Dramen / Maria Stuart" → "Dramen/Maria Stuart" (jeder Teil wie ein Dateiname). */
export function themenPfad(eingabe: string): string {
  return eingabe
    .split("/")
    .map((t) => dateiName(t))
    .filter(Boolean)
    .join("/");
}
