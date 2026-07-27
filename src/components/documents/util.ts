import type { DocumentSheetData } from "@/components/documents/types";

/**
 * Anzeigename des Teilnehmers für die Dokumente: bevorzugt „Nachname, Vorname"
 * aus den erfassten Stammdaten, Fallback auf das bestehende `name`-Feld.
 */
export function participantDisplayName(
  p: DocumentSheetData["participant"],
): string {
  const vn = p.vorname?.trim();
  const nn = p.nachname?.trim();
  if (nn && vn) return `${nn}, ${vn}`;
  if (nn) return nn;
  if (vn) return vn;
  return p.name;
}
