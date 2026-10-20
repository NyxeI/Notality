import { MarkdownView, Notice, TFile } from "obsidian";
import type ThemenNotesPlugin from "./main";
import { fremdeNote, propPlan, textDatum, wendeAn } from "./props.ts";
import { fertigeTags, inlineTags } from "./tags.ts";

/** Nur Änderungen, deren Datei so frisch ist, gelten als Bearbeitung (Neu-Indexieren beim Start fasst nichts an). */
const FRISCH_MS = 15_000;
const WARTEN_MS = 1_000;

/** Inhalt ohne die Zeile "geaendert:" – ändert sich nur das Datum, ist das keine neue Bearbeitung. */
export function inhaltsSchluessel(text: string): string {
  const ohne = text.replace(/^geaendert:.*\r?\n/m, "");
  let h = 5381;
  for (let i = 0; i < ohne.length; i++) h = ((h << 5) + h + ohne.charCodeAt(i)) | 0;
  return `${ohne.length}:${h}`;
}

type Grund = "bearbeitet" | "verschoben";

/**
 * Hält Properties und Tags von Themennotes aktuell: nach einer Bearbeitung (entprellt) fach/thema aus dem Ordner,
 * fertig getippte Inline-Tags nach "tags" (gelöschte wieder heraus), "geaendert" auf jetzt; nach dem Verschieben nur die Pfad-Properties.
 * Schutz gegen Schleifen: eigene Schreibvorgänge merken sich den neuen Inhalt, eine Änderung nur an "geaendert" zählt nicht.
 */
export class Sync {
  private plugin: ThemenNotesPlugin;
  private timers = new Map<string, number>();
  private gruende = new Map<string, Set<Grund>>();
  private schluessel = new Map<string, string>();
  private busy = new Set<string>();
  /** Während Massenänderungen (Nachrüsten) keine Automatik. */
  paused = false;

  constructor(plugin: ThemenNotesPlugin) {
    this.plugin = plugin;
  }

  geaendert(file: TFile): void {
    this.planen(file, "bearbeitet");
  }

  verschoben(file: TFile, alt: string): void {
    const k = this.schluessel.get(alt);
    if (k !== undefined) {
      this.schluessel.set(file.path, k);
      this.schluessel.delete(alt);
    }
    this.plugin.tagStandVerschieben(alt, file.path);
    this.planen(file, "verschoben");
  }

  private planen(file: TFile, grund: Grund): void {
    if (this.paused || !this.plugin.settings.automatik || file.extension !== "md" || this.busy.has(file.path)) return;
    // Nach dem Verschieben meldet Obsidian oft auch eine Änderung: beide Gründe merken
    const gruende = this.gruende.get(file.path) ?? new Set<Grund>();
    gruende.add(grund);
    this.gruende.set(file.path, gruende);
    const alt = this.timers.get(file.path);
    if (alt !== undefined) window.clearTimeout(alt);
    this.timers.set(
      file.path,
      window.setTimeout(() => {
        this.timers.delete(file.path);
        const g = this.gruende.get(file.path) ?? new Set([grund]);
        this.gruende.delete(file.path);
        void this.pruefe(file, g).catch((e) => new Notice(`Themen-Notes: ${(e as Error).message}`));
      }, WARTEN_MS),
    );
  }

  cancelAll(): void {
    for (const t of this.timers.values()) window.clearTimeout(t);
    this.timers.clear();
    this.gruende.clear();
  }

  /** Aktuellen Inhalt als „eigenen Stand“ merken (nach dem Anlegen oder Nachrüsten). */
  async merke(file: TFile): Promise<void> {
    this.schluessel.set(file.path, inhaltsSchluessel(await this.plugin.app.vault.read(file)));
  }

  /**
   * Cursor-Offsets in offenen Editoren dieser Note; null = ein Editor hat ungespeicherte Änderungen
   * (die Positionen im Metadaten-Cache passen dann nicht zum Editor).
   */
  private cursor(file: TFile, text: string): number[] | null {
    const out: number[] = [];
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || view.file?.path !== file.path) continue;
      const ed = view.editor;
      if (ed.getValue() !== text) return null;
      for (const sel of ed.listSelections()) out.push(ed.posToOffset(sel.head));
    }
    return out;
  }

  /** Gibt die geschriebenen Schlüssel zurück (leer = nichts zu tun). */
  async pruefe(file: TFile, gruende: Set<Grund>): Promise<string[]> {
    if (this.busy.has(file.path) || !this.plugin.app.vault.getAbstractFileByPath(file.path)) return [];
    const e = this.plugin.einordnung(file.path);
    if (!e || e.istHub) return [];
    const app = this.plugin.app;
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (fremdeNote(fm)) return [];

    const text = await app.vault.read(file);
    const neu = inhaltsSchluessel(text);
    const vorher = this.schluessel.get(file.path);
    this.schluessel.set(file.path, neu);
    const frisch = Date.now() - file.stat.mtime < FRISCH_MS;
    const bearbeitet = gruende.has("bearbeitet") && frisch && vorher !== neu;
    const verwaltet = fm?.typ === "themennote";
    if (!bearbeitet && !(gruende.has("verschoben") && verwaltet)) return [];

    // Halb getippte Tags („#Duch|“) zählen noch nicht; bei ungespeicherten Editor-Änderungen bleiben die Tags diesmal, wie sie sind.
    const cursor = this.cursor(file, text);
    const { plan, verwaltet: stand } = propPlan({
      fm,
      einordnung: e,
      fertig: cursor ? fertigeTags(cache?.tags, cursor) : [],
      alle: inlineTags(cache?.tags),
      verwaltet: this.plugin.tagStand(file.path),
      bearbeitet,
      jetzt: Date.now(),
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
      textDatum: textDatum(text),
      tagsEntfernen: this.plugin.settings.tagsEntfernen && cursor !== null,
    });
    this.plugin.setzeTagStand(file.path, stand);
    const keys = Object.keys(plan);
    if (!keys.length) return [];
    this.busy.add(file.path);
    try {
      await app.fileManager.processFrontMatter(file, (f) => wendeAn(f, plan));
      this.schluessel.set(file.path, inhaltsSchluessel(await app.vault.read(file)));
    } finally {
      this.busy.delete(file.path);
    }
    return keys;
  }
}
