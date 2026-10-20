// Einstellungen und ihre Standardwerte (pure).
import { DEFAULT_ANZEIGE, type AnzeigeSettings } from "./ansicht.ts";
import type { Bereich, FachOverride } from "./config.ts";
import { ANSICHTEN } from "./templates.ts";

export interface ThemenSettings {
  bereiche: Bereich[];
  /** Abweichende Namen/Hubs je Fachordner. */
  overrides: FachOverride[];
  /** Ordnernamen, die nie Themen sind. */
  ignoriert: string[];
  /** Regex für Stufen-Ordner direkt unter dem Fach ("11", "12-1"); leer = keine. */
  stufenMuster: string;
  /** Pfad der Base, die in allen Fach-Hubs eingebettet wird. */
  basePath: string;
  /** Ansicht, die „Hubs einrichten“ einbettet. */
  standardAnsicht: string;
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
  bereiche: [
    { id: "schule", name: "Schule", root: "01-Schule", property: "fach", aktiv: true },
    { id: "projekte", name: "Projekte", root: "04-Projekte", property: "projekt", aktiv: false },
  ],
  overrides: [{ folder: "Politik und Gesellschaft", name: "Politik und Gesellschaft", hub: "PuG" }],
  ignoriert: ["attachments", "AufgabenFiles", "Ink", "Excalidraw", "Drawing", "Writing"],
  stufenMuster: "^(11|12|13)(-[12])?$",
  basePath: "01-Schule/Themen.base",
  standardAnsicht: ANSICHTEN[0],
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
  for (const k of ["stufenMuster", "basePath", "standardAnsicht", "vorlage"] as const) if (typeof d[k] === "string") s[k] = d[k];
  for (const k of ["automatik", "tagsEntfernen"] as const) if (typeof d[k] === "boolean") s[k] = d[k];
  if (d.anzeige && typeof d.anzeige === "object") s.anzeige = { ...s.anzeige, ...d.anzeige };
  if (d.tagStand && typeof d.tagStand === "object") s.tagStand = d.tagStand;
  return s;
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
