/**
 * Extrahiert aus einer frei eingegebenen Adresse den ORT (Stadt) für die
 * „Ort, Datum"-Zeile über einer Unterschrift. Dort gehört nur die Stadt hin —
 * Straße + Hausnummer + PLZ ergeben in einer Unterschriftszeile keinen Sinn
 * (User-Feedback 2026-07-31).
 *
 * Zwei Quellen: der Durchführungsort einer Maßnahme (einzeilig) und die
 * mehrzeilige Postanschrift des Bildungsträgers (`users.pdf_address`), aus der
 * der Sitz für die Unterschrift des Trägers kommt.
 *
 *   "Stollstraße 5, 83022 Rosenheim"        → "Rosenheim"
 *   "Grimmenstein 25, 88364 Wolfegg"        → "Wolfegg"
 *   "78224 Singen"                          → "Singen"
 *   "Ekkehardstraße 12b\nD-78224 Singen\n…" → "Singen"
 *   "Online"                                → "Online"
 *   "Singen"                                → "Singen"
 *
 * Heuristik: Steht eine 5-stellige PLZ im String, ist der Ort das, was direkt
 * dahinter kommt (bis zum nächsten Komma ODER Zeilenumbruch — sonst schleppt
 * eine Anschrift Telefon und Web-Adresse mit in die Signaturzeile). Sonst der
 * Teil nach dem letzten Komma (übliches „Straße, Ort"-Muster), sonst die erste
 * nicht-leere Zeile. Leerer oder fehlender Input → "".
 */
export function signaturOrt(
  durchfuehrungsort: string | null | undefined,
): string {
  const s = (durchfuehrungsort ?? "").trim();
  if (!s) return "";
  const plz = s.match(/\b\d{5}\s+([^,\n]+)/);
  if (plz?.[1]) return plz[1].trim();
  if (s.includes(",")) {
    const last = s.split(",").pop()?.trim();
    if (last) return last;
  }
  const firstLine = s.split("\n").map((l) => l.trim()).find(Boolean);
  return firstLine ?? "";
}
