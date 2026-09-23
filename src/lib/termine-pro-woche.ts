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

/** Nach ISO-Wochen gruppierte Termin-Zählung + sortierte Wochen-Keys. */
function weekCounts(dates: string[]): {
  counts: Map<string, number>;
  sorted: string[];
} {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const k = isoWeekKey(d);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  // isoWeekKey ("YYYY-Www", nullgepolstert) sortiert lexikografisch = chronologisch.
  return { counts, sorted: [...counts.keys()].sort() };
}

/**
 * „Innere" Wochen mit weniger als 2 Terminen — die ERSTE und LETZTE reguläre
 * Termin-Woche werden ausgenommen. Angebrochene Anfangs-/Schlusswochen (z.B.
 * Wrap-up-Woche mit nur 1 Termin, weil alle UE geleistet waren) sind KEIN
 * Intensitäts-Verstoß; nur echte Lücken *mitten* in der Maßnahme zählen.
 * Bei ≤2 belegten Wochen gibt es keine inneren Wochen ⇒ nie ein Verstoß.
 */
export function innereWochenUnter2(dates: string[]): string[] {
  const { counts, sorted } = weekCounts(dates);
  if (sorted.length <= 2) return [];
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return [...counts.entries()]
    .filter(([k, n]) => n < 2 && k !== first && k !== last)
    .map(([k]) => k);
}

/**
 * Randwochen (erste/letzte belegte Woche) mit nur 1 Termin — für den rein
 * informativen, nicht-persistenten Coach-Hinweis („Schluss-/Anfangswoche hatte
 * nur 1 Termin, beim Maßnahme-Ende normal"). Kein Verstoß, nicht auf der ANW.
 */
export function randWochenUnter2(dates: string[]): string[] {
  const { counts, sorted } = weekCounts(dates);
  if (sorted.length === 0) return [];
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return sorted.filter(
    (k) => (k === first || k === last) && (counts.get(k) ?? 0) < 2,
  );
}

/**
 * Wochen mit weniger als 2 Terminen INNERHALB des bewilligten Zeitraums —
 * inklusive Wochen ganz ohne Termin.
 *
 * Gegenstück zu `innereWochenUnter2` für die Bewilligung nach Zeitraum
 * (AA Regensburg): Dort ist der Zeitraum die Bewilligung, die Maßnahme muss
 * also über ihn hinweg tatsächlich laufen. Eine leere Woche mitten drin ist
 * damit der gravierendste Fall — und genau der, den `innereWochenUnter2`
 * bewusst ignoriert (dort sind Urlaubswochen zurecht kein Verstoß, weil die
 * bewilligten UE das Maß sind, nicht die Zeit).
 *
 * Maßstab sind Start- und Enddatum der Bewilligung, nicht erster/letzter
 * Termin: Sonst wäre ein vorzeitiges Ende per Definition lückenlos.
 * Angebrochene Rand-Kalenderwochen zählen nicht — liegt der Start auf einem
 * Donnerstag, ist die 2-Termine-Erwartung für diese Woche unfair.
 */
export function wochenUnter2ImZeitraum(
  startDate: string | null,
  endDate: string | null,
  dates: string[],
): string[] {
  if (!startDate || !endDate || endDate < startDate) return [];
  const counts = new Map<string, number>();
  for (const d of dates) {
    // Termine außerhalb des Zeitraums (Altlast/Korrekturfall) nicht mitzählen.
    if (d < startDate || d > endDate) continue;
    const k = isoWeekKey(d);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  // Nur volle Kalenderwochen: die Woche des Starts bzw. des Endes zählt nur,
  // wenn sie komplett im Zeitraum liegt (Montag bzw. Sonntag inklusive).
  const randWochen = new Set([isoWeekKey(startDate), isoWeekKey(endDate)]);
  const luecken: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const ende = new Date(`${endDate}T00:00:00Z`);
  const gesehen = new Set<string>();
  while (cursor <= ende) {
    const k = isoWeekKey(cursor.toISOString().slice(0, 10));
    if (!gesehen.has(k)) {
      gesehen.add(k);
      if (!randWochen.has(k) && (counts.get(k) ?? 0) < 2) luecken.push(k);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return luecken;
}
