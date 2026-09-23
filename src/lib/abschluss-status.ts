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
 * Welcher der beiden Umstände die Pflicht-Begründung auslöst, hängt an der
 * Bewilligungsbasis (`src/lib/bewilligung.ts`): Bei „bewilligt nach Zeitraum"
 * (AA Regensburg) tauschen die beiden ihre Rollen — dann ist der nicht
 * ausgeschöpfte Zeitraum das Begründungspflichtige und die UE-Zahl nur noch
 * ein Hinweis. Ohne Angabe gilt die UE-Basis, also das bisherige Verhalten.
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
  /** Wochen mit <2 Terminen im bewilligten Zeitraum (nur Zeitraum-Basis). */
  luecken: number;
  /**
   * Begründung ist Pflicht. Bei UE-Basis wegen UE-Unterschreitung, bei
   * Zeitraum-Basis wegen nicht ausgeschöpftem Bewilligungszeitraum.
   */
  begruendungPflicht: boolean;
  /**
   * Worauf sich eine geforderte Begründung bezieht — für die Beschriftung in
   * Button, Nachweis und BT-Prüfung, damit dort nicht erneut über die Basis
   * verzweigt wird.
   */
  begruendungGrund: "ue_unterschritten" | "zeitraum_nicht_ausgeschoepft" | null;
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
  /**
   * Welcher Umstand begründungspflichtig ist — aus `bewilligungsRegeln()`.
   * Default `"ue_unterschritten"` = bisheriges Verhalten, damit Bestandskurse
   * und alle Aufrufer ohne Angabe exakt gleich bleiben.
   */
  begruendungPflichtBei?: "ue_unterschritten" | "zeitraum_nicht_ausgeschoepft";
  /**
   * Wochen im bewilligten Zeitraum mit weniger als 2 Terminen (inkl. ganz
   * leerer), aus `wochenUnter2ImZeitraum`. Nur in der Zeitraum-Basis
   * relevant: dort ist eine Lücke mitten drin genauso ein „Zeitraum nicht
   * ausgeschöpft" wie ein zu frühes Ende — und der Fall, den die AA
   * Regensburg am genauesten anschaut. Default 0 = kein Einfluss.
   */
  luecken?: number;
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

  const pflichtBei = p.begruendungPflichtBei ?? "ue_unterschritten";
  const luecken = p.luecken ?? 0;
  const begruendungPflicht =
    pflichtBei === "zeitraum_nicht_ausgeschoepft"
      ? zeitlichVorzeitig || luecken > 0
      : ueUnterschritten;

  return {
    ueUnterschritten,
    fehlendeUe,
    zeitlichVorzeitig,
    tageFrueher,
    luecken,
    begruendungPflicht,
    begruendungGrund: begruendungPflicht ? pflichtBei : null,
  };
}
