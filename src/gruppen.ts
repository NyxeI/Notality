import { MarkdownView, Menu, Modal, Setting } from "obsidian";
import { farbSchluessel, normalisiereFarbe, themaFarbe } from "./ansicht.ts";
import { alleSprachen, t } from "./i18n.ts";
import type ThemenNotesPlugin from "./main";

/** Vorschläge im Farbdialog. */
export const FARB_VORSCHLAEGE = ["#4cc9f0", "#4361ee", "#7209b7", "#f72585", "#fb8500", "#ffb703", "#06d6a0", "#2a9d8f", "#e63946", "#8d99ae"];

/**
 * Färbt die Themenköpfe (Gruppen „Thema“) in der Themen-Base der Hubs: Klasse `themen-gruppe` am Kopf,
 * `themen-gruppe-tabelle` und die Variable `--themen-gruppe` an der Gruppe. Rechtsklick auf einen Kopf: Farbe wählen.
 */
export class Gruppen {
  private plugin: ThemenNotesPlugin;
  private beobachter: MutationObserver | null = null;
  private timer: number | null = null;

  constructor(plugin: ThemenNotesPlugin) {
    this.plugin = plugin;
  }

  start(): void {
    this.beobachter = new MutationObserver(() => this.bald());
    this.beobachter.observe(document.body, { childList: true, subtree: true });
    this.plugin.registerDomEvent(document, "contextmenu", (e) => this.kontextmenue(e), { capture: true });
    this.alle();
  }

  stop(): void {
    this.beobachter?.disconnect();
    if (this.timer !== null) window.clearTimeout(this.timer);
    for (const el of Array.from(document.querySelectorAll(".themen-gruppe, .themen-gruppe-tabelle"))) {
      el.removeClass("themen-gruppe", "themen-gruppe-tabelle");
      (el as HTMLElement).style.removeProperty("--themen-gruppe");
    }
    for (const el of Array.from(document.querySelectorAll(".themen-base"))) el.removeClass("themen-base");
  }

  private bald(): void {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.alle();
    }, 250);
  }

  alle(): void {
    const name = this.plugin.baseName();
    const a = this.plugin.settings.anzeige;
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || !view.file) continue;
      const e = this.plugin.einordnung(view.file.path);
      if (!e?.istHub) continue;
      const kategorie = e.fach.name;
      for (const embed of Array.from(view.contentEl.querySelectorAll(".bases-embed"))) {
        const src = embed.getAttribute("src") ?? "";
        if (!src.startsWith(name)) continue;
        embed.addClass("themen-base");
        for (const kopf of Array.from(embed.querySelectorAll<HTMLElement>(".bases-group-heading"))) {
          const eigenschaft = kopf.querySelector(".bases-group-property")?.textContent?.trim();
          const wert = kopf.querySelector(".bases-group-value")?.textContent?.trim();
          if (!wert || !eigenschaft || !alleSprachen("sp.thema").some((x) => x.toLowerCase() === eigenschaft.toLowerCase())) continue;
          const farbe = themaFarbe(a, kategorie, wert);
          const tabelle = kopf.parentElement;
          kopf.addClass("themen-gruppe");
          kopf.dataset.themenFach = kategorie;
          kopf.dataset.themenThema = wert;
          for (const el of [kopf, tabelle]) {
            if (!el) continue;
            if (farbe) el.style.setProperty("--themen-gruppe", farbe);
            else el.style.removeProperty("--themen-gruppe");
          }
          tabelle?.addClass("themen-gruppe-tabelle");
        }
      }
    }
  }

  private kontextmenue(e: MouseEvent): void {
    const kopf = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(".themen-gruppe");
    if (!kopf?.dataset.themenThema || !kopf.dataset.themenFach) return;
    e.preventDefault();
    e.stopPropagation();
    const kategorie = kopf.dataset.themenFach;
    const thema = kopf.dataset.themenThema;
    const menu = new Menu();
    menu.addItem((i) => i.setTitle(t("f.farbeFuerMenue", { thema })).setIcon("palette").onClick(() => new FarbModal(this.plugin, kategorie, thema).open()));
    if (this.plugin.settings.anzeige.themaFarben[farbSchluessel(kategorie, thema)]) {
      menu.addItem((i) => i.setTitle(t("f.zuruecksetzen")).setIcon("rotate-ccw").onClick(() => void setzeThemaFarbe(this.plugin, kategorie, thema, null)));
    }
    menu.showAtMouseEvent(e);
  }
}

/** Themenfarbe speichern (null = zurück auf die Standardfarbe). */
export async function setzeThemaFarbe(p: ThemenNotesPlugin, kategorie: string, thema: string, farbe: string | null): Promise<void> {
  const farben = { ...p.settings.anzeige.themaFarben };
  const key = farbSchluessel(kategorie, thema);
  const n = farbe ? normalisiereFarbe(farbe) : null;
  if (n) farben[key] = n;
  else delete farben[key];
  await p.anzeige.set("themaFarben", farben);
}

/** Farbwahl für ein Thema: Vorschläge, freier Farbwähler, Zurücksetzen. */
export class FarbModal extends Modal {
  private p: ThemenNotesPlugin;
  private kategorie: string;
  private thema: string;

  constructor(p: ThemenNotesPlugin, kategorie: string, thema: string) {
    super(p.app);
    this.p = p;
    this.kategorie = kategorie;
    this.thema = thema;
  }

  onOpen(): void {
    this.modalEl.addClass("themen-farb-modal");
    this.titleEl.setText(t("f.farbeFuer", { thema: this.thema }));
    const aktuell = themaFarbe(this.p.settings.anzeige, this.kategorie, this.thema) ?? "#7c5cff";
    const leiste = this.contentEl.createDiv({ cls: "themen-farben" });
    for (const f of FARB_VORSCHLAEGE) {
      const b = leiste.createEl("button", { cls: "themen-farbe", attr: { "aria-label": f } });
      b.style.setProperty("--themen-farbe", f);
      b.toggleClass("is-active", f === aktuell);
      b.addEventListener("click", () => void this.waehle(f));
    }
    new Setting(this.contentEl)
      .setName(t("f.eigene"))
      .addColorPicker((c) => c.setValue(aktuell).onChange((v) => void this.waehle(v, false)))
      .addButton((b) => b.setButtonText(t("zuruecksetzen")).onClick(() => void this.waehle(null)));
  }

  private async waehle(farbe: string | null, schliessen = true): Promise<void> {
    await setzeThemaFarbe(this.p, this.kategorie, this.thema, farbe);
    if (schliessen) this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
