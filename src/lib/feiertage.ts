/**
 * Deutsche gesetzliche Feiertage — rein berechnet, **null externe API**, **null
 * Dependencies**. Coachings finden an Feiertagen nicht statt; diese Engine
 * liefert pro Bundesland + Jahr die Feiertage, damit die Termin-Anlage davor
 * warnen und der Kalender sie markieren kann.
 *
 * Warum berechenbar statt nachgeschlagen: Die beweglichen Feiertage hängen alle
 * am Ostersonntag (Gauß'sche / Meeus-Jones-Butcher-Osterformel), der Rest sind
 * feste Kalendertage. Damit braucht es weder einen jährlichen Cron noch eine
 * Feiertags-API noch Geolocation der Stadt — nur das Bundesland (eines von 16).
 *
 * Datums-Arithmetik läuft bewusst über `Date.UTC(...)` (reine Kalender-Offsets,
 * dann zurück nach `YYYY-MM-DD`) und NICHT über `new Date("2026-04-18")` — letzteres
 * würde je nach Zeitzone einen Tag zurückspringen (gleiche Falle wie in
 * `src/lib/dates.ts` / `app/.../page.tsx` dokumentiert).
 */

export const BUNDESLAENDER = [
  { code: "BW", name: "Baden-Württemberg" },
  { code: "BY", name: "Bayern" },
  { code: "BE", name: "Berlin" },
  { code: "BB", name: "Brandenburg" },
  { code: "HB", name: "Bremen" },
  { code: "HH", name: "Hamburg" },
  { code: "HE", name: "Hessen" },
  { code: "MV", name: "Mecklenburg-Vorpommern" },
  { code: "NI", name: "Niedersachsen" },
  { code: "NW", name: "Nordrhein-Westfalen" },
  { code: "RP", name: "Rheinland-Pfalz" },
  { code: "SL", name: "Saarland" },
  { code: "SN", name: "Sachsen" },
  { code: "ST", name: "Sachsen-Anhalt" },
  { code: "SH", name: "Schleswig-Holstein" },
  { code: "TH", name: "Thüringen" },
] as const;

export type Bundesland = (typeof BUNDESLAENDER)[number]["code"];

const BUNDESLAND_CODES = new Set<string>(BUNDESLAENDER.map((b) => b.code));

export function isBundesland(value: unknown): value is Bundesland {
  return typeof value === "string" && BUNDESLAND_CODES.has(value);
}

export function bundeslandName(code: Bundesland): string {
  return BUNDESLAENDER.find((b) => b.code === code)?.name ?? code;
}

/** `YYYY-MM-DD` aus Jahr/Monat(1-12)/Tag, nullbreite-stabil zero-padded. */
function iso(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/** `YYYY-MM-DD` + n Tage → `YYYY-MM-DD`. n darf negativ sein. */
function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map((s) => Number.parseInt(s, 10));
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * Ostersonntag eines Jahres als `YYYY-MM-DD` (Meeus-Jones-Butcher, gregorianisch).
 * Anker für Karfreitag (−2), Ostermontag (+1), Christi Himmelfahrt (+39),
 * Pfingstmontag (+50) und Fronleichnam (+60).
 */
function ostersonntag(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31); // 3 = März, 4 = April
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return iso(year, month, day);
}

/**
 * Buß- und Bettag (nur Sachsen): der Mittwoch vor dem 23. November, fällt
 * also immer auf den 16.–22. November. Wir nehmen den 22.11. und gehen zum
 * davorliegenden Mittwoch (UTC-Wochentag, 3 = Mittwoch) zurück.
 */
function bussUndBettag(year: number): string {
  const ref = new Date(Date.UTC(year, 10, 22)); // 22. November
  const delta = (ref.getUTCDay() - 3 + 7) % 7;
  return addDays(iso(year, 11, 22), -delta);
}

/**
 * Welche bundeslandspezifischen Feiertage gelten wo. Bundesweite Feiertage
 * (Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingst-
 * montag, Tag der Deutschen Einheit, 1.+2. Weihnachtstag) sind unten direkt
 * gesetzt und brauchen kein Mapping.
 *
 * Stand 2024+. Bewusste Grenzfälle:
 *  - Mariä Himmelfahrt: am Land-Level nur Saarland. In Bayern hängt der Tag
 *    von der Konfession der Gemeinde ab (keine landesweite Regel) → hier NICHT
 *    für BY gesetzt, um nicht flächendeckend falsch zu warnen.
 *  - Fronleichnam: in SN/TH nur in einzelnen Gemeinden → am Land-Level
 *    ausgelassen.
 */
const LAND_FEIERTAGE = {
  heiligeDreiKoenige: new Set<Bundesland>(["BW", "BY", "ST"]),
  frauentag: new Set<Bundesland>(["BE", "MV"]),
  fronleichnam: new Set<Bundesland>(["BW", "BY", "HE", "NW", "RP", "SL"]),
  mariaeHimmelfahrt: new Set<Bundesland>(["SL"]),
  weltkindertag: new Set<Bundesland>(["TH"]),
  reformationstag: new Set<Bundesland>([
    "BB",
    "MV",
    "SN",
    "ST",
    "TH",
    "HB",
    "HH",
    "NI",
    "SH",
  ]),
  allerheiligen: new Set<Bundesland>(["BW", "BY", "NW", "RP", "SL"]),
  bussUndBettag: new Set<Bundesland>(["SN"]),
} as const;

/**
 * Alle gesetzlichen Feiertage eines Bundeslands in einem Jahr als
 * `Map<YYYY-MM-DD, Name>`. Reihenfolge der Map ist chronologisch unbedeutend;
 * für Lookups (siehe `getFeiertag`) zählt nur der Key.
 */
export function getFeiertage(
  year: number,
  land: Bundesland,
): Map<string, string> {
  const oster = ostersonntag(year);
  const fest = new Map<string, string>();

  // Bundesweit (alle 16 Länder).
  fest.set(iso(year, 1, 1), "Neujahr");
  fest.set(addDays(oster, -2), "Karfreitag");
  fest.set(addDays(oster, 1), "Ostermontag");
  fest.set(iso(year, 5, 1), "Tag der Arbeit");
  fest.set(addDays(oster, 39), "Christi Himmelfahrt");
  fest.set(addDays(oster, 50), "Pfingstmontag");
  fest.set(iso(year, 10, 3), "Tag der Deutschen Einheit");
  fest.set(iso(year, 12, 25), "1. Weihnachtstag");
  fest.set(iso(year, 12, 26), "2. Weihnachtstag");

  // Bundeslandspezifisch.
  if (LAND_FEIERTAGE.heiligeDreiKoenige.has(land)) {
    fest.set(iso(year, 1, 6), "Heilige Drei Könige");
  }
  if (LAND_FEIERTAGE.frauentag.has(land)) {
    fest.set(iso(year, 3, 8), "Internationaler Frauentag");
  }
  if (LAND_FEIERTAGE.fronleichnam.has(land)) {
    fest.set(addDays(oster, 60), "Fronleichnam");
  }
  if (LAND_FEIERTAGE.mariaeHimmelfahrt.has(land)) {
    fest.set(iso(year, 8, 15), "Mariä Himmelfahrt");
  }
  if (LAND_FEIERTAGE.weltkindertag.has(land)) {
    fest.set(iso(year, 9, 20), "Weltkindertag");
  }
  if (LAND_FEIERTAGE.reformationstag.has(land)) {
    fest.set(iso(year, 10, 31), "Reformationstag");
  }
  if (LAND_FEIERTAGE.allerheiligen.has(land)) {
    fest.set(iso(year, 11, 1), "Allerheiligen");
  }
  if (LAND_FEIERTAGE.bussUndBettag.has(land)) {
    fest.set(bussUndBettag(year), "Buß- und Bettag");
  }

  return fest;
}

/**
 * Ist `isoDate` (`YYYY-MM-DD`) im gegebenen Bundesland ein gesetzlicher
 * Feiertag? Gibt den Namen zurück oder `null`. Toleriert `land = null`
 * (z.B. Bestandskurse ohne hinterlegtes Bundesland) → dann immer `null`,
 * also keine Warnung/Markierung.
 */
export function getFeiertag(
  isoDate: string,
  land: Bundesland | null | undefined,
): string | null {
  if (!land || !isBundesland(land)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const year = Number.parseInt(isoDate.slice(0, 4), 10);
  return getFeiertage(year, land).get(isoDate) ?? null;
}
