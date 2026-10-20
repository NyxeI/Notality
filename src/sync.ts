import { Notice, TFile } from "obsidian";
import type ThemenNotesPlugin from "./main";
import { fremdeNote, propPlan, textDatum, wendeAn } from "./props.ts";
import { inlineTags } from "./tags.ts";

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
 * neue Inline-Tags nach "tags", "geaendert" auf jetzt; nach dem Verschieben nur die Pfad-Properties.
 * Schutz gegen Schleifen: eigene Schreibvorgänge merken sich den neuen Inhalt, eine Änderung nur an "geaendert" zählt nicht.
 */
export class Sync {
  private plugin: ThemenNotesPlugin;
  private timers = new Map<string, number>();
  private gruende = new Map<string, Set<Grund>>();
  private schluessel = new Map<string, string>();
  private inline = new Map<string, string[]>();
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
    for (const m of [this.schluessel, this.inline] as Map<string, unknown>[]) {
      if (m.has(alt)) {
        m.set(file.path, m.get(alt));
        m.delete(alt);
      }
    }
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
    this.inline.set(file.path, inlineTags(this.plugin.app.metadataCache.getFileCache(file)?.tags));
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

    const inline = inlineTags(cache?.tags);
    const plan = propPlan({
      fm,
      einordnung: e,
      inline,
      vorherInline: this.inline.get(file.path) ?? null,
      bearbeitet,
      jetzt: Date.now(),
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
      textDatum: textDatum(text),
      tagsEntfernen: this.plugin.settings.tagsEntfernen,
    });
    this.inline.set(file.path, inline);
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
