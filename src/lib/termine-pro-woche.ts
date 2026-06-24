/**
 * „2 Termine pro Woche"-Auswertung (AfA-Intensitätsregel). Bewusst DB-frei +
 * client-safe (wie `avgs-stage.ts`) → in Form-Warnung UND Server-Action nutzbar.
 *
 * Woche = ISO-8601-Kalenderwoche (Mo–So, Donnerstag-Regel). „Verletzt" heißt:
 * eine Woche, die mindestens einen UE-Termin enthält, enthält weniger als 2.
 * Wochen ganz ohne Termine (Urlaub/Feiertage) zählen NICHT als Verstoß.
 */

/** ISO-8601-Kalenderwoche eines Kalendertags (YYYY-MM-DD). */
export function isoWeek(iso: string): { year: number; week: number } {
  const [y, m, d] = iso.split("-").map((s) => Number.parseInt(s, 10));
  // Donnerstag der laufenden Woche bestimmt Jahr + Wochennummer.
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mo=0 … So=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const ftDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNum + 3);
  const week =
    1 + Math.round((date.getTime() - firstThursday.getTime()) / 604_800_000);
  return { year: isoYear, week };
}

/** Stabiler Wochen-Schlüssel, z.B. "2026-W24". */
export function isoWeekKey(iso: string): string {
  const w = isoWeek(iso);
  return `${w.year}-W${String(w.week).padStart(2, "0")}`;
}

/**
 * Wochen-Keys, in denen weniger als 2 Termine liegen (= genau 1, da leere
 * Wochen nicht in der Gruppierung auftauchen). Leer ⇒ Regel eingehalten.
 */
export function wochenUnter2(dates: string[]): string[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const k = isoWeekKey(d);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n < 2).map(([k]) => k);
}
