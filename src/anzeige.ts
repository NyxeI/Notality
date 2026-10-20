import { MarkdownView, TFile, normalizePath, parseYaml, setIcon, stringifyYaml } from "obsidian";
import { bodyClasses, knopfSichtbar, nachbarn, type AnzeigeSchalter, type AnzeigeSettings } from "./ansicht.ts";
import type ThemenNotesPlugin from "./main";
import { setzeSpalten, setzeTabellen, tabellenBreite, type BaseDatei } from "./spalten.ts";

export const ANZEIGE_EVENT = "themen-notes:anzeige";

export type NoteArt = "hub" | "note" | null;

/** Schalter mit Icon und Beschriftung – für Leiste, Panel, Einstellungen und Befehle. */
export const SCHALTER: { key: AnzeigeSchalter; icon: string; name: string; desc: string }[] = [
  { key: "kompakt", icon: "layout-list", name: "Kompakte Base-Ansichten", desc: "Werkzeugleiste und Rahmen der Themen-Base ausblenden (Sortieren/Filter erscheinen beim Darüberfahren)." },
  { key: "propertiesInNotes", icon: "list-tree", name: "Properties in Themennotes", desc: "Den Properties-Block (fach, thema, tags, erstellt, geändert …) in Themennotes zeigen." },
  { key: "menueleiste", icon: "panel-top", name: "Leiste in Notes", desc: "Schmale Leiste oben in Hubs und Themennotes mit Navigation und Schaltern." },
  { key: "volleBreite", icon: "move-horizontal", name: "Tabellen in voller Breite", desc: "Die Themen-Base nutzt die ganze Fensterbreite statt der Lesebreite." },
  { key: "bannerErben", icon: "image", name: "Banner für neue Notes", desc: "Neue Notes bekommen das Banner der Themen-Note (z. B. „A Auge/A Auge.md“) oder des Fach-Hubs." },
];

/** Knöpfe der Leiste (ID, Icon, Beschriftung) – im Panel ein-/ausschaltbar. */
export const LEISTE_KNOEPFE: { id: string; icon: string; name: string }[] = [
  { id: "neu", icon: "plus", name: "Neue Note" },
  { id: "hub", icon: "house", name: "Fach-Hub" },
  { id: "navigation", icon: "chevrons-left-right", name: "Vorige/nächste im Ordner" },
  { id: "schalter", icon: "toggle-right", name: "Anzeige-Schalter" },
  { id: "panel", icon: "sliders-horizontal", name: "Panel öffnen" },
];

/** Setzt Klassen an <body> und an den Markdown-Views und baut die Leisten. */
export class Anzeige {
  private plugin: ThemenNotesPlugin;

  constructor(plugin: ThemenNotesPlugin) {
    this.plugin = plugin;
  }

  apply(): void {
    const a = this.plugin.settings.anzeige;
    for (const [cls, on] of Object.entries(bodyClasses(a))) document.body.toggleClass(cls, on);
    document.body.style.setProperty("--themen-gruppen-groesse", String(a.gruppenGroesse));
    if (a.gruppenFarbe) document.body.style.setProperty("--themen-gruppe-standard", a.gruppenFarbe);
    else document.body.style.removeProperty("--themen-gruppe-standard");
    this.refresh();
    this.plugin.gruppen?.alle();
    this.plugin.app.workspace.trigger(ANZEIGE_EVENT);
  }

  async toggle(key: AnzeigeSchalter): Promise<void> {
    await this.set(key, !this.plugin.settings.anzeige[key]);
  }

  /** Einen Anzeige-Wert setzen, speichern und anwenden (bei Breite/Zeilenhöhe auch die Base anpassen). */
  async set<K extends keyof AnzeigeSettings>(key: K, value: AnzeigeSettings[K]): Promise<void> {
    this.plugin.settings.anzeige[key] = value;
    await this.plugin.saveSettings();
    if (key === "volleBreite" || key === "zeilenhoehe") {
      const a = this.plugin.settings.anzeige;
      await bearbeiteBase(this.plugin, this.plugin.settings.basePath, (base) => setzeTabellen(base, a.zeilenhoehe, tabellenBreite(a.volleBreite)));
    }
    this.apply();
  }

  /** Spalten einer Ansicht der Base setzen. */
  async spaltenSetzen(ansicht: string, spalten: string[]): Promise<void> {
    const breite = tabellenBreite(this.plugin.settings.anzeige.volleBreite);
    await bearbeiteBase(this.plugin, this.plugin.settings.basePath, (base) => void setzeSpalten(base, ansicht, spalten, breite));
  }

  /** Alle offenen Markdown-Views neu markieren. */
  refresh(): void {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView) this.decorate(leaf.view);
    }
  }

  decorate(view: MarkdownView): void {
    const art = this.plugin.art(view.file);
    view.containerEl.toggleClass("themen-hub", art === "hub");
    view.containerEl.toggleClass("themen-note", art === "note");
    view.contentEl.querySelector(":scope > .themen-notebar")?.remove();
    if (art && view.file && this.plugin.settings.anzeige.menueleiste) view.contentEl.prepend(this.notebar(view.file, art));
  }

  clear(): void {
    for (const cls of Object.keys(bodyClasses(this.plugin.settings.anzeige))) document.body.removeClass(cls);
    document.body.style.removeProperty("--themen-gruppen-groesse");
    document.body.style.removeProperty("--themen-gruppe-standard");
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      if (!(leaf.view instanceof MarkdownView)) continue;
      leaf.view.containerEl.removeClass("themen-hub", "themen-note");
      leaf.view.contentEl.querySelector(":scope > .themen-notebar")?.remove();
    }
  }

  /** Schmale Leiste: links Aktionen/Navigation, rechts die Schalter – nur die im Panel gewählten Knöpfe. */
  private notebar(file: TFile, art: Exclude<NoteArt, null>): HTMLElement {
    const p = this.plugin;
    const a = p.settings.anzeige;
    const zeige = (id: string) => knopfSichtbar(a, id);
    const bar = createDiv({ cls: "themen-notebar" });
    const links = bar.createDiv({ cls: "themen-notebar-links" });
    const rechts = bar.createDiv({ cls: "themen-notebar-rechts" });
    const e = p.einordnung(file.path);
    if (e && art === "hub") {
      if (zeige("neu")) knopf(links, "plus", `Neue Note in ${e.fach.name}`, () => p.waehleThema(e.bereich, e.fach), true);
    }
    if (e && art === "note") {
      const hub = p.hubDatei(e.bereich, e.fach);
      if (hub && zeige("hub")) knopf(links, "house", e.fach.name, () => void p.open(hub), true);
      if (zeige("navigation")) {
        const nb = nachbarn(p.notesImOrdner(file), file.path);
        const geh = (path: string | null) => {
          const f = path ? p.app.vault.getAbstractFileByPath(path) : null;
          if (f instanceof TFile) void p.open(f);
        };
        knopf(links, "chevron-left", "Vorige Note im Ordner", () => geh(nb.prev)).toggleClass("is-disabled", !nb.prev);
        const ort = [e.thema, e.unterthema].filter(Boolean).join(" › ") || "ohne Thema";
        links.createSpan({ cls: "themen-notebar-text", text: `${ort} · ${nb.pos}/${nb.von}` });
        knopf(links, "chevron-right", "Nächste Note im Ordner", () => geh(nb.next)).toggleClass("is-disabled", !nb.next);
      }
      if (zeige("neu")) knopf(links, "plus", "Neue Note in diesem Thema", () => p.neueNoteHier(file));
    }
    if (zeige("schalter")) {
      for (const s of SCHALTER.filter((x) => x.key !== "menueleiste" && x.key !== "bannerErben")) {
        const b = knopf(rechts, s.icon, `${s.name}: ${a[s.key] ? "an" : "aus"}`, () => void p.anzeige.toggle(s.key));
        b.toggleClass("is-active", a[s.key]);
      }
    }
    if (zeige("panel")) knopf(rechts, "sliders-horizontal", "Themen-Panel öffnen", () => void p.openPanel());
    return bar;
  }
}

/** Base-Datei lesen, als Objekt ändern und zurückschreiben; Kommentarzeilen am Anfang bleiben erhalten. */
export async function bearbeiteBase(p: ThemenNotesPlugin, pfad: string, aendern: (base: BaseDatei) => void): Promise<boolean> {
  const f = p.app.vault.getAbstractFileByPath(normalizePath(pfad));
  if (!(f instanceof TFile)) return false;
  await p.app.vault.process(f, (text) => {
    const kopf = (/^(?:#[^\n]*\n)+/.exec(text) ?? [""])[0];
    const base = (parseYaml(text.slice(kopf.length)) ?? {}) as BaseDatei;
    aendern(base);
    return kopf + stringifyYaml(base);
  });
  return true;
}

function knopf(parent: HTMLElement, icon: string, label: string, fn: () => void, mitText = false): HTMLElement {
  const b = parent.createEl("button", { cls: "themen-notebar-knopf clickable-icon", attr: { "aria-label": label } });
  setIcon(b.createSpan(), icon);
  if (mitText) b.createSpan({ text: label });
  b.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (!b.hasClass("is-disabled")) fn();
  });
  return b;
}
