// Properties für vorhandene Notes nachrüsten: Plan und Probelauf-Bericht (pure).
import { t } from "./i18n.ts";
import { einordnen, type Struktur } from "./pfad.ts";
import { fremdeNote, propPlan } from "./props.ts";

export interface NoteDaten {
  path: string;
  fm: Record<string, unknown> | undefined;
  inline: string[];
  ctime: number;
  mtime: number;
  textDatum: number | null;
  /** Bisher vom Plugin übernommene Tags. */
  verwaltet?: string[];
}

export interface NachruestEintrag {
  path: string;
  fach: string;
  plan: Record<string, unknown>;
  /** Vom Plugin übernommene Tags nach dem Nachrüsten. */
  verwaltet: string[];
}

export interface NachruestPlan {
  eintraege: NachruestEintrag[];
  /** Notes im Bereich, die schon vollständig sind. */
  vollstaendig: number;
  hubs: string[];
  fremd: string[];
}

export function planNachruesten(notes: NoteDaten[], s: Struktur, jetzt = Date.now()): NachruestPlan {
  const out: NachruestPlan = { eintraege: [], vollstaendig: 0, hubs: [], fremd: [] };
  for (const n of notes) {
    const e = einordnen(n.path, s);
    if (!e) continue;
    if (e.istHub) {
      out.hubs.push(n.path);
      continue;
    }
    if (fremdeNote(n.fm)) {
      out.fremd.push(n.path);
      continue;
    }
    const { plan, verwaltet } = propPlan({ fm: n.fm, einordnung: e, fertig: n.inline, alle: n.inline, verwaltet: n.verwaltet ?? [], bearbeitet: false, jetzt, ctime: n.ctime, mtime: n.mtime, textDatum: n.textDatum, tagsEntfernen: false });
    if (Object.keys(plan).length) out.eintraege.push({ path: n.path, fach: e.fach.name, plan, verwaltet });
    else out.vollstaendig++;
  }
  return out;
}

const wert = (v: unknown) => (v === null ? t("r.entfernt") : Array.isArray(v) ? `[${v.join(", ")}]` : String(v));

/** Probelauf-Bericht als Markdown. */
export function nachruestBericht(p: NachruestPlan, titel = t("r.titel")): string {
  const proFach = new Map<string, NachruestEintrag[]>();
  for (const e of p.eintraege) proFach.set(e.fach, [...(proFach.get(e.fach) ?? []), e]);
  const schluessel = new Map<string, number>();
  for (const e of p.eintraege) for (const k of Object.keys(e.plan)) schluessel.set(k, (schluessel.get(k) ?? 0) + 1);
  const zeilen = [
    `# ${titel}`,
    "",
    `- ${t("r.zuAendern", { n: p.eintraege.length })}`,
    `- ${t("r.vollstaendig", { n: p.vollstaendig })}`,
    `- ${t("r.ausgelassen", { hubs: p.hubs.length, fremd: p.fremd.length })}`,
    "",
    `## ${t("r.properties")}`,
    "",
    `| ${t("r.property")} | ${t("r.notes")} |`,
    "|---|---|",
    ...[...schluessel].map(([k, n]) => `| ${k} | ${n} |`),
    "",
    `## ${t("r.jeFach")}`,
    "",
    `| ${t("r.fach")} | ${t("r.notes")} |`,
    "|---|---|",
    ...[...proFach].sort((a, b) => a[0].localeCompare(b[0], "de")).map(([f, l]) => `| ${f} | ${l.length} |`),
    "",
    `## ${t("r.beispiele")}`,
    "",
  ];
  for (const [, l] of [...proFach].sort((a, b) => a[0].localeCompare(b[0], "de"))) {
    for (const e of l.slice(0, 2)) {
      zeilen.push(`- \`${e.path}\``);
      for (const [k, v] of Object.entries(e.plan)) zeilen.push(`  - ${k}: ${wert(v)}`);
    }
  }
  zeilen.push("", `## ${t("r.hubs")}`, "", ...p.hubs.map((h) => `- \`${h}\``), "");
  zeilen.push(`## ${t("r.alle")}`, "", ...p.eintraege.map((e) => `- \`${e.path}\`: ${Object.keys(e.plan).join(", ")}`), "");
  return zeilen.join("\n");
}
