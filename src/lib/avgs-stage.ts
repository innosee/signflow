/**
 * Abgeleiteter AVGS-Erfassungs-Status eines Kurses (gestufte Datums-Erfassung).
 *
 * Die drei Datums-Konzepte entstehen zeitlich nacheinander:
 *  1. AVGS-Gutschein-Gültigkeit — bei Anlage bekannt (immer gesetzt, Pflicht).
 *  2. Startdatum — nach dem Erstgespräch vereinbart (`courses.startDate`).
 *  3. Bewilligungsende — kommt mit der Bewilligung der AA/JC (`courses.endDate`).
 *
 * Bewusst DB-frei + ohne `src/db`-Import → unit-testbar (wie `course-form.ts`).
 * Kein eigenes Enum/Spalte in der DB: der Stage wird aus den vorhandenen
 * Feldern berechnet und kann so nie mit ihnen auseinanderlaufen.
 */

export type AvgsStage =
  | "startdatum_ausstehend"
  | "bewilligung_ausstehend"
  | "bewilligt";

export function avgsStage(c: {
  startDate: string | null;
  endDate: string | null;
}): AvgsStage {
  if (!c.startDate) return "startdatum_ausstehend";
  if (!c.endDate) return "bewilligung_ausstehend";
  return "bewilligt";
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
