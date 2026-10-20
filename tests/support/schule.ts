// Testkonfiguration wie in einem Schul-Vault (die Standardwerte des Plugins legen keinen Ordner fest).
import { mergeSettings } from "../../src/defaults.ts";

export const SCHULE = mergeSettings({
  bereiche: [{ id: "schule", name: "Schule", root: "01-Schule", property: "fach", aktiv: true }],
  overrides: [{ folder: "Politik und Gesellschaft", name: "Politik und Gesellschaft", hub: "PuG" }],
  ignoriert: ["attachments", "AufgabenFiles", "Ink", "Excalidraw"],
  stufenMuster: "^(11|12|13)(-[12])?$",
});
