import { test } from "node:test";
import assert from "node:assert/strict";
import { abweichungen, einordnen, faecherIn, pfadProps, themenVon, type Struktur } from "../src/pfad.ts";
import { DEFAULT_SETTINGS, stufenRegex } from "../src/defaults.ts";
import { dateiName, parseOverrides, themenPfad } from "../src/config.ts";

const schule = DEFAULT_SETTINGS.bereiche[0];
const hubs = new Set(["01-Schule/Physik/Physik.md", "01-Schule/Mathe/Mathe.md", "01-Schule/Deutsch/Deutsch.md"]);
const faecher = faecherIn(schule, ["Physik", "Mathe", "Deutsch", "Politik und Gesellschaft", "attachments", "Geschichte"], (p) => hubs.has(p), DEFAULT_SETTINGS.overrides, DEFAULT_SETTINGS.ignoriert);
const s: Struktur = { bereiche: DEFAULT_SETTINGS.bereiche, faecher: new Map([["schule", faecher]]), ignoriert: DEFAULT_SETTINGS.ignoriert, stufe: stufenRegex(DEFAULT_SETTINGS.stufenMuster) };

test("Fächer: Ordner, Hub, Override, ignorierte Ordner", () => {
  assert.deepEqual(
    faecher.map((f) => [f.name, f.hub]),
    [["Deutsch", "Deutsch"], ["Geschichte", ""], ["Mathe", "Mathe"], ["Physik", "Physik"], ["Politik und Gesellschaft", "PuG"]],
  );
});

test("einordnen: Thema, Unterthema, Stufe, Hub", () => {
  const e = einordnen("01-Schule/Physik/A Auge/Linsen.md", s)!;
  assert.equal(e.fach.name, "Physik");
  assert.equal(e.thema, "A Auge");
  assert.equal(e.unterthema, null);
  assert.equal(e.istHub, false);
  const d = einordnen("01-Schule/Deutsch/Dramen/Maria Stuart/Akt 1.md", s)!;
  assert.deepEqual([d.thema, d.unterthema], ["Dramen", "Maria Stuart"]);
  const m = einordnen("01-Schule/Mathe/11/IV. Differenzieren/Ableitung.md", s)!;
  assert.deepEqual([m.stufe, m.thema, m.unterthema], ["11", "IV. Differenzieren", null]);
  assert.equal(einordnen("01-Schule/Physik/Physik.md", s)!.istHub, true);
  assert.equal(einordnen("01-Schule/Physik/Lose Note.md", s)!.thema, null);
});

test("einordnen: außerhalb, ignoriert, unbekanntes Fach", () => {
  assert.equal(einordnen("01-Schule/Schule.md", s), null);
  assert.equal(einordnen("01-Schule/Physik/attachments/x.md", s), null);
  assert.equal(einordnen("01-Schule/Physik/A Auge/Attachments/x.md", s), null);
  assert.equal(einordnen("02-Ressourcen/x.md", s), null);
  assert.equal(einordnen("01-Schule/Kunst/x.md", s), null);
  assert.equal(einordnen("01-Schule/Physik/A Auge/bild.png", s), null);
});

test("pfadProps: Link zum Hub, sonst Name; null für fehlende Teile", () => {
  assert.deepEqual(pfadProps(einordnen("01-Schule/Physik/A Auge/Linsen.md", s)!), {
    typ: "themennote",
    fach: "[[Physik]]",
    thema: "A Auge",
    unterthema: null,
    stufe: null,
  });
  assert.equal(pfadProps(einordnen("01-Schule/Geschichte/x.md", s)!).fach, "Geschichte");
  assert.equal(pfadProps(einordnen("01-Schule/Politik und Gesellschaft/x.md", s)!).fach, "[[PuG]]");
});

test("abweichungen: nur Unterschiede, null löscht nur Vorhandenes", () => {
  const soll = { typ: "themennote", thema: "A", unterthema: null };
  assert.deepEqual(abweichungen({ typ: "themennote", thema: "A" }, soll), {});
  assert.deepEqual(abweichungen({ typ: "themennote", thema: "B", unterthema: "x" }, soll), { thema: "A", unterthema: null });
  assert.deepEqual(abweichungen(undefined, soll), { typ: "themennote", thema: "A" });
});

test("themenVon: alle Ordner, rekursive Anzahl, zuletzt benutzte zuerst", () => {
  const t = themenVon(
    schule,
    faecher.find((f) => f.name === "Deutsch")!,
    ["01-Schule/Deutsch/Dramen", "01-Schule/Deutsch/Dramen/Maria Stuart", "01-Schule/Deutsch/Lyrik", "01-Schule/Deutsch/attachments", "01-Schule/Mathe/X"],
    [
      { path: "01-Schule/Deutsch/Dramen/Maria Stuart/a.md", mtime: 5 },
      { path: "01-Schule/Deutsch/Dramen/b.md", mtime: 2 },
      { path: "01-Schule/Deutsch/Lyrik/c.md", mtime: 9 },
      { path: "01-Schule/Deutsch/lose.md", mtime: 10 },
    ],
    DEFAULT_SETTINGS.ignoriert,
  );
  assert.deepEqual(t.map((x) => [x.pfad, x.anzahl, x.zuletzt]), [["Lyrik", 1, 9], ["Dramen", 2, 5], ["Dramen/Maria Stuart", 1, 5]]);
});

test("Namen: verbotene Zeichen, Themenpfade", () => {
  assert.equal(dateiName('Was ist "Licht"? #1 [neu]'), "Was ist Licht 1 neu");
  assert.equal(dateiName("a/b"), "a-b");
  assert.equal(themenPfad(" Dramen / Maria: Stuart /"), "Dramen/Maria Stuart");
  assert.deepEqual(parseOverrides("# Kommentar\nPolitik und Gesellschaft | PuG | PuG\nKunst"), [
    { folder: "Politik und Gesellschaft", name: "PuG", hub: "PuG" },
    { folder: "Kunst", name: "Kunst", hub: "Kunst" },
  ]);
});
