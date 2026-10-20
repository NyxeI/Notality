// Einstellungen und ihre Standardwerte (pure).
import { DEFAULT_ANZEIGE, type AnzeigeSettings } from "./ansicht.ts";
import type { Bereich, FachOverride } from "./config.ts";
import { ansichtKey, type AnsichtKey } from "./templates.ts";

export interface ThemenSettings {
  bereiche: Bereich[];
  /** Abweichende Namen/Hubs je Fachordner. */
  overrides: FachOverride[];
  /** Ordnernamen, die nie Themen sind. */
  ignoriert: string[];
  /** Regex für Stufen-Ordner direkt unter dem Fach ("11", "12-1"); leer = keine. */
  stufenMuster: string;
  /** Pfad der Base, die in allen Fach-Hubs eingebettet wird; leer = "Themen.base" im Ordner des ersten Bereichs. */
  basePath: string;
  /** Ansicht, die „Hubs einrichten“ einbettet. */
  standardAnsicht: AnsichtKey;
  /** Vorlage für neue Notes; leer oder fehlend = leere Note. */
  vorlage: string;
  /** Properties und Tags beim Bearbeiten automatisch abgleichen. */
  automatik: boolean;
  /** Inline-Tags, die aus dem Text gelöscht werden, auch aus "tags" entfernen. */
  tagsEntfernen: boolean;
  anzeige: AnzeigeSettings;
  /** Je Note: Tags, die das Plugin aus dem Text übernommen hat (nur diese werden wieder entfernt). */
  tagStand: Record<string, string[]>;
}

export const DEFAULT_SETTINGS: ThemenSettings = {
  // Kein Ordner vorgegeben: der Nutzer wählt ihn in den Einstellungen.
  bereiche: [{ id: "schule", name: "", root: "", property: "fach", aktiv: true }],
  overrides: [],
  ignoriert: ["attachments", "Ink", "Excalidraw", "Drawing", "Writing"],
  stufenMuster: "",
  basePath: "",
  standardAnsicht: "thema",
  vorlage: "",
  automatik: true,
  tagsEntfernen: true,
  anzeige: DEFAULT_ANZEIGE,
  tagStand: {},
};

/** Gespeicherte Daten über die Standardwerte legen (unbekannte Felder fallen weg). */
export function mergeSettings(data: unknown): ThemenSettings {
  const s = structuredClone(DEFAULT_SETTINGS);
  if (!data || typeof data !== "object") return s;
  const d = data as Partial<ThemenSettings>;
  if (Array.isArray(d.bereiche)) {
    s.bereiche = s.bereiche.map((b) => ({ ...b, ...(d.bereiche!.find((x) => x?.id === b.id) ?? {}) }));
    for (const x of d.bereiche) if (x?.id && !s.bereiche.some((b) => b.id === x.id)) s.bereiche.push(x);
  }
  if (Array.isArray(d.overrides)) s.overrides = d.overrides;
  if (Array.isArray(d.ignoriert)) s.ignoriert = d.ignoriert;
  for (const k of ["stufenMuster", "basePath", "vorlage"] as const) if (typeof d[k] === "string") s[k] = d[k];
  // Früher wurde der Ansichtsname gespeichert ("Nach Thema"), jetzt der Schlüssel
  if (typeof d.standardAnsicht === "string") s.standardAnsicht = ansichtKey(d.standardAnsicht) ?? (d.standardAnsicht as AnsichtKey);
  for (const k of ["automatik", "tagsEntfernen"] as const) if (typeof d[k] === "boolean") s[k] = d[k];
  if (d.anzeige && typeof d.anzeige === "object") s.anzeige = { ...s.anzeige, ...d.anzeige };
  if (d.tagStand && typeof d.tagStand === "object") s.tagStand = d.tagStand;
  return s;
}

/** Pfad der Base: eingestellt oder "Themen.base" im Ordner des ersten aktiven Bereichs mit Ordner. */
export function basisPfad(s: ThemenSettings): string {
  if (s.basePath.trim()) return s.basePath.trim();
  const root = s.bereiche.find((b) => b.aktiv && b.root.trim())?.root.trim();
  return root ? `${root}/Themen.base` : "Themen.base";
}

/** Stufen-Regex aus den Einstellungen; ungültig oder leer = keine Stufen. */
export function stufenRegex(muster: string): RegExp | null {
  if (!muster.trim()) return null;
  try {
    return new RegExp(muster);
  } catch {
    return null;
  }
}
