import { test } from "node:test";
import assert from "node:assert/strict";
import { inlineTags, syncTags, tagList } from "../src/tags.ts";
import { propPlan, textDatum, wendeAn } from "../src/props.ts";
import { einordnen, faecherIn, type Struktur } from "../src/pfad.ts";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/defaults.ts";
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

test("syncTags: neue Tags anhängen, nichts doppelt, Entfernen nur mit Schalter", () => {
  assert.deepEqual(syncTags(["schule"], ["Schule", "optik"], null, false), ["schule", "optik"]);
  assert.equal(syncTags(["schule", "optik"], ["optik"], null, false), null);
  assert.equal(syncTags(["schule", "optik"], ["schule"], ["schule", "optik"], false), null);
  assert.deepEqual(syncTags(["handtag", "schule", "optik"], ["schule"], ["schule", "optik"], true), ["handtag", "schule"]);
  assert.equal(syncTags(undefined, [], null, true), null);
});

test("propPlan: neue Note bekommt alles; danach stabil", () => {
  const plan = propPlan({ fm: undefined, einordnung: e, inline: ["optik"], vorherInline: null, bearbeitet: true, jetzt: t0, ctime: t0, mtime: t0, tagsEntfernen: false });
  assert.deepEqual(plan, { typ: "themennote", fach: "[[Physik]]", thema: "A Auge", erstellt: "2026-10-20T14:05", geaendert: "2026-10-20T14:05", tags: ["optik"] });
  const fm: Record<string, unknown> = {};
  wendeAn(fm, plan);
  // Gleiche Minute, gleiche Tags → nichts mehr zu tun (keine Schreibschleife)
  assert.deepEqual(propPlan({ fm, einordnung: e, inline: ["optik"], vorherInline: ["optik"], bearbeitet: true, jetzt: t0 + 30_000, ctime: t0, mtime: t0, tagsEntfernen: false }), {});
  // Eine Minute später bearbeitet → nur geaendert
  assert.deepEqual(propPlan({ fm, einordnung: e, inline: ["optik"], vorherInline: ["optik"], bearbeitet: true, jetzt: t0 + 60_000, ctime: t0, mtime: t0, tagsEntfernen: false }), { geaendert: "2026-10-20T14:06" });
});

test("propPlan ohne Bearbeitung: Dateidaten, frühestes Datum für erstellt, vorhandene Werte bleiben", () => {
  const alt = new Date(2025, 0, 2, 8, 0).getTime();
  const p = propPlan({ fm: { banner: "x.jpg" }, einordnung: e, inline: [], vorherInline: null, bearbeitet: false, jetzt: t0, ctime: t0, mtime: alt, textDatum: new Date(2024, 11, 1).getTime(), tagsEntfernen: false });
  assert.equal(p.erstellt, "2024-12-01T00:00");
  assert.equal(p.geaendert, "2025-01-02T08:00");
  assert.equal("banner" in p, false);
  assert.equal("tags" in p, false);
  const q = propPlan({ fm: { erstellt: "2023-01-01", geaendert: "2023-01-02T10:00" }, einordnung: e, inline: [], vorherInline: null, bearbeitet: false, jetzt: t0, ctime: t0, mtime: t0, tagsEntfernen: false });
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

test("mergeSettings: Standardwerte, gespeicherte Werte gewinnen", () => {
  const m = mergeSettings({ automatik: false, bereiche: [{ id: "projekte", aktiv: true }], anzeige: { zeilenhoehe: "tall" }, unbekannt: 1 });
  assert.equal(m.automatik, false);
  assert.equal(m.bereiche.find((b) => b.id === "projekte")!.aktiv, true);
  assert.equal(m.bereiche.find((b) => b.id === "projekte")!.root, "04-Projekte");
  assert.equal(m.anzeige.zeilenhoehe, "tall");
  assert.equal(m.anzeige.kompakt, true);
  assert.equal("unbekannt" in m, false);
  assert.notEqual(mergeSettings(null).anzeige, DEFAULT_SETTINGS.anzeige);
});
