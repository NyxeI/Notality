import { App, Modal, Setting, SuggestModal, TFile, setIcon } from "obsidian";
import { dateiName, themenPfad, type Bereich, type Fach } from "./config.ts";
import type { ThemaInfo } from "./pfad.ts";
import { t } from "./i18n.ts";
import { kurzZeit } from "./zeit.ts";

/** Auswahl eines Fachs samt Bereich; `anzahl`/`zuletzt` = Notes im Fachordner. */
export interface FachWahl {
  bereich: Bereich;
  fach: Fach;
  anzahl: number;
  zuletzt: number;
}

/** Icon je Bereich (Lucide). */
function bereichIcon(b: Bereich): string {
  return b.id === "schule" ? "graduation-cap" : b.id === "projekte" ? "folder-kanban" : "folder";
}

const notes = (n: number) => (n === 1 ? t("note1") : t("notes", { n }));
const zuletzt = (ms: number) => t("zuletzt", { wann: kurzZeit(ms) });

/** Zeile im Dialog: Icon | Titel + Nebenzeile | rechts Hinweis. */
function renderRow(el: HTMLElement, icon: string, title: string, sub: string, aside = "", badge = ""): void {
  el.addClass("themen-suggestion");
  setIcon(el.createDiv({ cls: "themen-suggestion-icon" }), icon);
  const main = el.createDiv({ cls: "themen-suggestion-main" });
  const head = main.createDiv({ cls: "themen-suggestion-title", text: title });
  if (badge) head.createSpan({ cls: "themen-badge", text: badge });
  if (sub) main.createDiv({ cls: "themen-suggestion-sub", text: sub });
  if (aside) el.createDiv({ cls: "themen-suggestion-aside", text: aside });
}

/** Kopfzeile über der Eingabe: bisherige Auswahl (Fach › Thema). */
function brotkrumen(modal: SuggestModal<unknown>, teile: string[]): void {
  const bar = createDiv({ cls: "themen-brotkrumen" });
  teile.forEach((t, i) => {
    if (i) setIcon(bar.createSpan({ cls: "themen-brotkrumen-pfeil" }), "chevron-right");
    bar.createSpan({ cls: "themen-brotkrumen-teil", text: t });
  });
  modal.modalEl.prepend(bar);
}

/** Schritt 1: Fach wählen – zuletzt benutzte oben. */
export class FachModal extends SuggestModal<FachWahl> {
  private items: FachWahl[];
  private onPick: (wahl: FachWahl) => void;
  private mehrereBereiche: boolean;

  constructor(app: App, items: FachWahl[], onPick: (wahl: FachWahl) => void) {
    super(app);
    this.items = items;
    this.onPick = onPick;
    this.mehrereBereiche = new Set(items.map((i) => i.bereich.id)).size > 1;
    this.modalEl.addClass("themen-modal");
    this.setPlaceholder(t("m.fach.platzhalter"));
    this.setInstructions([
      { command: "↑↓", purpose: t("m.waehlen") },
      { command: "↵", purpose: t("m.weiterThema") },
      { command: "esc", purpose: t("abbrechen") },
    ]);
    this.limit = 60;
  }

  getSuggestions(query: string): FachWahl[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.items;
    const hits = this.items.filter((i) => i.fach.name.toLowerCase().includes(q) || i.fach.folder.toLowerCase().includes(q));
    // Treffer am Wortanfang zuerst ("ma" → Mathe vor Informatik)
    return hits.sort((a, b) => Number(!a.fach.name.toLowerCase().startsWith(q)) - Number(!b.fach.name.toLowerCase().startsWith(q)));
  }

  renderSuggestion(item: FachWahl, el: HTMLElement): void {
    const aside = item.zuletzt ? zuletzt(item.zuletzt) : "";
    renderRow(el, bereichIcon(item.bereich), item.fach.name, item.anzahl ? notes(item.anzahl) : t("m.keineNotes"), aside, this.mehrereBereiche ? item.bereich.name : "");
  }

  onChooseSuggestion(item: FachWahl): void {
    this.onPick(item);
  }
}

export type ThemaChoice = { kind: "none" } | { kind: "existing"; pfad: string } | { kind: "new"; pfad: string };

/**
 * Schritt 2: Thema wählen – zuletzt benutzte zuerst, „Ohne Thema“ (direkt im Fachordner) oder ein neues Thema aus der Eingabe.
 * Unterthemen mit „/“: „Dramen/Faust“.
 */
export class ThemaModal extends SuggestModal<ThemaChoice> {
  private fach: Fach;
  private themen: ThemaInfo[];
  private onPick: (choice: ThemaChoice) => void;
  private vorne: string | null;

  constructor(app: App, fach: Fach, themen: ThemaInfo[], onPick: (choice: ThemaChoice) => void, vorne: string | null = null) {
    super(app);
    this.fach = fach;
    this.onPick = onPick;
    this.vorne = vorne;
    // Thema der aktuellen Note nach oben
    this.themen = vorne ? [...themen.filter((t) => t.pfad === vorne), ...themen.filter((t) => t.pfad !== vorne)] : themen;
    this.modalEl.addClass("themen-modal");
    brotkrumen(this as SuggestModal<unknown>, [fach.name]);
    this.setPlaceholder(t("m.thema.platzhalter", { fach: fach.name }));
    this.setInstructions([
      { command: "↑↓", purpose: t("m.waehlen") },
      { command: "↵", purpose: t("m.weiterTitel") },
      { command: "esc", purpose: t("abbrechen") },
    ]);
    this.limit = 80;
  }

  getSuggestions(query: string): ThemaChoice[] {
    const q = themenPfad(query);
    const lower = q.toLowerCase();
    const hits: ThemaChoice[] = this.themen
      .filter((t) => t.pfad.toLowerCase().includes(lower))
      .map((t) => ({ kind: "existing", pfad: t.pfad }));
    const exact = this.themen.some((t) => t.pfad.toLowerCase() === lower);
    if (q && !exact) hits.push({ kind: "new", pfad: q });
    if (!q) hits.splice(this.vorne && this.themen[0]?.pfad === this.vorne ? 1 : 0, 0, { kind: "none" });
    return hits;
  }

  renderSuggestion(choice: ThemaChoice, el: HTMLElement): void {
    if (choice.kind === "none") return renderRow(el, "circle-dashed", t("m.ohneThema"), t("m.direktIn", { ordner: this.fach.folder }));
    if (choice.kind === "new") return renderRow(el, "folder-plus", t("m.neuesThema", { pfad: choice.pfad }), t("m.ordnerNeu"));
    const info = this.themen.find((x) => x.pfad === choice.pfad);
    const teile = choice.pfad.split("/");
    const name = teile.pop()!;
    const sub = [teile.length ? t("m.in", { pfad: teile.join(" › ") }) : "", info?.anzahl ? notes(info.anzahl) : t("m.leer")].filter(Boolean).join(" · ");
    const icon = choice.pfad === this.vorne ? "map-pin" : info?.zuletzt ? "history" : "folder";
    renderRow(el, icon, name, sub, info?.zuletzt ? zuletzt(info.zuletzt) : "", choice.pfad === this.vorne ? t("m.aktuell") : "");
  }

  onChooseSuggestion(choice: ThemaChoice): void {
    this.onPick(choice);
  }
}

export type TitelChoice = { kind: "neu"; titel: string } | { kind: "open"; file: TFile };

/** Schritt 3: Titel eingeben (↵ legt an); vorhandene Notes im Ordner werden mit angezeigt und lassen sich öffnen. */
export class TitelModal extends SuggestModal<TitelChoice> {
  private vorhanden: TFile[];
  private onPick: (choice: TitelChoice) => void;
  private ziel: string;

  constructor(app: App, krumen: string[], ziel: string, vorhanden: TFile[], onPick: (choice: TitelChoice) => void) {
    super(app);
    this.ziel = ziel;
    this.vorhanden = [...vorhanden].sort((a, b) => b.stat.mtime - a.stat.mtime);
    this.onPick = onPick;
    this.modalEl.addClass("themen-modal");
    brotkrumen(this as SuggestModal<unknown>, krumen);
    this.setPlaceholder(t("m.titel.platzhalter"));
    this.setInstructions([
      { command: "↵", purpose: t("m.anlegenOeffnen") },
      { command: "esc", purpose: t("abbrechen") },
    ]);
    this.limit = 30;
  }

  getSuggestions(query: string): TitelChoice[] {
    const titel = dateiName(query);
    const lower = titel.toLowerCase();
    const treffer: TitelChoice[] = this.vorhanden.filter((f) => f.basename.toLowerCase().includes(lower)).map((file) => ({ kind: "open", file }));
    const exakt = this.vorhanden.some((f) => f.basename.toLowerCase() === lower);
    return titel && !exakt ? [{ kind: "neu", titel }, ...treffer] : treffer;
  }

  renderSuggestion(choice: TitelChoice, el: HTMLElement): void {
    if (choice.kind === "neu") return renderRow(el, "file-plus", choice.titel, `→ ${this.ziel}/${choice.titel}.md`, t("m.neu"));
    renderRow(el, "file-text", choice.file.basename, "", t("m.geaendert", { wann: kurzZeit(choice.file.stat.mtime) }), t("m.oeffnen"));
  }

  onChooseSuggestion(choice: TitelChoice): void {
    this.onPick(choice);
  }
}

/** Bestätigung vor Massenänderungen; `text` darf mehrere Absätze haben. */
export class ConfirmModal extends Modal {
  private heading: string;
  private text: string;
  private onConfirm: () => void;

  constructor(app: App, heading: string, text: string, onConfirm: () => void) {
    super(app);
    this.heading = heading;
    this.text = text;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);
    for (const absatz of this.text.split("\n\n")) this.contentEl.createEl("p", { text: absatz });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText(t("abbrechen")).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t("ausfuehren"))
          .setWarning()
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
