import { FileSystemAdapter, MarkdownView, Notice, Platform, Plugin, TFile, TFolder, normalizePath, parseYaml, stringifyYaml } from "obsidian";
import { Anzeige, SCHALTER, type NoteArt } from "./anzeige.ts";
import { baseUpdate } from "./bases.ts";
import { dateiName, type Bereich, type Fach } from "./config.ts";
import { DEFAULT_SETTINGS, mergeSettings, stufenRegex, type ThemenSettings } from "./defaults.ts";
import { Gruppen } from "./gruppen.ts";
import { aktuelleAnsicht, planHub, setzeAnsicht } from "./hubs.ts";
import { ConfirmModal, FachModal, ThemaModal, TitelModal, type FachWahl, type ThemaChoice } from "./modals.ts";
import { nachruestBericht, planNachruesten, type NachruestPlan } from "./nachruesten.ts";
import { PANEL_VIEW, ThemenPanel } from "./panel.ts";
import { einordnen, faecherIn, themenVon, type Einordnung, type Struktur, type ThemaInfo } from "./pfad.ts";
import { fremdeNote, propPlan, textDatum, wendeAn } from "./props.ts";
import { ThemenSettingTab } from "./settings.ts";
import { Sync } from "./sync.ts";
import { inlineTags, tagList } from "./tags.ts";
import { DEFAULT_VORLAGE, fachBase, renderVorlage } from "./templates.ts";

const yaml = { parse: parseYaml, stringify: stringifyYaml };

export default class ThemenNotesPlugin extends Plugin {
  settings: ThemenSettings = DEFAULT_SETTINGS;
  sync = new Sync(this);
  anzeige = new Anzeige(this);
  gruppen: Gruppen | null = null;
  private strukturCache: Struktur | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.anzeige.apply();
    this.addSettingTab(new ThemenSettingTab(this.app, this));
    this.registerView(PANEL_VIEW, (leaf) => new ThemenPanel(leaf, this));
    this.addRibbonIcon("file-plus-2", "Neue Themennote", () => this.waehleFach());
    this.addRibbonIcon("sliders-horizontal", "Themen-Panel", () => void this.openPanel());

    // ---------- Neue Notes ----------
    this.addCommand({ id: "neue-themennote", name: "Neue Themennote …", callback: () => this.waehleFach() });
    this.addCommand({
      id: "themennote-aktuelles-fach",
      name: "Neue Themennote im Fach der aktuellen Note …",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        const e = file ? this.einordnung(file.path) : null;
        if (e && file) this.waehleThema(e.bereich, e.fach, e.istHub ? null : this.themaPfadVon(file));
        else this.waehleFach();
      },
    });
    this.addCommand({
      id: "themennote-aktuelles-thema",
      name: "Neue Themennote im Thema der aktuellen Note …",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const e = file ? this.einordnung(file.path) : null;
        if (!file || !e || e.istHub) return false;
        if (!checking) this.neueNoteHier(file);
        return true;
      },
    });

    // ---------- Anzeige ----------
    this.addCommand({ id: "panel-oeffnen", name: "Themen-Panel öffnen", callback: () => void this.openPanel() });
    for (const sch of SCHALTER) {
      this.addCommand({ id: `anzeige-${sch.key}`, name: `Anzeige umschalten: ${sch.name}`, callback: () => void this.anzeige.toggle(sch.key) });
    }

    // ---------- Properties, Base, Hubs ----------
    this.addCommand({
      id: "properties-aktuelle-note",
      name: "Properties der aktuellen Note jetzt abgleichen",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const e = file ? this.einordnung(file.path) : null;
        if (!file || !e || e.istHub) return false;
        if (!checking) void this.abgleichen(file);
        return true;
      },
    });
    this.addCommand({
      id: "properties-nachruesten",
      name: "Properties für alle vorhandenen Notes nachrüsten …",
      callback: () => void this.nachruestenDialog(),
    });
    this.addCommand({ id: "base-aktualisieren", name: "Base-Datei anlegen/aktualisieren", callback: () => void this.baseAktualisieren(true) });
    this.addCommand({ id: "hubs-einrichten", name: "Fach-Hubs einrichten (Base-Übersicht einbetten) …", callback: () => void this.hubsDialog() });

    this.registerEvent(this.app.vault.on("create", () => (this.strukturCache = null)));
    this.registerEvent(this.app.vault.on("delete", () => (this.strukturCache = null)));
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.vault.on("rename", (f, alt) => {
          this.strukturCache = null;
          if (f instanceof TFile) this.sync.verschoben(f, alt);
        }),
      );
      this.registerEvent(
        this.app.metadataCache.on("changed", (file) => {
          this.sync.geaendert(file);
          this.refreshAnzeigeBald();
        }),
      );
      this.registerEvent(this.app.workspace.on("layout-change", () => this.anzeige.refresh()));
      this.registerEvent(this.app.workspace.on("file-open", () => this.anzeige.refresh()));
      this.gruppen = new Gruppen(this);
      this.gruppen.start();
      this.anzeige.apply();
    });
  }

  onunload(): void {
    this.gruppen?.stop();
    this.anzeige.clear();
    this.sync.cancelAll();
  }

  async loadSettings(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    this.strukturCache = null;
    await this.saveData(this.settings);
  }

  private anzeigeTimer: number | null = null;
  /** Leisten nach Metadaten-Änderungen gebündelt neu bauen. */
  private refreshAnzeigeBald(): void {
    if (this.anzeigeTimer !== null) window.clearTimeout(this.anzeigeTimer);
    this.anzeigeTimer = window.setTimeout(() => {
      this.anzeigeTimer = null;
      this.anzeige.refresh();
    }, 500);
  }

  // ---------- Struktur ----------

  /** Bereiche, Fächer und Regeln – aus den Ordnern gelesen, bis sich etwas im Vault ändert. */
  struktur(): Struktur {
    if (this.strukturCache) return this.strukturCache;
    const s = this.settings;
    const faecher = new Map<string, Fach[]>();
    for (const b of s.bereiche) {
      const root = this.app.vault.getAbstractFileByPath(normalizePath(b.root));
      const unter = root instanceof TFolder ? root.children.filter((c): c is TFolder => c instanceof TFolder).map((c) => c.name) : [];
      faecher.set(b.id, faecherIn(b, unter, (p) => this.app.vault.getAbstractFileByPath(p) instanceof TFile, s.overrides, s.ignoriert));
    }
    this.strukturCache = { bereiche: s.bereiche, faecher, ignoriert: s.ignoriert, stufe: stufenRegex(s.stufenMuster) };
    return this.strukturCache;
  }

  einordnung(path: string): Einordnung | null {
    return einordnen(path, this.struktur());
  }

  art(file: TFile | null): NoteArt {
    if (!file || file.extension !== "md") return null;
    const e = this.einordnung(file.path);
    if (!e) return null;
    if (e.istHub) return "hub";
    return fremdeNote(this.app.metadataCache.getFileCache(file)?.frontmatter) ? null : "note";
  }

  istStufe(ordner: string): boolean {
    return !!this.struktur().stufe?.test(ordner);
  }

  fachOrdner(bereich: Bereich, fach: Fach): string {
    return normalizePath(`${bereich.root}/${fach.folder}`);
  }

  hubDatei(bereich: Bereich, fach: Fach): TFile | null {
    if (!fach.hub) return null;
    const f = this.app.vault.getAbstractFileByPath(`${this.fachOrdner(bereich, fach)}/${fach.hub}.md`);
    return f instanceof TFile ? f : null;
  }

  baseName(): string {
    return this.settings.basePath.split("/").pop() ?? this.settings.basePath;
  }

  /** Ordner der Note relativ zum Fachordner ("" = direkt im Fach). */
  themaPfadVon(file: TFile): string | null {
    const e = this.einordnung(file.path);
    if (!e) return null;
    const basis = this.fachOrdner(e.bereich, e.fach);
    const ordner = file.parent?.path ?? "";
    return ordner.length > basis.length ? ordner.slice(basis.length + 1) : null;
  }

  /** Themennotes (ohne Hub und fremde Notes) im selben Ordner. */
  notesImOrdner(file: TFile): string[] {
    const kinder = file.parent?.children ?? [];
    return kinder.filter((f): f is TFile => f instanceof TFile && this.art(f) === "note").map((f) => f.path);
  }

  themen(bereich: Bereich, fach: Fach): ThemaInfo[] {
    const ordner = this.app.vault.getAllFolders().map((f) => f.path);
    const notes = this.app.vault.getMarkdownFiles().map((f) => ({ path: f.path, mtime: f.stat.mtime }));
    return themenVon(bereich, fach, ordner, notes, this.settings.ignoriert);
  }

  /** Notes im Fach (ohne Hub), Themen und Notes ohne Properties – für Panel und Dialog. */
  fachStats(bereich: Bereich, fach: Fach): { notes: number; themen: number; ohneProps: number; zuletzt: number } {
    const out = { notes: 0, themen: 0, ohneProps: 0, zuletzt: 0 };
    const themen = new Set<string>();
    const prefix = this.fachOrdner(bereich, fach) + "/";
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.startsWith(prefix)) continue;
      const e = this.einordnung(f.path);
      if (!e || e.istHub) continue;
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fremdeNote(fm)) continue;
      out.notes++;
      out.zuletzt = Math.max(out.zuletzt, f.stat.mtime);
      if (e.thema) themen.add(e.thema);
      if (fm?.typ === undefined) out.ohneProps++;
    }
    out.themen = themen.size;
    return out;
  }

  /** Zuletzt geänderte Themennotes (optional nur eines Fachs). */
  zuletztBearbeitet(nur: Einordnung | null, anzahl: number): TFile[] {
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => {
        if (this.art(f) !== "note") return false;
        if (!nur) return true;
        const e = this.einordnung(f.path);
        return e?.bereich.id === nur.bereich.id && e.fach.folder === nur.fach.folder;
      })
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, anzahl);
  }

  // ---------- Neue Note: Fach → Thema → Titel ----------

  private fachWahlen(): FachWahl[] {
    const s = this.struktur();
    const wahl = s.bereiche
      .filter((b) => b.aktiv)
      .flatMap((bereich) => (s.faecher.get(bereich.id) ?? []).map((fach) => ({ bereich, fach, anzahl: 0, zuletzt: 0 })));
    for (const f of this.app.vault.getMarkdownFiles()) {
      const e = this.einordnung(f.path);
      if (!e || e.istHub) continue;
      const w = wahl.find((x) => x.bereich.id === e.bereich.id && x.fach.folder === e.fach.folder);
      if (!w) continue;
      w.anzahl++;
      w.zuletzt = Math.max(w.zuletzt, f.stat.mtime);
    }
    return wahl.sort((a, b) => b.zuletzt - a.zuletzt || a.fach.name.localeCompare(b.fach.name, "de"));
  }

  waehleFach(): void {
    const wahl = this.fachWahlen();
    if (!wahl.length) return void new Notice("Themen-Notes: keine Fächer gefunden – Bereichsordner in den Einstellungen prüfen.");
    new FachModal(this.app, wahl, (w) => this.waehleThema(w.bereich, w.fach)).open();
  }

  waehleThema(bereich: Bereich, fach: Fach, vorne: string | null = null): void {
    new ThemaModal(
      this.app,
      fach,
      this.themen(bereich, fach),
      (choice: ThemaChoice) => {
        const pfad = choice.kind === "none" ? null : choice.pfad;
        this.waehleTitel(bereich, fach, pfad);
      },
      vorne,
    ).open();
  }

  /** Titel für eine neue Note in `<Fach>/<pfad>` (null = direkt im Fach). */
  waehleTitel(bereich: Bereich, fach: Fach, pfad: string | null): void {
    const ordner = pfad ? `${this.fachOrdner(bereich, fach)}/${pfad}` : this.fachOrdner(bereich, fach);
    const f = this.app.vault.getAbstractFileByPath(ordner);
    const vorhanden = f instanceof TFolder ? f.children.filter((c): c is TFile => c instanceof TFile && this.art(c) === "note") : [];
    const krumen = [fach.name, ...(pfad ? pfad.split("/") : ["Ohne Thema"])];
    new TitelModal(this.app, krumen, ordner.slice(bereich.root.length + 1), vorhanden, (choice) => {
      if (choice.kind === "open") void this.open(choice.file);
      else void this.erstelleNote(ordner, choice.titel).catch((e) => new Notice(`Fehler: ${(e as Error).message}`));
    }).open();
  }

  /** Direkt zum Titel: neue Note im Ordner der aktuellen Note. */
  neueNoteHier(file: TFile): void {
    const e = this.einordnung(file.path);
    if (!e) return;
    this.waehleTitel(e.bereich, e.fach, this.themaPfadVon(file));
  }

  async erstelleNote(ordner: string, titel: string): Promise<TFile> {
    const name = dateiName(titel);
    if (!name) throw new Error("Bitte einen Titel eingeben.");
    const path = normalizePath(`${ordner}/${name}.md`);
    const vorhanden = this.app.vault.getAbstractFileByPath(path);
    if (vorhanden instanceof TFile) {
      new Notice("Diese Note gibt es schon – geöffnet.");
      await this.open(vorhanden);
      return vorhanden;
    }
    await ensureFolder(this, ordner);
    this.strukturCache = null;
    const e = this.einordnung(path);
    const vorlage = await readTemplate(this, this.settings.vorlage, DEFAULT_VORLAGE);
    const inhalt = renderVorlage(vorlage, {
      titel: name,
      fach: e?.fach.name ?? "",
      thema: e?.thema ?? "",
      datum: window.moment().format(this.datumsFormat()),
    });
    const neu = await this.app.vault.create(path, inhalt);
    if (e) {
      const jetzt = Date.now();
      const plan = propPlan({ fm: undefined, einordnung: e, inline: [], vorherInline: null, bearbeitet: true, jetzt, ctime: jetzt, mtime: jetzt, tagsEntfernen: false });
      const banner = this.settings.anzeige.bannerErben ? this.erbBanner(neu) : null;
      await this.app.fileManager.processFrontMatter(neu, (fm) => {
        // Plugin-Properties zuerst, danach die übrigen aus der Vorlage; Tags der Vorlage bleiben erhalten.
        const vorlagenFm = { ...fm };
        for (const k of Object.keys(fm)) delete fm[k];
        wendeAn(fm, { ...plan, tags: tagList(vorlagenFm.tags) });
        for (const [k, v] of Object.entries(vorlagenFm)) if (!(k in fm)) fm[k] = v;
        if (banner && fm.banner === undefined) fm.banner = banner;
      });
      await this.sync.merke(neu);
    }
    await this.open(neu);
    return neu;
  }

  /** Datumsformat der Core-Vorlagen ({{date}}), sonst YYYY-MM-DD. */
  private datumsFormat(): string {
    const t = (this.app as unknown as { internalPlugins?: { plugins?: Record<string, { instance?: { options?: { dateFormat?: string } } }> } }).internalPlugins?.plugins?.templates;
    return t?.instance?.options?.dateFormat || "YYYY-MM-DD";
  }

  /** Banner der nächsten Ordner-Note (A Auge/A Auge.md) bis hinauf zum Fach-Hub. */
  private erbBanner(file: TFile): unknown {
    const e = this.einordnung(file.path);
    if (!e) return null;
    const basis = this.fachOrdner(e.bereich, e.fach);
    for (let ordner = file.parent; ordner && ordner.path.startsWith(basis); ordner = ordner.parent) {
      const name = ordner.path === basis ? e.fach.hub : ordner.name;
      const note = name ? this.app.vault.getAbstractFileByPath(`${ordner.path}/${name}.md`) : null;
      if (note instanceof TFile && note !== file) {
        const b = this.app.metadataCache.getFileCache(note)?.frontmatter?.banner;
        if ((typeof b === "string" && b.trim()) || (Array.isArray(b) && b.length)) return b;
      }
      if (ordner.path === basis) break;
    }
    return null;
  }

  async open(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    // Immer im Bearbeitungsmodus öffnen, auch wenn der wiederverwendete Tab im Lesemodus war.
    await leaf.openFile(file, { active: true, state: { mode: "source" } });
    const view = leaf.view instanceof MarkdownView ? leaf.view : null;
    if (view && this.art(file) === "note") {
      const editor = view.editor;
      const last = editor.lastLine();
      editor.setCursor({ line: last, ch: editor.getLine(last).length });
      editor.focus();
    }
  }

  /** Steuer-Panel in der rechten Seitenleiste öffnen (oder zeigen). */
  async openPanel(): Promise<void> {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(PANEL_VIEW)[0];
    if (!leaf) {
      leaf = ws.getRightLeaf(false)!;
      await leaf.setViewState({ type: PANEL_VIEW, active: true });
    }
    await ws.revealLeaf(leaf);
  }

  // ---------- Properties ----------

  /** Aktuelle Note sofort abgleichen, als wäre sie gerade bearbeitet worden. */
  async abgleichen(file: TFile): Promise<void> {
    const e = this.einordnung(file.path);
    if (!e) return;
    const cache = this.app.metadataCache.getFileCache(file);
    const text = await this.app.vault.read(file);
    const plan = propPlan({
      fm: cache?.frontmatter,
      einordnung: e,
      inline: inlineTags(cache?.tags),
      vorherInline: null,
      bearbeitet: false,
      jetzt: Date.now(),
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
      textDatum: textDatum(text),
      tagsEntfernen: false,
    });
    if (!Object.keys(plan).length) return void new Notice("Properties sind aktuell.");
    await this.app.fileManager.processFrontMatter(file, (fm) => wendeAn(fm, plan));
    await this.sync.merke(file);
    new Notice(`Aktualisiert: ${Object.keys(plan).join(", ")}`);
  }

  /** Plan fürs Nachrüsten aller Notes in den aktiven Bereichen. */
  async nachruestPlan(): Promise<NachruestPlan> {
    const daten = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.einordnung(f.path)) continue;
      const cache = this.app.metadataCache.getFileCache(f);
      daten.push({
        path: f.path,
        fm: cache?.frontmatter,
        inline: inlineTags(cache?.tags),
        ctime: f.stat.ctime,
        mtime: f.stat.mtime,
        textDatum: textDatum(await this.app.vault.cachedRead(f)),
      });
    }
    return planNachruesten(daten, this.struktur());
  }

  async nachruestBericht(): Promise<string> {
    return nachruestBericht(await this.nachruestPlan());
  }

  private async nachruestenDialog(): Promise<void> {
    const plan = await this.nachruestPlan();
    if (!plan.eintraege.length) return void new Notice("Alle Notes haben ihre Properties schon.");
    const proFach = new Map<string, number>();
    for (const e of plan.eintraege) proFach.set(e.fach, (proFach.get(e.fach) ?? 0) + 1);
    const liste = [...proFach].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(", ");
    new ConfirmModal(
      this.app,
      "Properties nachrüsten",
      `${plan.eintraege.length} Notes bekommen fach, thema, tags (aus den #tags im Text), erstellt und geaendert. Der Text der Notes bleibt unverändert; das Dateidatum wird wiederhergestellt.\n\n${liste}\n\nAusgelassen: ${plan.hubs.length} Hubs, ${plan.fremd.length} Kanban-/Excalidraw-Notes. Vorher ein Backup machen!`,
      () => void this.nachruesten(plan).then((r) => new Notice(`Nachgerüstet: ${r.ok} Notes, ${r.fehler.length} Fehler.`, 10000)),
    ).open();
  }

  /** Nachrüsten ausführen; das Dateidatum (mtime) bleibt erhalten, damit „geändert“ stimmt. */
  async nachruesten(plan: NachruestPlan): Promise<{ ok: number; fehler: string[] }> {
    const fehler: string[] = [];
    let ok = 0;
    const adapter = this.app.vault.adapter;
    const fs = Platform.isDesktopApp && adapter instanceof FileSystemAdapter ? (require("fs") as typeof import("fs")) : null;
    this.sync.paused = true;
    this.sync.cancelAll();
    try {
      for (const eintrag of plan.eintraege) {
        const f = this.app.vault.getAbstractFileByPath(eintrag.path);
        if (!(f instanceof TFile)) {
          fehler.push(`${eintrag.path}: fehlt`);
          continue;
        }
        try {
          const mtime = f.stat.mtime;
          await this.app.fileManager.processFrontMatter(f, (fm) => wendeAn(fm, eintrag.plan));
          if (fs && adapter instanceof FileSystemAdapter) {
            const t = new Date(mtime);
            await fs.promises.utimes(adapter.getFullPath(f.path), t, t);
          }
          await this.sync.merke(f);
          ok++;
        } catch (e) {
          fehler.push(`${eintrag.path}: ${(e as Error).message}`);
        }
      }
    } finally {
      // Nachlaufende Änderungsereignisse abwarten, dann die Automatik wieder einschalten
      window.setTimeout(() => {
        this.sync.cancelAll();
        this.sync.paused = false;
      }, 5000);
    }
    return { ok, fehler };
  }

  // ---------- Base und Hubs ----------

  /** Base-Datei anlegen oder auf Plugin-Stand bringen (Spalten aus dem Panel bleiben). */
  async baseAktualisieren(melden = false): Promise<boolean> {
    const pfad = normalizePath(this.settings.basePath);
    const f = this.app.vault.getAbstractFileByPath(pfad);
    const ist = f instanceof TFile ? await this.app.vault.read(f) : null;
    const neu = baseUpdate(fachBase(), ist, this.settings.anzeige, yaml);
    if (neu === null) {
      if (melden) new Notice(`${this.baseName()} ist aktuell.`);
      return false;
    }
    if (f instanceof TFile) await this.app.vault.modify(f, neu);
    else {
      const ordner = pfad.split("/").slice(0, -1).join("/");
      if (ordner) await ensureFolder(this, ordner);
      await this.app.vault.create(pfad, neu);
    }
    if (melden) new Notice(`${this.baseName()} ${f ? "aktualisiert" : "angelegt"}.`);
    return true;
  }

  /** Hubs, in die die Base noch eingebettet werden muss: Datei → neuer Inhalt. */
  async hubPlan(): Promise<Map<TFile, string>> {
    const out = new Map<TFile, string>();
    const s = this.struktur();
    for (const bereich of s.bereiche.filter((b) => b.aktiv)) {
      for (const fach of s.faecher.get(bereich.id) ?? []) {
        const hub = this.hubDatei(bereich, fach);
        if (!hub) continue;
        const neu = planHub(await this.app.vault.read(hub), this.baseName(), this.settings.standardAnsicht);
        if (neu !== null) out.set(hub, neu);
      }
    }
    return out;
  }

  private async hubsDialog(): Promise<void> {
    const plan = await this.hubPlan();
    if (!plan.size) {
      await this.baseAktualisieren();
      return void new Notice("Alle Fach-Hubs zeigen die Base schon.");
    }
    const namen = [...plan.keys()].map((f) => f.basename).join(", ");
    new ConfirmModal(
      this.app,
      "Fach-Hubs einrichten",
      `${plan.size} Hubs bekommen oben „## Übersicht“ mit ![[${this.baseName()}#${this.settings.standardAnsicht}]]. Die Linklisten bleiben darunter unverändert.\n\n${namen}`,
      () => void this.hubsEinrichten(plan).then((n) => new Notice(`${n} Hubs eingerichtet.`)),
    ).open();
  }

  async hubsEinrichten(plan: Map<TFile, string>): Promise<number> {
    await this.baseAktualisieren();
    let n = 0;
    for (const [hub, inhalt] of plan) {
      await this.app.vault.process(hub, () => inhalt);
      n++;
    }
    return n;
  }

  async ansichtVon(hub: TFile): Promise<string | null> {
    return aktuelleAnsicht(await this.app.vault.cachedRead(hub), this.baseName());
  }

  /** Ansicht der Base-Einbettung im Hub wechseln (bleibt in der Note gespeichert). */
  async zeigeAnsicht(hub: TFile, ansicht: string): Promise<void> {
    let gefunden = false;
    await this.app.vault.process(hub, (c) => {
      const neu = setzeAnsicht(c, this.baseName(), ansicht);
      gefunden = neu !== null || aktuelleAnsicht(c, this.baseName()) !== null;
      return neu ?? c;
    });
    if (!gefunden) new Notice(`Keine Einbettung von ${this.baseName()} im Hub – Befehl „Fach-Hubs einrichten“.`);
    const offen = this.app.workspace.getLeavesOfType("markdown").find((l) => l.view instanceof MarkdownView && l.view.file === hub);
    if (offen) this.app.workspace.setActiveLeaf(offen, { focus: true });
    else await this.app.workspace.getLeaf(false).openFile(hub);
  }
}

export async function ensureFolder(p: Plugin, folder: string): Promise<void> {
  let current = "";
  for (const part of normalizePath(folder).split("/")) {
    current = current ? `${current}/${part}` : part;
    const existing = p.app.vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) continue;
    if (existing) throw new Error(`„${current}“ ist eine Datei, kein Ordner.`);
    await p.app.vault.createFolder(current);
  }
}

export async function readTemplate(p: Plugin, path: string, fallback: string): Promise<string> {
  if (!path.trim()) return fallback;
  const file = p.app.vault.getAbstractFileByPath(normalizePath(path.endsWith(".md") ? path : `${path}.md`));
  return file instanceof TFile ? p.app.vault.read(file) : fallback;
}
