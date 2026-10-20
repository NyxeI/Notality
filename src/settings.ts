import { App, PluginSettingTab, Setting } from "obsidian";
import { SCHALTER } from "./anzeige.ts";
import { formatOverrides, parseOverrides, type Bereich } from "./config.ts";
import type ThemenNotesPlugin from "./main";
import { ANSICHTEN } from "./templates.ts";

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

    // ---------- Allgemein ----------
    new Setting(containerEl).setName("Allgemein").setHeading();
    new Setting(containerEl)
      .setName("Properties automatisch abgleichen")
      .setDesc("Beim Bearbeiten einer Note: fach/thema aus dem Ordner, fertig getippte #tags nach „tags“ (erst wenn der Cursor nicht mehr direkt dahinter steht), „geaendert“ auf jetzt. Notes, die du nicht anfasst, bleiben unverändert.")
      .addToggle((t) =>
        t.setValue(s.automatik).onChange(async (v) => {
          s.automatik = v;
          await save();
        }),
      );
    new Setting(containerEl)
      .setName("Gelöschte #tags auch aus „tags“ entfernen")
      .setDesc("Tags, die das Plugin aus dem Text übernommen hat, verschwinden wieder aus den Properties, wenn sie nicht mehr im Text stehen. Von Hand in den Properties eingetragene Tags bleiben immer.")
      .addToggle((t) =>
        t.setValue(s.tagsEntfernen).onChange(async (v) => {
          s.tagsEntfernen = v;
          await save();
        }),
      );
    this.text(containerEl, "Vorlage für neue Notes", "Pfad einer Note im Vault; leer = leere Note. Platzhalter: {{titel}}, {{fach}}, {{thema}}, {{date}}.", s.vorlage, (v) => (s.vorlage = v), save, true);
    this.text(containerEl, "Base-Datei", "Eine Base für alle Fach-Hubs; sie zeigt jeweils die Notes im Ordner des Hubs.", s.basePath, (v) => (s.basePath = v), save);
    new Setting(containerEl)
      .setName("Ansicht beim Einrichten der Hubs")
      .addDropdown((d) =>
        d
          .addOptions(Object.fromEntries(ANSICHTEN.map((a) => [a, a])))
          .setValue(s.standardAnsicht)
          .onChange(async (v) => {
            s.standardAnsicht = v;
            await save();
          }),
      );

    // ---------- Bereiche ----------
    new Setting(containerEl).setName("Bereiche und Fächer").setHeading();
    for (const b of s.bereiche) this.bereich(containerEl, b, save);
    new Setting(containerEl)
      .setName("Abweichende Fächer")
      .setDesc("Eine Zeile pro Fachordner: Ordner | Name | Hub (Hub = Note im Fachordner ohne .md). Sonst gilt: Name = Ordner, Hub = <Ordner>/<Ordner>.md.")
      .addTextArea((t) => {
        t.inputEl.rows = 4;
        t.inputEl.cols = 45;
        t.setValue(formatOverrides(s.overrides)).onChange(async (v) => {
          s.overrides = parseOverrides(v);
          await save();
        });
      });
    new Setting(containerEl)
      .setName("Ignorierte Ordner")
      .setDesc("Ordnernamen, die nie Fach oder Thema sind (Anhänge, Zeichnungen …). Einer pro Zeile.")
      .addTextArea((t) => {
        t.inputEl.rows = 4;
        t.setValue(s.ignoriert.join("\n")).onChange(async (v) => {
          s.ignoriert = v.split("\n").map((x) => x.trim()).filter(Boolean);
          await save();
        });
      });
    this.text(containerEl, "Stufen-Ordner", "Regulärer Ausdruck für Ordner direkt unter dem Fach, die eine Stufe statt eines Themas sind (Property „stufe“). Leer = keine.", s.stufenMuster, (v) => (s.stufenMuster = v), save, true);

    // ---------- Anzeige ----------
    new Setting(containerEl).setName("Anzeige").setHeading();
    for (const sch of SCHALTER) {
      new Setting(containerEl)
        .setName(sch.name)
        .setDesc(sch.desc)
        .addToggle((t) => t.setValue(s.anzeige[sch.key]).onChange(() => void this.plugin.anzeige.toggle(sch.key)));
    }

    // ---------- Tastenkürzel ----------
    new Setting(containerEl).setName("Tastenkürzel").setHeading();
    new Setting(containerEl)
      .setName("Vorschlag")
      .setDesc("Strg+Alt+N: Neue Themennote · Strg+Alt+Shift+N: im Fach der aktuellen Note. Vergeben unter Einstellungen → Tastenkürzel, Suche „Themen-Notes“.");
  }

  private bereich(el: HTMLElement, b: Bereich, save: () => Promise<void>): void {
    new Setting(el)
      .setName(`Bereich: ${b.name}`)
      .setDesc(`Ordner „${b.root}“, darunter ein Ordner pro ${b.property === "fach" ? "Fach" : "Kategorie"}; Property „${b.property}“.`)
      .addToggle((t) =>
        t.setValue(b.aktiv).onChange(async (v) => {
          b.aktiv = v;
          await save();
        }),
      );
    this.text(el, `${b.name}: Ordner`, "", b.root, (v) => (b.root = v), save);
  }

  private text(el: HTMLElement, name: string, desc: string, value: string, set: (v: string) => void, save: () => Promise<void>, leerErlaubt = false): void {
    new Setting(el)
      .setName(name)
      .setDesc(desc)
      .addText((t) =>
        t.setValue(value).onChange(async (v) => {
          if (!v.trim() && !leerErlaubt) return;
          set(v.trim());
          await save();
        }),
      );
  }
}
