/**
 * Abgeleiteter AVGS-Erfassungs-Status eines Kurses.
 *
 *  1. AVGS-Gutschein-Gültigkeit — bei Anlage bekannt (immer gesetzt, Pflicht).
 *  2. Startdatum — nach dem Erstgespräch vereinbart (`courses.startDate`).
 *  3. Bewilligung — vom BT explizit bestätigt (`courses.bewilligtAt`), NICHT mehr
 *     aus dem Enddatum abgeleitet. So kann das Enddatum jederzeit erfasst werden,
 *     ohne den Status auf "Bewilligt" zu ziehen.
 *
 * Bewusst DB-frei + ohne `src/db`-Import → unit-testbar (wie `course-form.ts`).
 * `bewilligtAt` gewinnt: hat der BT bewilligt, zeigen wir "Bewilligt" auch wenn
 * das Startdatum noch fehlt (der BT hat die Bewilligung ja aktiv bestätigt).
 */

export type AvgsStage =
  | "startdatum_ausstehend"
  | "bewilligung_ausstehend"
  | "bewilligt";

export function avgsStage(c: {
  startDate: string | null;
  bewilligtAt: Date | string | null;
}): AvgsStage {
  if (c.bewilligtAt) return "bewilligt";
  if (!c.startDate) return "startdatum_ausstehend";
  return "bewilligung_ausstehend";
}

export const AVGS_STAGE_LABEL: Record<AvgsStage, string> = {
  startdatum_ausstehend: "Startdatum ausstehend",
  bewilligung_ausstehend: "Bewilligung ausstehend",
  bewilligt: "Bewilligt",
};

/** Tailwind-Badge-Klassen je Stage (Anlehnung an die übrigen Status-Badges). */
export const AVGS_STAGE_BADGE: Record<AvgsStage, string> = {
  startdatum_ausstehend: "bg-amber-100 text-amber-800",
  bewilligung_ausstehend: "bg-blue-100 text-blue-800",
  bewilligt: "bg-green-100 text-green-800",
};
