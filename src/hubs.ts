// Fach-Hubs: Base-Übersicht oben einbetten, die Linkliste bleibt darunter (pure).

/** Regex für eine Einbettung der Base (mit oder ohne #Ansicht). */
export function embedRegex(baseName: string): RegExp {
  return new RegExp(`!\\[\\[${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(#[^\\]|]*)?(\\|[^\\]]*)?\\]\\]`);
}

/**
 * Neuer Hub-Inhalt mit `## <kopf>` + `![[<base>#<ansicht>]]` direkt unter dem Frontmatter
 * (nach einer ersten Zeile, die nur aus Tags besteht); null = die Base ist schon eingebettet.
 */
export function planHub(content: string, baseName: string, ansicht: string, kopf = "Übersicht"): string | null {
  if (embedRegex(baseName).test(content)) return null;
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(content)?.[0] ?? "";
  let rest = content.slice(fm.length);
  let tagZeile = "";
  const m = /^\s*((?:#[^\s#]+[ \t]*)+)\r?\n/.exec(rest);
  if (m) {
    tagZeile = `${m[1].trim()}\n`;
    rest = rest.slice(m[0].length);
  }
  return `${fm}${tagZeile}## ${kopf}\n![[${baseName}#${ansicht}]]\n\n${rest.replace(/^\s*\n/, "")}`;
}

/** Ansicht der (ersten) Einbettung wechseln; null = keine Einbettung gefunden oder schon diese Ansicht. */
export function setzeAnsicht(content: string, baseName: string, ansicht: string): string | null {
  const re = embedRegex(baseName);
  const m = re.exec(content);
  if (!m) return null;
  const neu = `![[${baseName}#${ansicht}]]`;
  return m[0] === neu ? null : content.replace(re, neu);
}

/** Ansicht der ersten Einbettung oder null. */
export function aktuelleAnsicht(content: string, baseName: string): string | null {
  const m = embedRegex(baseName).exec(content);
  return m ? (m[1] ?? "").replace(/^#/, "") || null : null;
}
