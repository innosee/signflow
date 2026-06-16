/**
 * Eignungsanalyse beim Erstgespräch — 4 Kriterien, je Bewertung ++ / O / --.
 * Eine Quelle für Formular (Abfrage), Validierung und PDF-Darstellung.
 *
 * Das Gesamtergebnis „TN ist geeignet (Ja/Nein)" bleibt separat in
 * `sessions.geeignet`; hier nur die vier Teil-Bewertungen.
 */
export const EIGNUNG_KRITERIEN = [
  { key: "motivation", label: "Nötige Motivation" },
  { key: "bedarfe", label: "Passende Bedarfe" },
  { key: "sprachniveau", label: "Adäquates Sprachniveau" },
  { key: "kompetenzen", label: "Ausreichende Kompetenzen" },
] as const;

export type EignungKey = (typeof EIGNUNG_KRITERIEN)[number]["key"];

/** Bewertungsstufen wie im AfA-Formular: ++ (gut), O (neutral), -- (schwach). */
export const EIGNUNG_RATINGS = [
  { value: "++", label: "++" },
  { value: "o", label: "O" },
  { value: "--", label: "--" },
] as const;

export type EignungRating = (typeof EIGNUNG_RATINGS)[number]["value"];

export type Eignungsanalyse = Record<EignungKey, EignungRating>;

const KEYS = EIGNUNG_KRITERIEN.map((k) => k.key);
const RATING_VALUES = new Set<string>(EIGNUNG_RATINGS.map((r) => r.value));

/** Formularfeld-Name für ein Kriterium (Radio-Group). */
export function eignungFieldName(key: EignungKey): string {
  return `eignung_${key}`;
}

/**
 * Liest die vier Bewertungen aus FormData und validiert sie. Liefert bei
 * Vollständigkeit das typisierte Objekt, sonst den Key des fehlenden/ungültigen
 * Kriteriums (für eine sprechende Fehlermeldung).
 */
export function parseEignungsanalyseFromForm(
  formData: FormData,
):
  | { ok: true; value: Eignungsanalyse }
  | { ok: false; missingLabel: string } {
  const out = {} as Record<EignungKey, EignungRating>;
  for (const { key, label } of EIGNUNG_KRITERIEN) {
    const raw = String(formData.get(eignungFieldName(key)) ?? "").trim();
    if (!RATING_VALUES.has(raw)) {
      return { ok: false, missingLabel: label };
    }
    out[key] = raw as EignungRating;
  }
  return { ok: true, value: out };
}

/** Runtime-Type-Guard für aus der DB gelesene JSON-Werte. */
export function isEignungsanalyse(v: unknown): v is Eignungsanalyse {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return KEYS.every(
    (k) => typeof obj[k] === "string" && RATING_VALUES.has(obj[k] as string),
  );
}
