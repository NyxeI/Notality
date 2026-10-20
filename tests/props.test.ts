import { test } from "node:test";
import assert from "node:assert/strict";
import { fertigeTags, inlineTags, syncTags, tagList } from "../src/tags.ts";
import { propPlan, textDatum, wendeAn } from "../src/props.ts";
import { einordnen, faecherIn, type Struktur } from "../src/pfad.ts";
import { DEFAULT_SETTINGS as STANDARD, basisPfad, mergeSettings } from "../src/defaults.ts";
import { SCHULE as DEFAULT_SETTINGS } from "./support/schule.ts";
import { kurzZeit, parseStempel, stempel } from "../src/zeit.ts";

const schule = DEFAULT_SETTINGS.bereiche[0];
const s: Struktur = {
  bereiche: DEFAULT_SETTINGS.bereiche,
  faecher: new Map([["schule", faecherIn(schule, ["Physik"], () => true, [], [])]]),
  ignoriert: [],
  stufe: null,
};
const e = einordnen("01-Schule/Physik/A Auge/Linsen.md", s)!;
const t0 = new Date(2026, 9, 20, 14, 5).getTime();

test("tagList/inlineTags: ohne #, ohne Duplikate (Groß-/Kleinschreibung egal)", () => {
  assert.deepEqual(tagList(["#Schule", "schule", "mathe"]), ["Schule", "mathe"]);
  assert.deepEqual(tagList("a, b c"), ["a", "b", "c"]);
  assert.deepEqual(inlineTags([{ tag: "#Physik" }, { tag: "#physik" }, { tag: "#Abi_Relevant" }]), ["Physik", "Abi_Relevant"]);
});

test("fertigeTags: Tag direkt vor dem Cursor zählt noch nicht", () => {
  const text = "Kunst #Duch";
  const tags = [{ tag: "#Duch", position: { end: { offset: 11 } } }];
  assert.deepEqual(fertigeTags(tags, [11]), []);
  assert.deepEqual(fertigeTags(tags, []), ["Duch"]);
  const fertig = "Kunst #Duchamp ";
  assert.deepEqual(fertigeTags([{ tag: "#Duchamp", position: { end: { offset: 14 } } }], [fertig.length]), ["Duchamp"]);
});

test("syncTags: übernehmen, nichts doppelt, Gelöschtes wieder entfernen", () => {
  // neu getippt → übernommen und als verwaltet gemerkt
  assert.deepEqual(syncTags(["schule"], ["Schule", "optik"], ["Schule", "optik"], [], true), { tags: ["schule", "optik"], verwaltet: ["optik"] });
  // nichts Neues
  assert.deepEqual(syncTags(["schule", "optik"], ["optik"], ["optik"], ["optik"], true), { tags: null, verwaltet: ["optik"] });
  // aus dem Text gelöscht → raus; von Hand eingetragenes "handtag" bleibt
  assert.deepEqual(syncTags(["handtag", "optik"], [], [], ["optik"], true), { tags: ["handtag"], verwaltet: [] });
  // ohne Schalter bleibt alles
  assert.deepEqual(syncTags(["handtag", "optik"], [], [], ["optik"], false), { tags: null, verwaltet: ["optik"] });
  // halb getippt (in "alle", nicht in "fertig") → wird weder übernommen noch entfernt
  assert.deepEqual(syncTags(["optik"], [], ["optik"], ["optik"], true), { tags: null, verwaltet: ["optik"] });
  // von Hand aus den Properties gelöscht → nicht mehr verwaltet
  assert.deepEqual(syncTags([], [], [], ["optik"], true), { tags: null, verwaltet: [] });
});

test("Ablauf #Duch … #Duchamp: nur der fertige Tag landet in tags, ein alter Rest verschwindet", () => {
  // Pause bei "#Duch|": nichts übernommen
  let r = syncTags([], fertigeTags([{ tag: "#Duch", position: { end: { offset: 5 } } }], [5]), ["Duch"], [], true);
  assert.deepEqual(r, { tags: null, verwaltet: [] });
  // weitergetippt "#Duchamp " → übernommen
  r = syncTags([], fertigeTags([{ tag: "#Duchamp", position: { end: { offset: 8 } } }], [9]), ["Duchamp"], r.verwaltet, true);
  assert.deepEqual(r, { tags: ["Duchamp"], verwaltet: ["Duchamp"] });
  // ein früher übernommener Rest "Duch" fliegt raus, sobald er nicht mehr im Text steht
  r = syncTags(["Duch", "Duchamp"], ["Duchamp"], ["Duchamp"], ["Duch", "Duchamp"], true);
  assert.deepEqual(r, { tags: ["Duchamp"], verwaltet: ["Duchamp"] });
});

test("propPlan: neue Note bekommt alles; danach stabil", () => {
  const { plan, verwaltet } = propPlan({ fm: undefined, einordnung: e, fertig: ["optik"], alle: ["optik"], verwaltet: [], bearbeitet: true, jetzt: t0, ctime: t0, mtime: t0, tagsEntfernen: false });
  assert.deepEqual(plan, { typ: "themennote", fach: "[[Physik]]", thema: "A Auge", erstellt: "2026-10-20T14:05", geaendert: "2026-10-20T14:05", tags: ["optik"] });
  assert.deepEqual(verwaltet, ["optik"]);
  const fm: Record<string, unknown> = {};
  wendeAn(fm, plan);
  // Gleiche Minute, gleiche Tags → nichts mehr zu tun (keine Schreibschleife)
  assert.deepEqual(propPlan({ fm, einordnung: e, fertig: ["optik"], alle: ["optik"], verwaltet: ["optik"], bearbeitet: true, jetzt: t0 + 30_000, ctime: t0, mtime: t0, tagsEntfernen: false }).plan, {});
  // Eine Minute später bearbeitet → nur geaendert
  assert.deepEqual(propPlan({ fm, einordnung: e, fertig: ["optik"], alle: ["optik"], verwaltet: ["optik"], bearbeitet: true, jetzt: t0 + 60_000, ctime: t0, mtime: t0, tagsEntfernen: false }).plan, { geaendert: "2026-10-20T14:06" });
});

test("propPlan ohne Bearbeitung: Dateidaten, frühestes Datum für erstellt, vorhandene Werte bleiben", () => {
  const alt = new Date(2025, 0, 2, 8, 0).getTime();
  const p = propPlan({ fm: { banner: "x.jpg" }, einordnung: e, fertig: [], alle: [], verwaltet: [], bearbeitet: false, jetzt: t0, ctime: t0, mtime: alt, textDatum: new Date(2024, 11, 1).getTime(), tagsEntfernen: false }).plan;
  assert.equal(p.erstellt, "2024-12-01T00:00");
  assert.equal(p.geaendert, "2025-01-02T08:00");
  assert.equal("banner" in p, false);
  assert.equal("tags" in p, false);
  const q = propPlan({ fm: { erstellt: "2023-01-01", geaendert: "2023-01-02T10:00" }, einordnung: e, fertig: [], alle: [], verwaltet: [], bearbeitet: false, jetzt: t0, ctime: t0, mtime: t0, tagsEntfernen: false }).plan;
  assert.equal("erstellt" in q || "geaendert" in q, false);
});

test("textDatum: Datumszeile am Anfang (Vorlage {{date}})", () => {
  assert.equal(textDatum("16-09-2026\n#schule #mathe\n\nText"), new Date(2026, 8, 16).getTime());
  assert.equal(textDatum("---\nbanner: x\n---\n#tag\n29.01.2026\n"), new Date(2026, 0, 29).getTime());
  assert.equal(textDatum("# Überschrift\n\nam 16-09-2026 war"), null);
});

test("Zeitstempel", () => {
  assert.equal(stempel(t0), "2026-10-20T14:05");
  assert.equal(parseStempel("2026-10-20T14:05"), t0);
  assert.equal(parseStempel("2026-10-20 14:05"), t0);
  assert.equal(parseStempel("20.10.2026"), null);
  assert.equal(kurzZeit(t0, t0 + 3600_000), "heute");
  assert.equal(kurzZeit(t0, t0 + 86_400_000), "gestern");
  assert.equal(kurzZeit(t0, t0 + 30 * 86_400_000), "20.10.26");
});

test("mergeSettings: Standardwerte ohne Ordner, gespeicherte Werte gewinnen, alter Ansichtsname wird Schlüssel", () => {
  assert.equal(STANDARD.bereiche.length, 1);
  assert.equal(STANDARD.bereiche[0].root, "");
  assert.equal(STANDARD.basePath, "");
  const m = mergeSettings({
    automatik: false,
    bereiche: [{ id: "schule", root: "01-Schule" }, { id: "projekte", name: "Projekte", root: "04-Projekte", property: "projekt", aktiv: false }],
    standardAnsicht: "Nach Thema",
    anzeige: { zeilenhoehe: "tall" },
    unbekannt: 1,
  });
  assert.equal(m.automatik, false);
  assert.equal(m.bereiche[0].root, "01-Schule");
  assert.equal(m.bereiche[0].property, "fach");
  assert.equal(m.bereiche.find((b) => b.id === "projekte")!.root, "04-Projekte");
  assert.equal(m.standardAnsicht, "thema");
  assert.equal(m.anzeige.zeilenhoehe, "tall");
  assert.equal(m.anzeige.kompakt, true);
  assert.equal("unbekannt" in m, false);
  assert.notEqual(mergeSettings(null).anzeige, STANDARD.anzeige);
});

test("basisPfad: eingestellt, sonst neben dem ersten Bereich, ohne Ordner im Vault-Wurzelordner", () => {
  assert.equal(basisPfad(DEFAULT_SETTINGS), "01-Schule/Themen.base");
  assert.equal(basisPfad({ ...DEFAULT_SETTINGS, basePath: "X/Y.base" }), "X/Y.base");
  assert.equal(basisPfad(STANDARD), "Themen.base");
});
