import { FileSystemAdapter, MarkdownView, Notice, Platform, Plugin, TFile, TFolder, getLanguage, normalizePath, parseYaml, stringifyYaml } from "obsidian";
import { Anzeige, SCHALTER, type NoteArt } from "./anzeige.ts";
import { baseUpdate } from "./bases.ts";
import { dateiName, type Bereich, type Fach } from "./config.ts";
import { DEFAULT_SETTINGS, basisPfad, mergeSettings, stufenRegex, type ThemenSettings } from "./defaults.ts";
import { alleSprachen, setzeSprache, t, type TextKey } from "./i18n.ts";
import { Gruppen } from "./gruppen.ts";
import { aktuelleAnsicht, planHub, setzeAnsicht } from "./hubs.ts";
import { ConfirmModal, FachModal, NavModal, ThemaModal, TitelModal, type FachWahl, type ThemaChoice } from "./modals.ts";
import { navInhalt } from "./navigation.ts";
import { nachruestBericht, planNachruesten, type NachruestPlan } from "./nachruesten.ts";
import { PANEL_VIEW, ThemenPanel } from "./panel.ts";
import { einordnen, faecherIn, themenVon, type Einordnung, type Struktur, type ThemaInfo } from "./pfad.ts";
import { fremdeNote, propPlan, textDatum, wendeAn } from "./props.ts";
import { ThemenSettingTab } from "./settings.ts";
import { Sync } from "./sync.ts";
import { inlineTags, tagList } from "./tags.ts";
import { DEFAULT_VORLAGE, ansichtKey, ansichtName, baseSprache, fachBase, renderVorlage, type AnsichtKey } from "./templates.ts";

const yaml = { parse: parseYaml, stringify: stringifyYaml };

export default class ThemenNotesPlugin extends Plugin {
  settings: ThemenSettings = DEFAULT_SETTINGS;
  sync = new Sync(this);
  anzeige = new Anzeige(this);
  gruppen: Gruppen | null = null;
  private strukturCache: Struktur | null = null;

  async onload(): Promise<void> {
    setzeSprache(getLanguage());
    await this.loadSettings();
    this.anzeige.apply();
    this.addSettingTab(new ThemenSettingTab(this.app, this));
    this.registerView(PANEL_VIEW, (leaf) => new ThemenPanel(leaf, this));
    this.addRibbonIcon("file-plus-2", t("ribbon.neu"), () => this.waehleFach());
    this.addRibbonIcon("sliders-horizontal", t("ribbon.panel"), () => void this.openPanel());
    this.addRibbonIcon("compass", t("ribbon.navigieren"), () => this.navigiere());

    // ---------- Neue Notes ----------
    this.addCommand({ id: "neue-themennote", name: t("cmd.neu"), callback: () => this.waehleFach() });
    this.addCommand({
      id: "themennote-aktuelles-fach",
      name: t("cmd.neuFach"),
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        const e = file ? this.einordnung(file.path) : null;
        if (e && file) this.waehleThema(e.bereich, e.fach, e.istHub ? null : this.themaPfadVon(file));
        else this.waehleFach();
      },
    });
    this.addCommand({
      id: "themennote-aktuelles-thema",
      name: t("cmd.neuThema"),
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const e = file ? this.einordnung(file.path) : null;
        if (!file || !e || e.istHub) return false;
        if (!checking) this.neueNoteHier(file);
        return true;
      },
    });

    // ---------- Navigieren ----------
    this.addCommand({ id: "navigieren", name: t("cmd.navigieren"), callback: () => this.navigiere() });

    // ---------- Anzeige ----------
    this.addCommand({ id: "panel-oeffnen", name: t("cmd.panel"), callback: () => void this.openPanel() });
    for (const sch of SCHALTER) {
      this.addCommand({ id: `anzeige-${sch.key}`, name: t("cmd.anzeige", { name: t(sch.name) }), callback: () => void this.anzeige.toggle(sch.key) });
    }

    // ---------- Properties, Base, Hubs ----------
    this.addCommand({
      id: "properties-aktuelle-note",
      name: t("cmd.abgleichen"),
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
      name: t("cmd.nachruesten"),
      callback: () => void this.nachruestenDialog(),
    });
    this.addCommand({ id: "base-aktualisieren", name: t("cmd.base"), callback: () => void this.baseAktualisieren(true) });
    this.addCommand({ id: "hubs-einrichten", name: t("cmd.hubs"), callback: () => void this.hubsDialog() });

    this.registerEvent(this.app.vault.on("create", () => (this.strukturCache = null)));
    this.registerEvent(
      this.app.vault.on("delete", (f) => {
        this.strukturCache = null;
        if (f instanceof TFile) this.setzeTagStand(f.path, []);
      }),
    );
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

  // ---------- Vom Plugin übernommene Tags (nur diese werden wieder entfernt) ----------

  private tagStandTimer: number | null = null;

  tagStand(path: string): string[] {
    return this.settings.tagStand[path] ?? [];
  }

  setzeTagStand(path: string, tags: string[]): void {
    const alt = this.settings.tagStand[path] ?? [];
    if (alt.length === tags.length && alt.every((t, i) => t === tags[i])) return;
    if (tags.length) this.settings.tagStand[path] = tags;
    else delete this.settings.tagStand[path];
    this.tagStandSpeichern();
  }

  tagStandVerschieben(alt: string, neu: string): void {
    const t = this.settings.tagStand[alt];
    if (!t) return;
    delete this.settings.tagStand[alt];
    this.settings.tagStand[neu] = t;
    this.tagStandSpeichern();
  }

  /** Gebündelt speichern – beim Tippen ändert sich der Stand oft. */
  private tagStandSpeichern(): void {
    if (this.tagStandTimer !== null) window.clearTimeout(this.tagStandTimer);
    this.tagStandTimer = window.setTimeout(() => {
      this.tagStandTimer = null;
      void this.saveData(this.settings);
    }, 2000);
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
      // Ohne festgelegten Ordner keine Fächer (sonst wäre jeder Ordner im Vault ein Fach)
      const root = b.root.trim() ? this.app.vault.getAbstractFileByPath(normalizePath(b.root)) : null;
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

  /** Pfad der Themen-Base (eingestellt oder neben den Fächern). */
  basePfad(): string {
    return normalizePath(basisPfad(this.settings));
  }

  baseName(): string {
    return this.basePfad().split("/").pop() ?? this.basePfad();
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
    if (!wahl.length) {
      new Notice(t("n.keineFaecher"), 8000);
      this.oeffneEinstellungen();
      return;
    }
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
      () => this.waehleFach(),
    ).open();
  }

  // ---------- Navigieren: Fach → Thema → Note ----------

  navigiere(): void {
    const wahl = this.fachWahlen();
    if (!wahl.length) {
      new Notice(t("n.keineFaecher"), 8000);
      this.oeffneEinstellungen();
      return;
    }
    new NavModal(this.app, wahl, {
      inhalt: (w, rel) => {
        const notes = this.app.vault.getMarkdownFiles().map((f) => ({ path: f.path, mtime: f.stat.mtime }));
        return navInhalt(this.fachOrdner(w.bereich, w.fach), rel, this.themen(w.bereich, w.fach), notes, this.settings.ignoriert, w.fach.hub);
      },
      hubPfad: (w) => this.hubDatei(w.bereich, w.fach)?.path ?? null,
      oeffne: (path, neuerTab) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (f instanceof TFile) void this.app.workspace.getLeaf(neuerTab ? "tab" : false).openFile(f);
      },
    }).open();
  }

  /** Titel für eine neue Note in `<Fach>/<pfad>` (null = direkt im Fach). */
  waehleTitel(bereich: Bereich, fach: Fach, pfad: string | null): void {
    const ordner = pfad ? `${this.fachOrdner(bereich, fach)}/${pfad}` : this.fachOrdner(bereich, fach);
    const f = this.app.vault.getAbstractFileByPath(ordner);
    const vorhanden = f instanceof TFolder ? f.children.filter((c): c is TFile => c instanceof TFile && this.art(c) === "note") : [];
    const krumen = [fach.name, ...(pfad ? pfad.split("/") : [t("m.ohneThema")])];
    new TitelModal(this.app, krumen, ordner.slice(bereich.root.length + 1), vorhanden, (choice) => {
      if (choice.kind === "open") void this.open(choice.file);
      else void this.erstelleNote(ordner, choice.titel).catch((e) => new Notice(t("fehler", { msg: (e as Error).message })));
    }, () => this.waehleThema(bereich, fach, pfad)).open();
  }

  /** Direkt zum Titel: neue Note im Ordner der aktuellen Note. */
  neueNoteHier(file: TFile): void {
    const e = this.einordnung(file.path);
    if (!e) return;
    this.waehleTitel(e.bereich, e.fach, this.themaPfadVon(file));
  }

  async erstelleNote(ordner: string, titel: string): Promise<TFile> {
    const name = dateiName(titel);
    if (!name) throw new Error(t("n.titelFehlt"));
    const path = normalizePath(`${ordner}/${name}.md`);
    const vorhanden = this.app.vault.getAbstractFileByPath(path);
    if (vorhanden instanceof TFile) {
      new Notice(t("n.gibtEsSchon"));
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
      const { plan } = propPlan({ fm: undefined, einordnung: e, fertig: [], alle: [], verwaltet: [], bearbeitet: true, jetzt, ctime: jetzt, mtime: jetzt, tagsEntfernen: false });
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
  /** Einstellungen des Plugins öffnen (z. B. wenn noch kein Ordner festgelegt ist). */
  oeffneEinstellungen(): void {
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
    setting?.open();
    setting?.openTabById(this.manifest.id);
  }

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
    const inline = inlineTags(cache?.tags);
    const { plan, verwaltet } = propPlan({
      fm: cache?.frontmatter,
      einordnung: e,
      fertig: inline,
      alle: inline,
      verwaltet: this.tagStand(file.path),
      bearbeitet: false,
      jetzt: Date.now(),
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
      textDatum: textDatum(text),
      tagsEntfernen: this.settings.tagsEntfernen,
    });
    this.setzeTagStand(file.path, verwaltet);
    if (!Object.keys(plan).length) return void new Notice(t("n.aktuell"));
    await this.app.fileManager.processFrontMatter(file, (fm) => wendeAn(fm, plan));
    await this.sync.merke(file);
    new Notice(t("n.aktualisiert", { keys: Object.keys(plan).join(", ") }));
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
        verwaltet: this.tagStand(f.path),
      });
    }
    return planNachruesten(daten, this.struktur());
  }

  async nachruestBericht(): Promise<string> {
    return nachruestBericht(await this.nachruestPlan());
  }

  private async nachruestenDialog(): Promise<void> {
    const plan = await this.nachruestPlan();
    if (!plan.eintraege.length) return void new Notice(t("n.alleVollstaendig"));
    const proFach = new Map<string, number>();
    for (const e of plan.eintraege) proFach.set(e.fach, (proFach.get(e.fach) ?? 0) + 1);
    const liste = [...proFach].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(", ");
    new ConfirmModal(
      this.app,
      t("c.nachruesten.titel"),
      t("c.nachruesten.text", { n: plan.eintraege.length, liste, hubs: plan.hubs.length, fremd: plan.fremd.length }),
      () => void this.nachruesten(plan).then((r) => new Notice(t("n.nachgeruestet", { ok: r.ok, fehler: r.fehler.length }), 10000)),
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
          fehler.push(`${eintrag.path}: ${t("n.fehlt")}`);
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
          this.setzeTagStand(f.path, eintrag.verwaltet);
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
    const pfad = this.basePfad();
    const f = this.app.vault.getAbstractFileByPath(pfad);
    const ist = f instanceof TFile ? await this.app.vault.read(f) : null;
    // Eine vorhandene Base behält ihre Sprache, sonst passten die Einbettungen (#Ansicht) in den Hubs nicht mehr
    const neu = baseUpdate(fachBase(this.baseName(), (ist && baseSprache(ist)) || undefined), ist, this.settings.anzeige, yaml);
    if (neu === null) {
      if (melden) new Notice(t("n.baseAktuell", { name: this.baseName() }));
      return false;
    }
    if (f instanceof TFile) await this.app.vault.modify(f, neu);
    else {
      const ordner = pfad.split("/").slice(0, -1).join("/");
      if (ordner) await ensureFolder(this, ordner);
      await this.app.vault.create(pfad, neu);
    }
    if (melden) new Notice(t(f ? "n.baseAktualisiert" : "n.baseAngelegt", { name: this.baseName() }));
    return true;
  }

  /** Hubs, in die die Base noch eingebettet werden muss: Datei → neuer Inhalt. */
  async hubPlan(): Promise<Map<TFile, string>> {
    const out = new Map<TFile, string>();
    const s = this.struktur();
    const ansicht = await this.ansichtInBase(this.settings.standardAnsicht);
    for (const bereich of s.bereiche.filter((b) => b.aktiv)) {
      for (const fach of s.faecher.get(bereich.id) ?? []) {
        const hub = this.hubDatei(bereich, fach);
        if (!hub) continue;
        const neu = planHub(await this.app.vault.read(hub), this.baseName(), ansicht, t("hub.ueberschrift"));
        if (neu !== null) out.set(hub, neu);
      }
    }
    return out;
  }

  private async hubsDialog(): Promise<void> {
    const plan = await this.hubPlan();
    if (!plan.size) {
      await this.baseAktualisieren();
      return void new Notice(t("n.hubsFertig"));
    }
    const namen = [...plan.keys()].map((f) => f.basename).join(", ");
    new ConfirmModal(
      this.app,
      t("c.hubs.titel"),
      t("c.hubs.text", { n: plan.size, kopf: t("hub.ueberschrift"), embed: `![[${this.baseName()}#${ansichtName(this.settings.standardAnsicht)}]]`, namen }),
      () => void this.hubsEinrichten(plan).then((n) => new Notice(t("n.hubsEingerichtet", { n }))),
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

  /** Ansicht der aktuellen Einbettung im Hub als Schlüssel (egal, in welcher Sprache die Base erzeugt wurde). */
  async ansichtKeyVon(hub: TFile): Promise<AnsichtKey | null> {
    const name = await this.ansichtVon(hub);
    return name ? ansichtKey(name) : null;
  }

  /** Name einer Ansicht, wie er in der Base-Datei steht (sie kann in einer anderen Sprache erzeugt worden sein). */
  async ansichtInBase(key: AnsichtKey): Promise<string> {
    const f = this.app.vault.getAbstractFileByPath(this.basePfad());
    if (f instanceof TFile) {
      const text = await this.app.vault.cachedRead(f);
      for (const name of alleSprachen(`v.${key}` as TextKey)) if (text.includes(`name: ${name}\n`)) return name;
    }
    return ansichtName(key);
  }

  /** Ansicht der Base-Einbettung im Hub wechseln (bleibt in der Note gespeichert). */
  async zeigeAnsicht(hub: TFile, key: AnsichtKey): Promise<void> {
    const ansicht = await this.ansichtInBase(key);
    let gefunden = false;
    await this.app.vault.process(hub, (c) => {
      const neu = setzeAnsicht(c, this.baseName(), ansicht);
      gefunden = neu !== null || aktuelleAnsicht(c, this.baseName()) !== null;
      return neu ?? c;
    });
    if (!gefunden) new Notice(t("n.keineEinbettung", { name: this.baseName() }));
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
    if (existing) throw new Error(t("n.istDatei", { pfad: current }));
    await p.app.vault.createFolder(current);
  }
}

export async function readTemplate(p: Plugin, path: string, fallback: string): Promise<string> {
  if (!path.trim()) return fallback;
  const file = p.app.vault.getAbstractFileByPath(normalizePath(path.endsWith(".md") ? path : `${path}.md`));
  return file instanceof TFile ? p.app.vault.read(file) : fallback;
}
