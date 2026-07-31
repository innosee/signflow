/**
 * Extrahiert aus einem frei eingegebenen Durchführungsort den ORT (Stadt) für
 * die „Ort, Datum"-Zeile über einer Unterschrift. Dort gehört nur die Stadt
 * hin — Straße + Hausnummer + PLZ ergeben in einer Unterschriftszeile keinen
 * Sinn (User-Feedback 2026-07-31).
 *
 *   "Stollstraße 5, 83022 Rosenheim" → "Rosenheim"
 *   "Grimmenstein 25, 88364 Wolfegg" → "Wolfegg"
 *   "78224 Singen"                   → "Singen"
 *   "Online"                         → "Online"
 *   "Singen"                         → "Singen"
 *
 * Heuristik: Steht eine 5-stellige PLZ im String, ist der Ort das, was direkt
 * dahinter kommt (bis zum nächsten Komma). Sonst der Teil nach dem letzten
 * Komma (übliches „Straße, Ort"-Muster), sonst der ganze String. Leerer oder
 * fehlender Input → "".
 */
export function signaturOrt(
  durchfuehrungsort: string | null | undefined,
): string {
  const s = (durchfuehrungsort ?? "").trim();
  if (!s) return "";
  const plz = s.match(/\b\d{5}\s+([^,]+)/);
  if (plz?.[1]) return plz[1].trim();
  if (s.includes(",")) {
    const last = s.split(",").pop()?.trim();
    if (last) return last;
  }
  return s;
}
