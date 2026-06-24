/**
 * Differenzierter Abschluss-Status einer Maßnahme — trennt zwei fachlich
 * unabhängige Umstände, die früher beide pauschal „vorzeitiges Ende" hießen:
 *
 *  1. **zeitlich vorzeitig** — der letzte Termin liegt VOR dem Bewilligungsende
 *     (`courses.endDate`). Kann auch eintreten, wenn alle UE erbracht wurden
 *     (komprimierter Ablauf) → nur Hinweis, KEINE Pflicht-Begründung.
 *  2. **UE-Unterschreitung** — es wurden weniger UE durchgeführt als bewilligt
 *     → Pflicht-Begründung (AfA-relevant).
 *
 * Bewusst DB-frei + ohne `src/db`-Import → unit-testbar (wie `avgs-stage.ts`).
 * Wird von der Server-Action UND dem Button geteilt, damit Anzeige und
 * serverseitige Wahrheit nicht auseinanderlaufen.
 */

export type AbschlussStatus = {
  /** geleistete < bewilligte UE. */
  ueUnterschritten: boolean;
  /** Fehlende UE (>= 0); 0 wenn voll erbracht. */
  fehlendeUe: number;
  /** Letzter Termin vor dem Bewilligungsende (nur wenn beide Daten gesetzt). */
  zeitlichVorzeitig: boolean;
  /** Tage zwischen letztem Termin und Bewilligungsende, falls berechenbar. */
  tageFrueher: number | null;
  /** Begründung ist Pflicht — gilt ausschließlich bei UE-Unterschreitung. */
  begruendungPflicht: boolean;
};

/** Tagesdifferenz zweier ISO-Kalendertage (YYYY-MM-DD), ohne Zeitzone. */
function tageDiff(vonIso: string, bisIso: string): number {
  const [y1, m1, d1] = vonIso.split("-").map((s) => Number.parseInt(s, 10));
  const [y2, m2, d2] = bisIso.split("-").map((s) => Number.parseInt(s, 10));
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000,
  );
}

export function abschlussStatus(p: {
  geleisteteUe: number;
  bewilligteUe: number;
  /** Max. Datum (ISO) der completed Sessions; null wenn keine. */
  letzterTermin: string | null;
  /** courses.endDate (Bewilligungsende); null wenn noch nicht erfasst. */
  bewilligungsende: string | null;
}): AbschlussStatus {
  const ueUnterschritten = p.geleisteteUe < p.bewilligteUe;
  const fehlendeUe = Math.max(0, p.bewilligteUe - p.geleisteteUe);

  const zeitlichVorzeitig =
    p.letzterTermin !== null &&
    p.bewilligungsende !== null &&
    p.letzterTermin < p.bewilligungsende;

  const tageFrueher =
    p.letzterTermin !== null && p.bewilligungsende !== null
      ? tageDiff(p.letzterTermin, p.bewilligungsende)
      : null;

  return {
    ueUnterschritten,
    fehlendeUe,
    zeitlichVorzeitig,
    tageFrueher,
    begruendungPflicht: ueUnterschritten,
  };
}
