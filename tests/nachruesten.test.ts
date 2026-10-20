import { test } from "node:test";
import assert from "node:assert/strict";
import { nachruestBericht, planNachruesten } from "../src/nachruesten.ts";
import { faecherIn, type Struktur } from "../src/pfad.ts";
import { DEFAULT_SETTINGS } from "../src/defaults.ts";

const schule = DEFAULT_SETTINGS.bereiche[0];
const s: Struktur = {
  bereiche: DEFAULT_SETTINGS.bereiche,
  faecher: new Map([["schule", faecherIn(schule, ["Physik"], (p) => p === "01-Schule/Physik/Physik.md", [], [])]]),
  ignoriert: DEFAULT_SETTINGS.ignoriert,
  stufe: null,
};
const t = new Date(2026, 0, 5, 9, 30).getTime();
const n = (path: string, fm?: Record<string, unknown>, inline: string[] = []) => ({ path, fm, inline, ctime: t, mtime: t, textDatum: null });

test("planNachruesten: Hubs und Kanban aus, vollständige zählen, Rest planen", () => {
  const p = planNachruesten(
    [
      n("01-Schule/Physik/Physik.md"),
      n("01-Schule/Physik/Board.md", { "kanban-plugin": "board" }),
      n("01-Schule/Physik/A Auge/Linsen.md", { banner: "x" }, ["Physik"]),
      n("01-Schule/Physik/fertig.md", { typ: "themennote", fach: "[[Physik]]", erstellt: "2026-01-05T09:30", geaendert: "2026-01-05T09:30" }),
      n("02-Ressourcen/x.md"),
    ],
    s,
  );
  assert.deepEqual(p.hubs, ["01-Schule/Physik/Physik.md"]);
  assert.deepEqual(p.fremd, ["01-Schule/Physik/Board.md"]);
  assert.equal(p.vollstaendig, 1);
  assert.equal(p.eintraege.length, 1);
  assert.deepEqual(p.eintraege[0].plan, { typ: "themennote", fach: "[[Physik]]", thema: "A Auge", erstellt: "2026-01-05T09:30", geaendert: "2026-01-05T09:30", tags: ["Physik"] });
  const b = nachruestBericht(p);
  assert.match(b, /\*\*Zu ändern:\*\* 1 Notes/);
  assert.match(b, /\| Physik \| 1 \|/);
});
