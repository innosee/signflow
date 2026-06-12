const BERLIN_TZ = "Europe/Berlin";

/**
 * Heutiges Datum in Europe/Berlin als `YYYY-MM-DD`. Der Server läuft in UTC;
 * für die fachliche „ist der Termin schon dran?"-Frage zählt aber die lokale
 * Kalenderwoche/-tag des Bildungsträgers, nicht UTC.
 */
export function berlinToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BERLIN_TZ }).format(
    new Date(),
  );
}

/**
 * Liegt ein Termin (`YYYY-MM-DD`) in der Zukunft? **Heute zählt NICHT als
 * Zukunft** — das Coaching findet ja heute statt und ist signierbar. Nur echte
 * Zukunfts-Termine sind gesperrt: Anwesenheit für etwas, das noch nicht
 * stattgefunden hat, wäre fachlich + rechtlich unsinnig.
 */
export function isFutureSessionDate(sessionDate: string): boolean {
  return sessionDate > berlinToday();
}
