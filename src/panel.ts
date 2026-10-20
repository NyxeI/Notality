import { ItemView, MarkdownView, TFile, normalizePath, parseYaml, setIcon, setTooltip, type WorkspaceLeaf } from "obsidian";
import { farbSchluessel, nachbarn, themaFarbe, type Zeilenhoehe } from "./ansicht.ts";
import { ANZEIGE_EVENT, LEISTE_KNOEPFE, SCHALTER } from "./anzeige.ts";
import type { Bereich, Fach } from "./config.ts";
import { setzeThemaFarbe } from "./gruppen.ts";
import type ThemenNotesPlugin from "./main";
import { SPALTEN, type BaseDatei } from "./spalten.ts";
import { tagList } from "./tags.ts";
import { ANSICHTEN, ansichtName, type AnsichtKey } from "./templates.ts";
import { t } from "./i18n.ts";
import { kurzZeit, parseStempel } from "./zeit.ts";

export const PANEL_VIEW = "notality-panel";
const OFFEN_KEY = "notality-panel-offen";

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
  private spaltenAnsicht: string = ansichtName("thema");

  constructor(leaf: WorkspaceLeaf, plugin: ThemenNotesPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.offen = (this.app.loadLocalStorage(OFFEN_KEY) as Record<string, boolean> | null) ?? { ansicht: true, farben: false, spalten: false, darstellung: true, leiste: false, zuletzt: true };
  }

  getViewType(): string {
    return PANEL_VIEW;
  }

  getDisplayText(): string {
    return t("p.titel");
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
    kopf.createSpan({ cls: "themen-panel-titel", text: file?.basename ?? t("p.keineNote") });
    if (art) kopf.createSpan({ cls: "themen-badge", text: art === "hub" ? t("p.hub") : t("p.note") });

    // ---------- Knöpfe ----------
    const kacheln = el.createDiv({ cls: "themen-kacheln" });
    if (art === "hub" && e && file) {
      const st = p.fachStats(e.bereich, e.fach);
      const ansicht = (key: AnsichtKey) => t("p.ansicht", { name: ansichtName(key) });
      kachel(kacheln, "plus", t("p.neu"), t("l.neuIn", { fach: e.fach.name }), () => p.waehleThema(e.bereich, e.fach));
      kachel(kacheln, "list-tree", t("p.themen"), ansicht("thema"), () => void p.zeigeAnsicht(file, "thema"));
      kachel(kacheln, "history", t("p.zuletzt"), ansicht("zuletzt"), () => void p.zeigeAnsicht(file, "zuletzt"));
      kachel(kacheln, "file-question", t("p.pruefen"), ansicht("ohne"), () => void p.zeigeAnsicht(file, "ohne"), st.ohneProps || undefined);
      const zahlen = el.createDiv({ cls: "themen-panel-zahlen" });
      zahl(zahlen, st.notes, t("p.notes"));
      zahl(zahlen, st.themen, t("p.themen"));
      zahl(zahlen, st.ohneProps, t("p.ohneProps"));
    } else if (art === "note" && e && file) {
      const nb = nachbarn(p.notesImOrdner(file), file.path);
      const geh = (path: string | null) => {
        const f = path ? this.app.vault.getAbstractFileByPath(path) : null;
        if (f instanceof TFile) void p.open(f);
      };
      const hub = p.hubDatei(e.bereich, e.fach);
      if (hub) kachel(kacheln, "house", t("p.hub"), t("p.hubVon", { fach: e.fach.name }), () => void p.open(hub));
      kachel(kacheln, "chevron-left", t("p.vorige"), t("l.vorige"), () => geh(nb.prev)).toggleClass("is-disabled", !nb.prev);
      kachel(kacheln, "chevron-right", t("p.naechste"), t("l.naechste"), () => geh(nb.next)).toggleClass("is-disabled", !nb.next);
      kachel(kacheln, "file-plus", t("p.plusThema"), t("p.plusThema.tip"), () => p.neueNoteHier(file));
      kachel(kacheln, "folder-plus", t("p.plusFach"), t("l.neuIn", { fach: e.fach.name }), () => p.waehleThema(e.bereich, e.fach, p.themaPfadVon(file)));
      const info = el.createDiv({ cls: "themen-panel-info" });
      zeile(info, t("p.fach"), e.fach.name);
      zeile(info, t("p.thema"), `${e.thema ?? "–"}${nb.von ? ` · ${nb.pos}/${nb.von}` : ""}`);
      if (e.unterthema) zeile(info, t("p.unterthema"), e.unterthema);
      if (e.stufe) zeile(info, t("p.stufe"), e.stufe);
      const tags = tagList(fm.tags);
      if (tags.length) zeile(info, t("p.tags"), tags.map((t) => `#${t}`).join(" "));
      const erstellt = parseStempel(fm.erstellt);
      const geaendert = parseStempel(fm.geaendert);
      if (erstellt) zeile(info, t("p.erstellt"), kurzZeit(erstellt));
      if (geaendert) zeile(info, t("p.geaendert"), kurzZeit(geaendert));
      if (fm.typ !== "themennote") zeile(info, t("p.status"), t("p.ohnePropsHinweis")).addClass("themen-warn");
    } else {
      kachel(kacheln, "file-plus", t("p.neu"), t("p.neuTip"), () => p.waehleFach());
    }

    // ---------- Hub: Ansicht, Themenfarben, Spalten ----------
    if (art === "hub" && e && file) {
      const aktuell = await p.ansichtKeyVon(file);
      if (gen !== this.renderGen) return;
      this.abschnitt(el, "ansicht", t("p.ansichtImHub"), (box) => {
        const chips = box.createDiv({ cls: "themen-chips" });
        for (const k of ANSICHTEN) {
          const c = chips.createEl("button", { cls: "themen-chip", text: ansichtName(k) });
          c.toggleClass("is-active", k === aktuell);
          c.addEventListener("click", () => void p.zeigeAnsicht(file, k));
        }
      });
      this.abschnitt(el, "farben", t("p.themenfarben"), (box) => this.farben(box, e.bereich, e.fach));
      await this.abschnittAsync(el, "spalten", t("p.spalten"), (box) => this.spalten(box));
      if (gen !== this.renderGen) return; // ein neuerer Lauf hat das Panel inzwischen neu aufgebaut
    }

    // ---------- Darstellung ----------
    this.abschnitt(el, "darstellung", t("p.darstellung"), (box) => {
      const reihe = box.createDiv({ cls: "themen-toggle-reihe" });
      for (const s of SCHALTER) {
        const b = reihe.createEl("button", { cls: "themen-toggle clickable-icon" });
        setIcon(b, s.icon);
        setTooltip(b, `${t(s.name)}: ${t(p.settings.anzeige[s.key] ? "an" : "aus")}\n${t(s.desc)}`);
        b.toggleClass("is-active", p.settings.anzeige[s.key]);
        b.addEventListener("click", () => void p.anzeige.toggle(s.key));
      }
      const zh = box.createDiv({ cls: "themen-zeile-steuer" });
      zh.createSpan({ cls: "themen-panel-label", text: t("p.zeilen") });
      const seg = zh.createDiv({ cls: "themen-segment" });
      for (const [wert, text] of [["", "S"], ["medium", "M"], ["tall", "L"], ["extra", "XL"]] as [Zeilenhoehe, string][]) {
        const b = seg.createEl("button", { text });
        setTooltip(b, t("p.zeilen.tip", { groesse: text }));
        b.toggleClass("is-active", p.settings.anzeige.zeilenhoehe === wert);
        b.addEventListener("click", () => void p.anzeige.set("zeilenhoehe", wert));
      }
      const gr = box.createDiv({ cls: "themen-zeile-steuer" });
      gr.createSpan({ cls: "themen-panel-label", text: t("p.koepfe") });
      const slider = gr.createEl("input", { type: "range", attr: { min: "1", max: "1.6", step: "0.05" } });
      slider.value = String(p.settings.anzeige.gruppenGroesse);
      setTooltip(slider, t("p.koepfe.tip"));
      slider.addEventListener("input", () => document.body.style.setProperty("--themen-gruppen-groesse", slider.value));
      slider.addEventListener("change", () => void p.anzeige.set("gruppenGroesse", Number(slider.value)));
    });

    // ---------- Leiste ----------
    this.abschnitt(el, "leiste", t("p.knoepfe"), (box) => {
      const chips = box.createDiv({ cls: "themen-chips" });
      for (const k of LEISTE_KNOEPFE) {
        const an = p.settings.anzeige.leisteKnoepfe[k.id] !== false;
        const c = chips.createEl("button", { cls: "themen-chip themen-chip-icon" });
        setIcon(c.createSpan(), k.icon);
        c.createSpan({ text: t(k.name) });
        c.toggleClass("is-active", an);
        c.addEventListener("click", () => void p.anzeige.set("leisteKnoepfe", { ...p.settings.anzeige.leisteKnoepfe, [k.id]: !an }));
      }
    });

    // ---------- Zuletzt bearbeitet ----------
    const zuletzt = p.zuletztBearbeitet(e?.istHub ? e : null, 8);
    this.abschnitt(el, "zuletzt", e?.istHub ? t("p.zuletztIn", { fach: e.fach.name }) : t("p.zuletztBearbeitet"), (box) => {
      if (!zuletzt.length) box.createDiv({ cls: "themen-panel-leer", text: t("p.nochKeine") });
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
    std.createSpan({ cls: "themen-farbzeile-name", text: t("p.standardfarbe") });
    if (a.gruppenFarbe) zurueck(std, t("p.akzent"), () => void p.anzeige.set("gruppenFarbe", ""));
    const themen = p
      .themen(bereich, fach)
      .filter((x) => !x.pfad.includes("/") && x.anzahl > 0 && !p.istStufe(x.pfad))
      .sort((x, y) => x.pfad.localeCompare(y.pfad, "de", { numeric: true }));
    for (const thema of themen) {
      const z = box.createDiv({ cls: "themen-farbzeile" });
      const input = z.createEl("input", { type: "color" });
      const eigen = a.themaFarben[farbSchluessel(fach.name, thema.pfad)];
      input.value = themaFarbe(a, fach.name, thema.pfad) ?? "#7c5cff";
      input.toggleClass("is-standard", !eigen);
      input.addEventListener("change", () => void setzeThemaFarbe(p, fach.name, thema.pfad, input.value));
      z.createSpan({ cls: "themen-farbzeile-name", text: thema.pfad });
      z.createSpan({ cls: "themen-panel-label", text: String(thema.anzahl) });
      if (eigen) zurueck(z, t("p.aufStandard"), () => void setzeThemaFarbe(p, fach.name, thema.pfad, null));
    }
    box.createDiv({ cls: "themen-panel-leer", text: t("p.tippRechtsklick") });
  }

  /** Spalten einer Ansicht der Base an-/abwählen (gilt für alle Hubs). */
  private async spalten(box: HTMLElement): Promise<void> {
    const p = this.plugin;
    const pfad = p.basePfad();
    const f = this.app.vault.getAbstractFileByPath(normalizePath(pfad));
    if (!(f instanceof TFile)) return void box.createDiv({ cls: "themen-panel-leer", text: t("p.baseFehlt", { pfad }) });
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
      const c = chips.createEl("button", { cls: "themen-chip", text: t(s.label) });
      c.toggleClass("is-active", an);
      c.addEventListener("click", () => {
        const neu = an ? order.filter((o) => o !== s.name) : [...order, s.name];
        void p.anzeige.spaltenSetzen(this.spaltenAnsicht, neu.filter((o) => o !== "file.name")).then(() => this.render());
      });
    }
    box.createDiv({ cls: "themen-panel-leer", text: t("p.giltFuer", { name: p.baseName() }) });
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
