// Fach-Base auf Plugin-Stand bringen, ohne die im Panel gewählten Spalten zu verlieren (pure).
import type { AnzeigeSettings } from "./ansicht.ts";
import { setzeTabellen, tabellenBreite, type BaseDatei } from "./spalten.ts";

/** YAML-Parser von außen (in Obsidian `parseYaml`/`stringifyYaml`), damit das Modul ohne Obsidian testbar bleibt. */
export interface Yaml {
  parse(text: string): unknown;
  stringify(obj: unknown): string;
}

/** Darstellungsfelder einer Ansicht, die das Panel in die Base schreibt. */
const ANZEIGE_FELDER = ["order", "columnSize", "rowHeight"] as const;

const KOPF = /^(?:#[^\n]*\n)+/;

function parse(text: string, yaml: Yaml): BaseDatei | null {
  try {
    const o = yaml.parse(text.replace(KOPF, ""));
    return o && typeof o === "object" ? (o as BaseDatei) : {};
  } catch {
    return null;
  }
}

/**
 * Soll-Inhalt der Base mit den Panel-Einstellungen: Zeilenhöhe/Breite aus `anzeige`, pro Ansicht (gleicher Name)
 * gewinnen `order`, `columnSize` und `rowHeight` der vorhandenen Datei. Kopfkommentare des Solls bleiben.
 */
export function mitAnzeige(soll: string, ist: string | null, anzeige: Pick<AnzeigeSettings, "zeilenhoehe" | "volleBreite">, yaml: Yaml): string {
  const base = parse(soll, yaml);
  if (!base) return soll;
  const vorher = JSON.stringify(base);
  setzeTabellen(base, anzeige.zeilenhoehe, tabellenBreite(anzeige.volleBreite));
  const alt = ist === null ? null : parse(ist, yaml);
  for (const v of base.views ?? []) {
    const a = alt?.views?.find((x) => x.name === v.name);
    if (!a) continue;
    for (const k of ANZEIGE_FELDER) {
      if (a[k] === undefined) delete v[k];
      else v[k] = structuredClone(a[k]) as never;
    }
  }
  if (JSON.stringify(base) === vorher) return soll;
  return (KOPF.exec(soll) ?? [""])[0] + yaml.stringify(base);
}

/** Inhaltlich gleich (geparst, ohne Kommentare und Formatierung)? Nicht lesbares YAML gilt als verschieden. */
export function gleicheBase(a: string, b: string, yaml: Yaml): boolean {
  const pa = parse(a, yaml);
  const pb = parse(b, yaml);
  return pa !== null && pb !== null && tiefGleich(pa, pb);
}

function tiefGleich(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => k in b && tiefGleich((a as any)[k], (b as any)[k]));
}

/** Neuer Inhalt der Base oder null, wenn sie schon dem Soll entspricht. `ist` = aktueller Inhalt (null = fehlt). */
export function baseUpdate(soll: string, ist: string | null, anzeige: Pick<AnzeigeSettings, "zeilenhoehe" | "volleBreite">, yaml: Yaml): string | null {
  const neu = mitAnzeige(soll, ist, anzeige, yaml);
  return ist !== null && gleicheBase(ist, neu, yaml) ? null : neu;
}
