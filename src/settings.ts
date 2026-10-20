import { AbstractInputSuggest, App, PluginSettingTab, Setting, TFolder } from "obsidian";
import { SCHALTER } from "./anzeige.ts";
import { formatOverrides, parseOverrides, type Bereich } from "./config.ts";
import { t } from "./i18n.ts";
import type ThemenNotesPlugin from "./main";
import { ANSICHTEN, ansichtName, type AnsichtKey } from "./templates.ts";

/** Vorschläge für Ordnerfelder: alle Ordner im Vault, passend zur Eingabe. */
class OrdnerSuggest extends AbstractInputSuggest<TFolder> {
  private input: HTMLInputElement;
  private onPick: (pfad: string) => void;

  constructor(app: App, input: HTMLInputElement, onPick: (pfad: string) => void) {
    super(app, input);
    this.input = input;
    this.onPick = onPick;
  }

  getSuggestions(query: string): TFolder[] {
    const q = query.toLowerCase();
    return this.app.vault
      .getAllFolders()
      .filter((f) => f.path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, 50);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    this.input.value = folder.path;
    this.input.dispatchEvent(new Event("input"));
    this.onPick(folder.path);
    this.close();
  }
}

export class ThemenSettingTab extends PluginSettingTab {
  private plugin: ThemenNotesPlugin;

  constructor(app: App, plugin: ThemenNotesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();
    containerEl.empty();

    // ---------- Bereiche (zuerst: ohne Ordner geht nichts) ----------
    new Setting(containerEl).setName(t("e.bereiche")).setHeading();
    for (const b of s.bereiche) this.bereich(containerEl, b, save);
    new Setting(containerEl)
      .setName(t("e.overrides"))
      .setDesc(t("e.overrides.desc"))
      .addTextArea((ta) => {
        ta.inputEl.rows = 4;
        ta.inputEl.cols = 45;
        ta.setValue(formatOverrides(s.overrides)).onChange(async (v) => {
          s.overrides = parseOverrides(v);
          await save();
        });
      });
    new Setting(containerEl)
      .setName(t("e.ignoriert"))
      .setDesc(t("e.ignoriert.desc"))
      .addTextArea((ta) => {
        ta.inputEl.rows = 4;
        ta.setValue(s.ignoriert.join("\n")).onChange(async (v) => {
          s.ignoriert = v.split("\n").map((x) => x.trim()).filter(Boolean);
          await save();
        });
      });
    this.text(containerEl, t("e.stufen"), t("e.stufen.desc"), s.stufenMuster, (v) => (s.stufenMuster = v), save);

    // ---------- Allgemein ----------
    new Setting(containerEl).setName(t("e.allgemein")).setHeading();
    new Setting(containerEl)
      .setName(t("e.auto"))
      .setDesc(t("e.auto.desc"))
      .addToggle((tg) =>
        tg.setValue(s.automatik).onChange(async (v) => {
          s.automatik = v;
          await save();
        }),
      );
    new Setting(containerEl)
      .setName(t("e.tagsWeg"))
      .setDesc(t("e.tagsWeg.desc"))
      .addToggle((tg) =>
        tg.setValue(s.tagsEntfernen).onChange(async (v) => {
          s.tagsEntfernen = v;
          await save();
        }),
      );
    this.text(containerEl, t("e.vorlage"), t("e.vorlage.desc"), s.vorlage, (v) => (s.vorlage = v), save);
    this.text(containerEl, t("e.base"), t("e.base.desc"), s.basePath, (v) => (s.basePath = v), save);
    new Setting(containerEl).setName(t("e.ansicht")).addDropdown((d) =>
      d
        .addOptions(Object.fromEntries(ANSICHTEN.map((k) => [k, ansichtName(k)])))
        .setValue(s.standardAnsicht)
        .onChange(async (v) => {
          s.standardAnsicht = v as AnsichtKey;
          await save();
        }),
    );

    // ---------- Anzeige ----------
    new Setting(containerEl).setName(t("e.anzeige")).setHeading();
    for (const sch of SCHALTER) {
      new Setting(containerEl)
        .setName(t(sch.name))
        .setDesc(t(sch.desc))
        .addToggle((tg) => tg.setValue(s.anzeige[sch.key]).onChange(() => void this.plugin.anzeige.toggle(sch.key)));
    }

    // ---------- Tastenkürzel, Sprache ----------
    new Setting(containerEl).setName(t("e.hotkeys")).setHeading();
    new Setting(containerEl).setName(t("e.hotkeys.vorschlag")).setDesc(t("e.hotkeys.desc"));
    new Setting(containerEl).setDesc(t("e.sprache"));
  }

  private bereich(el: HTMLElement, b: Bereich, save: () => Promise<void>): void {
    const name = b.name || b.root || t("e.ordnerFehlt");
    new Setting(el)
      .setName(t("e.bereich", { name }))
      .setDesc(t("e.bereich.desc", { art: t(b.property === "fach" ? "e.bereich.fach" : "e.bereich.kategorie"), property: b.property }))
      .addToggle((tg) =>
        tg.setValue(b.aktiv).onChange(async (v) => {
          b.aktiv = v;
          await save();
        }),
      );
    new Setting(el)
      .setName(t("e.ordner", { name }))
      .setDesc(t("e.ordner.desc"))
      .addText((tx) => {
        tx.setPlaceholder(t("e.ordnerFehlt")).setValue(b.root);
        const setze = async (v: string) => {
          b.root = v.trim().replace(/\/+$/, "");
          await save();
        };
        tx.onChange((v) => void setze(v));
        new OrdnerSuggest(this.app, tx.inputEl, (pfad) => void setze(pfad));
      });
  }

  private text(el: HTMLElement, name: string, desc: string, value: string, set: (v: string) => void, save: () => Promise<void>): void {
    new Setting(el)
      .setName(name)
      .setDesc(desc)
      .addText((tx) =>
        tx.setValue(value).onChange(async (v) => {
          set(v.trim());
          await save();
        }),
      );
  }
}
