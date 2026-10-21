// Navigieren: Inhalt einer Ebene (Fach oder Thema) und Suche darin (pure).
import { istIgnoriert, type ThemaInfo } from "./pfad.ts";

/** Themenordner auf einer Ebene; `ordnerNote` = Vault-Pfad von `<Thema>/<Thema>.md`, falls vorhanden. */
export interface NavThema {
  kind: "thema";
  /** Pfad relativ zum Fachordner. */
  pfad: string;
  name: string;
  anzahl: number;
  zuletzt: number;
  ordnerNote: string | null;
  /** Ordner relativ zur aktuellen Ebene, in dem das Thema liegt ("" = direkt). */
  ort: string;
}

export interface NavNote {
  kind: "note";
  path: string;
  name: string;
  mtime: number;
  /** Ordner relativ zur aktuellen Ebene ("" = direkt). */
  ort: string;
}

export type NavEintrag = NavThema | NavNote;

export interface NavInhalt {
  /** Themen und Notes direkt auf der Ebene: Themen zuerst (zuletzt benutzte oben), dann Notes (neueste oben). */
  direkt: NavEintrag[];
  /** Alles darunter – nur für die Suche. */
  tiefer: NavEintrag[];
}

const elternVon = (pfad: string) => pfad.split("/").slice(0, -1).join("/");
const letzter = (pfad: string) => pfad.split("/").pop()!;

/** Ort relativ zu `rel`: "A Auge/Teil 1" unter "A Auge" → "Teil 1". */
function relativ(ordner: string, rel: string): string {
  return rel ? ordner.slice(rel.length).replace(/^\//, "") : ordner;
}

/**
 * Inhalt des Ordners `<basis>/<rel>` (rel "" = Fachordner). `themen` aus `themenVon`, `notes` sind Vault-Pfade.
 * Hub (auf Fachebene) und Ordner-Notes (`<Thema>/<Thema>.md`) stehen für ihre Ebene und erscheinen nicht als Notes.
 */
export function navInhalt(
  basis: string,
  rel: string,
  themen: ThemaInfo[],
  notes: { path: string; mtime: number }[],
  ignoriert: string[],
  hub: string,
): NavInhalt {
  const pfade = new Set(notes.map((n) => n.path));
  const unter = (pfad: string) => (rel ? pfad.startsWith(`${rel}/`) : true);
  const ordnerNoteVon = (pfad: string) => {
    const p = `${basis}/${pfad}/${letzter(pfad)}.md`;
    return pfade.has(p) ? p : null;
  };

  const direkt: NavEintrag[] = [];
  const tiefer: NavEintrag[] = [];
  for (const th of themen) {
    if (!th.pfad || !unter(th.pfad)) continue;
    const eintrag: NavThema = {
      kind: "thema",
      pfad: th.pfad,
      name: letzter(th.pfad),
      anzahl: th.anzahl,
      zuletzt: th.zuletzt,
      ordnerNote: ordnerNoteVon(th.pfad),
      ort: relativ(elternVon(th.pfad), rel),
    };
    (elternVon(th.pfad) === rel ? direkt : tiefer).push(eintrag);
  }

  const noteEintraege: NavNote[] = [];
  for (const n of notes) {
    if (!n.path.startsWith(`${basis}/`) || !n.path.endsWith(".md")) continue;
    const relPfad = n.path.slice(basis.length + 1);
    const ordner = elternVon(relPfad);
    if (!(ordner === rel || unter(ordner))) continue;
    if (ordner.split("/").some((o) => o && istIgnoriert(o, ignoriert))) continue;
    const name = letzter(relPfad).replace(/\.md$/, "");
    if (ordner === "" ? name === hub : name === letzter(ordner)) continue;
    noteEintraege.push({ kind: "note", path: n.path, name, mtime: n.mtime, ort: relativ(ordner, rel) });
  }
  noteEintraege.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name, "de"));
  for (const n of noteEintraege) (n.ort === "" ? direkt : tiefer).push(n);
  return { direkt, tiefer };
}

/** Treffer für `query`: erst die Ebene, dann tiefere Treffer; jeweils Treffer am Wortanfang zuerst. Leer = nur die Ebene. */
export function navSuche(inhalt: NavInhalt, query: string): NavEintrag[] {
  const q = query.trim().toLowerCase();
  if (!q) return inhalt.direkt;
  const filtern = (liste: NavEintrag[]) => {
    const hits = liste.filter((e) => e.name.toLowerCase().includes(q));
    return hits.sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)));
  };
  return [...filtern(inhalt.direkt), ...filtern(inhalt.tiefer)];
}
