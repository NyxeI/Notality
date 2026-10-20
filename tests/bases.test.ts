import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYaml, stringifyYaml } from "./support/yaml.ts";
import { ANSICHTEN, ansichtKey, ansichtName, baseSprache, fachBase, renderVorlage } from "../src/templates.ts";
import { setzeSprache } from "../src/i18n.ts";
import { baseUpdate } from "../src/bases.ts";
import { setzeSpalten, tabellenBreite } from "../src/spalten.ts";
import { aktuelleAnsicht, planHub, setzeAnsicht } from "../src/hubs.ts";
import { nachbarn } from "../src/ansicht.ts";
import { DEFAULT_ANZEIGE } from "../src/ansicht.ts";

const yaml = { parse: parseYaml, stringify: stringifyYaml };

test("fachBase: alle Ansichten, this-Filter je Ansicht, Gruppierung nach Thema", () => {
  const b = parseYaml(fachBase()) as any;
  assert.deepEqual(b.views.map((v: any) => v.name), ANSICHTEN.map((k) => ansichtName(k)));
  assert.equal(b.views[0].name, "Nach Thema");
  for (const v of b.views) assert.ok(v.filters.and.includes("file.inFolder(this.file.folder)"), v.name);
  assert.equal(b.views[0].groupBy.property, "thema");
  assert.equal(b.properties["note.geaendert"].displayName, "Geändert");
  assert.ok(b.views[5].filters.and.includes('file.hasTag("Abi_Relevant")'));
});

test("baseUpdate: fehlt → anlegen, gleich → nichts, Panel-Spalten bleiben", () => {
  const soll = fachBase();
  assert.equal(baseUpdate(soll, null, DEFAULT_ANZEIGE, yaml), soll);
  assert.equal(baseUpdate(soll, soll, DEFAULT_ANZEIGE, yaml), null);
  const ist = parseYaml(soll) as any;
  setzeSpalten(ist, "Nach Thema", ["file.tags"], tabellenBreite(false));
  const istText = stringifyYaml(ist);
  assert.equal(baseUpdate(soll, istText, DEFAULT_ANZEIGE, yaml), null);
  const kaputt = soll.replace("name: Neueste\n", "name: Neu\n");
  const neu = parseYaml(baseUpdate(soll, kaputt, DEFAULT_ANZEIGE, yaml)!) as any;
  assert.ok(neu.views.some((v: any) => v.name === "Neueste"));
});

test("planHub: unter Frontmatter und Tag-Zeile, Linkliste bleibt, idempotent", () => {
  const hub = "---\nbanner: \"[[b.jpg]]\"\n---\n#Physik\n\n### Stoff\n- [[A Auge]]\n";
  const neu = planHub(hub, "Themen.base", "Nach Thema")!;
  assert.equal(neu, "---\nbanner: \"[[b.jpg]]\"\n---\n#Physik\n## Übersicht\n![[Themen.base#Nach Thema]]\n\n### Stoff\n- [[A Auge]]\n");
  assert.equal(planHub(neu, "Themen.base", "Nach Thema"), null);
  assert.equal(planHub("### Stoff\n", "Themen.base", "Neueste"), "## Übersicht\n![[Themen.base#Neueste]]\n\n### Stoff\n");
  assert.equal(planHub("# Physik-12\nText", "Themen.base", "X"), "## Übersicht\n![[Themen.base#X]]\n\n# Physik-12\nText");
});

test("setzeAnsicht/aktuelleAnsicht", () => {
  const c = "a\n![[Themen.base#Nach Thema]]\nb";
  assert.equal(aktuelleAnsicht(c, "Themen.base"), "Nach Thema");
  assert.equal(setzeAnsicht(c, "Themen.base", "Neueste"), "a\n![[Themen.base#Neueste]]\nb");
  assert.equal(setzeAnsicht(c, "Themen.base", "Nach Thema"), null);
  assert.equal(setzeAnsicht("x", "Themen.base", "Neueste"), null);
});

test("nachbarn: gleicher Ordner, natürliche Sortierung", () => {
  const p = ["F/T/10 Zehn.md", "F/T/2 Zwei.md", "F/T/1 Eins.md", "F/U/3.md"];
  assert.deepEqual(nachbarn(p, "F/T/2 Zwei.md"), { prev: "F/T/1 Eins.md", next: "F/T/10 Zehn.md", pos: 2, von: 3 });
});

test("renderVorlage", () => {
  assert.equal(renderVorlage("# {{titel}}\n{{fach}} – {{thema}} – {{date}}", { titel: "Linsen", fach: "Physik", thema: "A Auge", datum: "20-10-2026" }), "# Linsen\nPhysik – A Auge – 20-10-2026");
});

test("Sprache: englische Base, Ansichtsnamen aus beiden Sprachen wiedererkennen", () => {
  setzeSprache("en");
  try {
    const b = parseYaml(fachBase("Themen.base")) as any;
    assert.equal(b.views[0].name, "By topic");
    assert.equal(b.properties["note.thema"].displayName, "Topic");
    assert.equal(planHub("x", "Themen.base", ansichtName("thema"), "Overview"), "## Overview\n![[Themen.base#By topic]]\n\nx");
  } finally {
    setzeSprache("de");
  }
  assert.equal(ansichtKey("By topic"), "thema");
  assert.equal(ansichtKey("Nach Thema"), "thema");
  assert.equal(ansichtKey("Irgendwas"), null);
  setzeSprache("fr");
  assert.equal(ansichtName("abi"), "Exam-relevant");
  setzeSprache("de-AT");
  assert.equal(ansichtName("abi"), "Abi-relevant");
  setzeSprache("de");
});

test("baseSprache: vorhandene Base behält ihre Sprache", () => {
  const de = fachBase("Themen.base", "de");
  const en = fachBase("Themen.base", "en");
  assert.equal(baseSprache(de), "de");
  assert.equal(baseSprache(en), "en");
  assert.equal(baseSprache("views: []"), null);
  // englische Oberfläche, deutsche Base → keine Änderung
  setzeSprache("en");
  try {
    assert.equal(baseUpdate(fachBase("Themen.base", baseSprache(de)!), de, DEFAULT_ANZEIGE, yaml), null);
  } finally {
    setzeSprache("de");
  }
});
