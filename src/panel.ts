import { ItemView, MarkdownView, TFile, normalizePath, parseYaml, setIcon, setTooltip, type WorkspaceLeaf } from "obsidian";
import { farbSchluessel, nachbarn, themaFarbe, type Zeilenhoehe } from "./ansicht.ts";
import { ANZEIGE_EVENT, LEISTE_KNOEPFE, SCHALTER } from "./anzeige.ts";
import type { Bereich, Fach } from "./config.ts";
import { setzeThemaFarbe } from "./gruppen.ts";
import type ThemenNotesPlugin from "./main";
import { SPALTEN, type BaseDatei } from "./spalten.ts";
import { tagList } from "./tags.ts";
import { ANSICHTEN } from "./templates.ts";
import { kurzZeit, parseStempel } from "./zeit.ts";

export const PANEL_VIEW = "themen-notes-panel";
const OFFEN_KEY = "themen-notes-panel-offen";

/**
 * Steuer-Panel für die Seitenleiste: folgt der zuletzt aktiven Markdown-Note.
 * Oben Knöpfe für die häufigsten Aktionen, darunter einklappbare Abschnitte zum Anpassen.
 */
export class ThemenPanel extends ItemView {
  private plugin: ThemenNotesPlugin;
  private file: TFile | null = null;
  private offen: Record<string, boolean>;
  /** Zähler gegen parallele render()-Läufe: nur der letzte Lauf darf weiter anhängen. */
  private renderGen = 0;
  private spaltenAnsicht: string = ANSICHTEN[0];

  constructor(leaf: WorkspaceLeaf, plugin: ThemenNotesPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.offen = (this.app.loadLocalStorage(OFFEN_KEY) as Record<string, boolean> | null) ?? { ansicht: true, farben: false, spalten: false, darstellung: true, leiste: false, zuletzt: true };
  }

  getViewType(): string {
    return PANEL_VIEW;
  }

  getDisplayText(): string {
    return "Themen-Panel";
  }

  getIcon(): string {
    return "sliders-horizontal";
  }

  async onOpen(): Promise<void> {
    const ws = this.app.workspace;
    this.registerEvent(
      ws.on("active-leaf-change", (leaf) => {
        if (leaf?.view instanceof MarkdownView && leaf.view.file) {
          this.file = leaf.view.file;
          void this.render();
        }
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (f) => {
        if (f === this.file) void this.render();
      }),
    );
    this.registerEvent(
      ws.on("file-open", (f) => {
        if (f && f.extension === "md") {
          this.file = f;
          void this.render();
        }
      }),
    );
    this.registerEvent((ws as unknown as { on(name: string, cb: () => void): ReturnType<typeof ws.on> }).on(ANZEIGE_EVENT, () => void this.render()));
    this.file = ws.getActiveViewOfType(MarkdownView)?.file ?? ws.getActiveFile();
    await this.render();
  }

  async render(): Promise<void> {
    const gen = ++this.renderGen;
    const el = this.contentEl;
    const scroll = el.scrollTop;
    el.empty();
    el.addClass("themen-panel");
    const p = this.plugin;
    const file = this.file;
    const art = p.art(file);
    const e = file ? p.einordnung(file.path) : null;
    const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter ?? {} : {};

    // ---------- Kopf ----------
    const kopf = el.createDiv({ cls: "themen-panel-kopf" });
    setIcon(kopf.createSpan({ cls: "themen-panel-kopf-icon" }), art === "hub" ? "house" : art === "note" ? "file-text" : "file");
    kopf.createSpan({ cls: "themen-panel-titel", text: file?.basename ?? "Keine Note aktiv" });
    if (art) kopf.createSpan({ cls: "themen-badge", text: art === "hub" ? "Hub" : "Note" });

    // ---------- Knöpfe ----------
    const kacheln = el.createDiv({ cls: "themen-kacheln" });
    if (art === "hub" && e && file) {
      const st = p.fachStats(e.bereich, e.fach);
      kachel(kacheln, "plus", "Neu", `Neue Note in ${e.fach.name}`, () => p.waehleThema(e.bereich, e.fach));
      kachel(kacheln, "list-tree", "Themen", "Ansicht „Nach Thema“", () => void p.zeigeAnsicht(file, "Nach Thema"));
      kachel(kacheln, "history", "Zuletzt", "Ansicht „Zuletzt bearbeitet“", () => void p.zeigeAnsicht(file, "Zuletzt bearbeitet"));
      kachel(kacheln, "file-question", "Prüfen", "Ansicht „Ohne Properties“", () => void p.zeigeAnsicht(file, "Ohne Properties"), st.ohneProps || undefined);
      const zahlen = el.createDiv({ cls: "themen-panel-zahlen" });
      zahl(zahlen, st.notes, "Notes");
      zahl(zahlen, st.themen, "Themen");
      zahl(zahlen, st.ohneProps, "ohne Properties");
    } else if (art === "note" && e && file) {
      const nb = nachbarn(p.notesImOrdner(file), file.path);
      const geh = (path: string | null) => {
        const f = path ? this.app.vault.getAbstractFileByPath(path) : null;
        if (f instanceof TFile) void p.open(f);
      };
      const hub = p.hubDatei(e.bereich, e.fach);
      if (hub) kachel(kacheln, "house", "Hub", `Hub ${e.fach.name}`, () => void p.open(hub));
      kachel(kacheln, "chevron-left", "Vorige", "Vorige Note im Ordner", () => geh(nb.prev)).toggleClass("is-disabled", !nb.prev);
      kachel(kacheln, "chevron-right", "Nächste", "Nächste Note im Ordner", () => geh(nb.next)).toggleClass("is-disabled", !nb.next);
      kachel(kacheln, "file-plus", "+ Thema", "Neue Note im selben Thema", () => p.neueNoteHier(file));
      kachel(kacheln, "folder-plus", "+ Fach", `Neue Note in ${e.fach.name}`, () => p.waehleThema(e.bereich, e.fach, p.themaPfadVon(file)));
      const info = el.createDiv({ cls: "themen-panel-info" });
      zeile(info, "Fach", e.fach.name);
      zeile(info, "Thema", `${e.thema ?? "–"}${nb.von ? ` · ${nb.pos}/${nb.von}` : ""}`);
      if (e.unterthema) zeile(info, "Unterthema", e.unterthema);
      if (e.stufe) zeile(info, "Stufe", e.stufe);
      const tags = tagList(fm.tags);
      if (tags.length) zeile(info, "Tags", tags.map((t) => `#${t}`).join(" "));
      const erstellt = parseStempel(fm.erstellt);
      const geaendert = parseStempel(fm.geaendert);
      if (erstellt) zeile(info, "Erstellt", kurzZeit(erstellt));
      if (geaendert) zeile(info, "Geändert", kurzZeit(geaendert));
      if (fm.typ !== "themennote") zeile(info, "Status", "noch ohne Properties (kommen bei der nächsten Bearbeitung)").addClass("themen-warn");
    } else {
      kachel(kacheln, "file-plus", "Neu", "Neue Themennote …", () => p.waehleFach());
    }

    // ---------- Hub: Ansicht, Themenfarben, Spalten ----------
    if (art === "hub" && e && file) {
      const aktuell = await p.ansichtVon(file);
      if (gen !== this.renderGen) return;
      this.abschnitt(el, "ansicht", "Ansicht im Hub", (box) => {
        const chips = box.createDiv({ cls: "themen-chips" });
        for (const v of ANSICHTEN) {
          const c = chips.createEl("button", { cls: "themen-chip", text: v });
          c.toggleClass("is-active", v === aktuell);
          c.addEventListener("click", () => void p.zeigeAnsicht(file, v));
        }
      });
      this.abschnitt(el, "farben", "Themenfarben", (box) => this.farben(box, e.bereich, e.fach));
      await this.abschnittAsync(el, "spalten", "Spalten", (box) => this.spalten(box));
      if (gen !== this.renderGen) return; // ein neuerer Lauf hat das Panel inzwischen neu aufgebaut
    }

    // ---------- Darstellung ----------
    this.abschnitt(el, "darstellung", "Darstellung", (box) => {
      const reihe = box.createDiv({ cls: "themen-toggle-reihe" });
      for (const s of SCHALTER) {
        const b = reihe.createEl("button", { cls: "themen-toggle clickable-icon" });
        setIcon(b, s.icon);
        setTooltip(b, `${s.name}: ${p.settings.anzeige[s.key] ? "an" : "aus"}\n${s.desc}`);
        b.toggleClass("is-active", p.settings.anzeige[s.key]);
        b.addEventListener("click", () => void p.anzeige.toggle(s.key));
      }
      const zh = box.createDiv({ cls: "themen-zeile-steuer" });
      zh.createSpan({ cls: "themen-panel-label", text: "Zeilen" });
      const seg = zh.createDiv({ cls: "themen-segment" });
      for (const [wert, text] of [["", "S"], ["medium", "M"], ["tall", "L"], ["extra", "XL"]] as [Zeilenhoehe, string][]) {
        const b = seg.createEl("button", { text });
        setTooltip(b, `Zeilenhöhe ${text} – mehr Platz für umbrechende Spalten`);
        b.toggleClass("is-active", p.settings.anzeige.zeilenhoehe === wert);
        b.addEventListener("click", () => void p.anzeige.set("zeilenhoehe", wert));
      }
      const gr = box.createDiv({ cls: "themen-zeile-steuer" });
      gr.createSpan({ cls: "themen-panel-label", text: "Themenköpfe" });
      const slider = gr.createEl("input", { type: "range", attr: { min: "1", max: "1.6", step: "0.05" } });
      slider.value = String(p.settings.anzeige.gruppenGroesse);
      setTooltip(slider, "Schriftgröße der Themenköpfe");
      slider.addEventListener("input", () => document.body.style.setProperty("--themen-gruppen-groesse", slider.value));
      slider.addEventListener("change", () => void p.anzeige.set("gruppenGroesse", Number(slider.value)));
    });

    // ---------- Leiste ----------
    this.abschnitt(el, "leiste", "Knöpfe der Leiste", (box) => {
      const chips = box.createDiv({ cls: "themen-chips" });
      for (const k of LEISTE_KNOEPFE) {
        const an = p.settings.anzeige.leisteKnoepfe[k.id] !== false;
        const c = chips.createEl("button", { cls: "themen-chip themen-chip-icon" });
        setIcon(c.createSpan(), k.icon);
        c.createSpan({ text: k.name });
        c.toggleClass("is-active", an);
        c.addEventListener("click", () => void p.anzeige.set("leisteKnoepfe", { ...p.settings.anzeige.leisteKnoepfe, [k.id]: !an }));
      }
    });

    // ---------- Zuletzt bearbeitet ----------
    const zuletzt = p.zuletztBearbeitet(e?.istHub ? e : null, 8);
    this.abschnitt(el, "zuletzt", e?.istHub ? `Zuletzt in ${e.fach.name}` : "Zuletzt bearbeitet", (box) => {
      if (!zuletzt.length) box.createDiv({ cls: "themen-panel-leer", text: "Noch keine Notes." });
      for (const f of zuletzt) {
        const r = box.createDiv({ cls: "themen-panel-link" });
        setIcon(r.createSpan(), "file-text");
        r.createSpan({ text: f.basename });
        r.createSpan({ cls: "themen-panel-label", text: kurzZeit(f.stat.mtime) });
        r.addEventListener("click", () => void p.open(f));
      }
    });
    el.scrollTop = scroll;
  }

  /** Themen des Fachs mit Farbfeld; oben die Standardfarbe. */
  private farben(box: HTMLElement, bereich: Bereich, fach: Fach): void {
    const p = this.plugin;
    const a = p.settings.anzeige;
    const std = box.createDiv({ cls: "themen-farbzeile" });
    const stdInput = std.createEl("input", { type: "color" });
    stdInput.value = a.gruppenFarbe || "#7c5cff";
    stdInput.addEventListener("change", () => void p.anzeige.set("gruppenFarbe", stdInput.value));
    std.createSpan({ cls: "themen-farbzeile-name", text: "Standardfarbe" });
    if (a.gruppenFarbe) zurueck(std, "Akzentfarbe des Themes verwenden", () => void p.anzeige.set("gruppenFarbe", ""));
    const themen = p
      .themen(bereich, fach)
      .filter((t) => !t.pfad.includes("/") && t.anzahl > 0 && !p.istStufe(t.pfad))
      .sort((x, y) => x.pfad.localeCompare(y.pfad, "de", { numeric: true }));
    for (const t of themen) {
      const z = box.createDiv({ cls: "themen-farbzeile" });
      const input = z.createEl("input", { type: "color" });
      const eigen = a.themaFarben[farbSchluessel(fach.name, t.pfad)];
      input.value = themaFarbe(a, fach.name, t.pfad) ?? "#7c5cff";
      input.toggleClass("is-standard", !eigen);
      input.addEventListener("change", () => void setzeThemaFarbe(p, fach.name, t.pfad, input.value));
      z.createSpan({ cls: "themen-farbzeile-name", text: t.pfad });
      z.createSpan({ cls: "themen-panel-label", text: String(t.anzahl) });
      if (eigen) zurueck(z, "Auf Standardfarbe zurücksetzen", () => void setzeThemaFarbe(p, fach.name, t.pfad, null));
    }
    box.createDiv({ cls: "themen-panel-leer", text: "Tipp: Rechtsklick auf einen Themenkopf im Hub." });
  }

  /** Spalten einer Ansicht der Base an-/abwählen (gilt für alle Hubs). */
  private async spalten(box: HTMLElement): Promise<void> {
    const p = this.plugin;
    const pfad = p.settings.basePath;
    const f = this.app.vault.getAbstractFileByPath(normalizePath(pfad));
    if (!(f instanceof TFile)) return void box.createDiv({ cls: "themen-panel-leer", text: `${pfad} fehlt – Befehl „Base-Datei anlegen/aktualisieren“.` });
    const base = (parseYaml(await this.app.vault.cachedRead(f)) ?? {}) as BaseDatei;
    const views = (base.views ?? []).filter((v) => v.type === "table" && v.name);
    if (!views.some((v) => v.name === this.spaltenAnsicht)) this.spaltenAnsicht = views[0]?.name ?? "";
    const auswahl = box.createEl("select", { cls: "dropdown" });
    for (const v of views) auswahl.createEl("option", { text: v.name!, value: v.name! });
    auswahl.value = this.spaltenAnsicht;
    auswahl.addEventListener("change", () => {
      this.spaltenAnsicht = auswahl.value;
      void this.render();
    });
    const order = views.find((v) => v.name === this.spaltenAnsicht)?.order ?? [];
    const chips = box.createDiv({ cls: "themen-chips" });
    for (const s of SPALTEN) {
      const an = order.includes(s.name);
      const c = chips.createEl("button", { cls: "themen-chip", text: s.label });
      c.toggleClass("is-active", an);
      c.addEventListener("click", () => {
        const neu = an ? order.filter((o) => o !== s.name) : [...order, s.name];
        void p.anzeige.spaltenSetzen(this.spaltenAnsicht, neu.filter((o) => o !== "file.name")).then(() => this.render());
      });
    }
    box.createDiv({ cls: "themen-panel-leer", text: `Gilt für alle Hubs, die ${p.baseName()} nutzen.` });
  }

  private abschnitt(el: HTMLElement, id: string, titel: string, inhalt: (box: HTMLElement) => void): void {
    const box = this.abschnittKopf(el, id, titel);
    if (box) inhalt(box);
  }

  private async abschnittAsync(el: HTMLElement, id: string, titel: string, inhalt: (box: HTMLElement) => Promise<void>): Promise<void> {
    const box = this.abschnittKopf(el, id, titel);
    if (box) await inhalt(box);
  }

  private abschnittKopf(el: HTMLElement, id: string, titel: string): HTMLElement | null {
    const offen = this.offen[id] !== false;
    const k = el.createDiv({ cls: "themen-panel-abschnitt" });
    setIcon(k.createSpan({ cls: "themen-panel-pfeil" }), offen ? "chevron-down" : "chevron-right");
    k.createSpan({ text: titel });
    k.addEventListener("click", () => {
      this.offen[id] = !offen;
      this.app.saveLocalStorage(OFFEN_KEY, this.offen);
      void this.render();
    });
    return offen ? el.createDiv({ cls: "themen-panel-box" }) : null;
  }
}

/** Knopf-Kachel: Icon groß, kurze Beschriftung, Tooltip mit der Langform, optional Zähler. */
function kachel(el: HTMLElement, icon: string, text: string, tooltip: string, fn: () => void, zaehler?: number): HTMLElement {
  const b = el.createEl("button", { cls: "themen-kachel" });
  setIcon(b.createSpan({ cls: "themen-kachel-icon" }), icon);
  b.createSpan({ cls: "themen-kachel-text", text });
  if (zaehler) b.createSpan({ cls: "themen-kachel-zaehler", text: String(zaehler) });
  setTooltip(b, tooltip);
  b.addEventListener("click", () => {
    if (!b.hasClass("is-disabled")) fn();
  });
  return b;
}

function zahl(el: HTMLElement, wert: number, label: string): void {
  const z = el.createDiv({ cls: "themen-panel-zahl" });
  z.createDiv({ cls: "themen-panel-zahl-wert", text: String(wert) });
  z.createDiv({ cls: "themen-panel-zahl-label", text: label });
}

function zeile(el: HTMLElement, label: string, wert: string): HTMLElement {
  const z = el.createDiv({ cls: "themen-panel-zeile" });
  z.createSpan({ cls: "themen-panel-label", text: label });
  z.createSpan({ text: wert });
  return z;
}

function zurueck(el: HTMLElement, tooltip: string, fn: () => void): void {
  const b = el.createEl("button", { cls: "clickable-icon themen-zurueck" });
  setIcon(b, "rotate-ccw");
  setTooltip(b, tooltip);
  b.addEventListener("click", fn);
}
