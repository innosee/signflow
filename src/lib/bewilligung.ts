/**
 * Bewilligungsbasis einer Maßnahme — die EINE Stelle, an der sich „bewilligt
 * nach UE" und „bewilligt nach Zeitraum" unterscheiden.
 *
 * Hintergrund: Die AA Regensburg bewilligt nicht mehr eine Zahl
 * Unterrichtseinheiten, sondern den Maßnahmenzeitraum (Feedback 09/2026).
 * Läuft eine Maßnahme über 12 Wochen, muss sie auch über 12 Wochen laufen —
 * wie viele UE darin erbracht werden, ist nicht vorgegeben.
 *
 * Bewusst DB-frei und ohne `src/db`-Import → unit-testbar (wie
 * `abschluss-status.ts` und `avgs-stage.ts`). Alle Aufrufer — UE-Gate beim
 * Termin anlegen, Anwesenheitsnachweis, Abschluss-Status — fragen hier, statt
 * je eigene `if`s über die Basis zu bauen. Ein Zweig, eine Testdatei.
 */

export type Bewilligungsbasis = "ue" | "zeitraum";

export type BewilligungsRegeln = {
  /**
   * Harte Obergrenze für die Summe der regulären UE eines Kurses.
   * Basis `ue`: die bewilligten UE. Basis `zeitraum`: die zertifizierte
   * Obergrenze des Trägers — mehr darf er laut Zulassung ohnehin nicht.
   */
  ueObergrenze: number;
  /**
   * Weist der Anwesenheitsnachweis eine BEWILLIGTE UE-Zahl aus? Bei Basis
   * `zeitraum` nein — dort wurde keine bewilligt, und eine Zahl auf dem
   * AfA-Dokument, die niemand bewilligt hat, wäre schlicht falsch. Die
   * GELEISTETEN UE stehen in beiden Fällen drauf.
   */
  weistBewilligteUeAus: boolean;
  /**
   * Welcher Umstand beim Abschluss eine Pflicht-Begründung auslöst.
   * Basis `ue`: zu wenige UE erbracht. Basis `zeitraum`: der bewilligte
   * Zeitraum wurde nicht ausgeschöpft — genau das, worauf Regensburg schaut.
   * Der jeweils andere Umstand bleibt ein reiner Hinweis.
   */
  begruendungPflichtBei: "ue_unterschritten" | "zeitraum_nicht_ausgeschoepft";
};

export function bewilligungsRegeln(p: {
  basis: Bewilligungsbasis;
  /** `courses.anzahl_bewilligte_ue`. */
  anzahlBewilligteUe: number;
  /** `tenants.zert_max_ue` — zertifizierte Obergrenze des Trägers. */
  zertMaxUe: number;
}): BewilligungsRegeln {
  if (p.basis === "zeitraum") {
    return {
      ueObergrenze: p.zertMaxUe,
      weistBewilligteUeAus: false,
      begruendungPflichtBei: "zeitraum_nicht_ausgeschoepft",
    };
  }
  return {
    ueObergrenze: p.anzahlBewilligteUe,
    weistBewilligteUeAus: true,
    begruendungPflichtBei: "ue_unterschritten",
  };
}

/**
 * Überschreitet der Bewilligungszeitraum die zertifizierte Höchstdauer? Nur
 * für eine WARNUNG beim Anlegen gedacht, nie als Block: vier Bestandskurse
 * liegen bereits knapp darüber, ein harter Riegel würde sie nachträglich zu
 * Regelverstößen erklären. `null` bei unvollständigen Daten.
 */
export function zeitraumWochen(
  startDate: string | null,
  endDate: string | null,
): number | null {
  if (!startDate || !endDate) return null;
  const [y1, m1, d1] = startDate.split("-").map((s) => Number.parseInt(s, 10));
  const [y2, m2, d2] = endDate.split("-").map((s) => Number.parseInt(s, 10));
  if ([y1, m1, d1, y2, m2, d2].some((n) => !Number.isFinite(n))) return null;
  const tage = (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000;
  return tage / 7;
}
