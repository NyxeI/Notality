import { test } from "node:test";
import assert from "node:assert/strict";
import { amRand, navInhalt, navSuche } from "../src/navigation.ts";
import { themenVon } from "../src/pfad.ts";
import { SCHULE } from "./support/schule.ts";

const schule = SCHULE.bereiche[0];
const physik = { name: "Physik", folder: "Physik", hub: "Physik" };
const basis = "01-Schule/Physik";
const ordner = ["A Auge", "A Auge/Teil 1", "B Ohr", "attachments", "A Auge/attachments"].map((o) => `${basis}/${o}`);
const notes = [
  ["Physik.md", 50],
  ["Astroabend.md", 40],
  ["A Auge/A Auge.md", 10],
  ["A Auge/Brennweite.md", 30],
  ["A Auge/Linse.md", 20],
  ["A Auge/Teil 1/Brennpunkt.md", 60],
  ["B Ohr/Schall.md", 5],
  ["attachments/Zeichnung.md", 99],
].map(([p, mtime]) => ({ path: `${basis}/${p}`, mtime: mtime as number }));
const themen = themenVon(schule, physik, ordner, notes, SCHULE.ignoriert);
const inhalt = (rel: string) => navInhalt(basis, rel, themen, notes, SCHULE.ignoriert, physik.hub);
const namen = (l: { name: string }[]) => l.map((e) => e.name);

test("Fachebene: Themen zuerst (zuletzt benutzt oben), dann Notes ohne Hub; ignorierte Ordner fehlen", () => {
  const { direkt, tiefer } = inhalt("");
  assert.deepEqual(namen(direkt), ["A Auge", "B Ohr", "Astroabend"]);
  assert.deepEqual(namen(tiefer), ["Teil 1", "Brennpunkt", "Brennweite", "Linse", "Schall"]);
});

test("Ordner-Note gehört zum Thema, nicht in die Notes", () => {
  const a = inhalt("").direkt.find((e) => e.name === "A Auge");
  assert.equal(a?.kind === "thema" && a.ordnerNote, `${basis}/A Auge/A Auge.md`);
  const b = inhalt("").direkt.find((e) => e.name === "B Ohr");
  assert.equal(b?.kind === "thema" && b.ordnerNote, null);
  assert.deepEqual(namen(inhalt("A Auge").direkt), ["Teil 1", "Brennweite", "Linse"]);
});

test("Unterthema: Inhalt, Ort relativ zur Ebene", () => {
  assert.deepEqual(namen(inhalt("A Auge/Teil 1").direkt), ["Brennpunkt"]);
  const tief = inhalt("").tiefer.find((e) => e.name === "Brennpunkt")!;
  assert.equal(tief.ort, "A Auge/Teil 1");
  assert.equal(inhalt("A Auge").tiefer.find((e) => e.name === "Brennpunkt")!.ort, "Teil 1");
});

test("Suche: Ebene vor tieferen Treffern, Wortanfang zuerst; leer = nur die Ebene", () => {
  assert.deepEqual(namen(navSuche(inhalt(""), "")), ["A Auge", "B Ohr", "Astroabend"]);
  assert.deepEqual(namen(navSuche(inhalt(""), "brenn")), ["Brennpunkt", "Brennweite"]);
  assert.deepEqual(namen(navSuche(inhalt(""), "a")), ["A Auge", "Astroabend", "Schall"]);
  assert.deepEqual(namen(navSuche(inhalt(""), "l")), ["Linse", "Teil 1", "Schall"]);
});

test("amRand: Pfeiltasten wirken nur am Rand des Suchtexts", () => {
  assert.deepEqual(amRand("", 0, 0), { anfang: true, ende: true });
  assert.deepEqual(amRand("Phy", 0, 0), { anfang: true, ende: false });
  assert.deepEqual(amRand("Phy", 1, 1), { anfang: false, ende: false });
  assert.deepEqual(amRand("Phy", 3, 3), { anfang: false, ende: true });
  assert.deepEqual(amRand("Phy", 0, 3), { anfang: false, ende: false });
});
