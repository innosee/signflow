import { describe, expect, it } from "vitest";

import { abschlussStatus } from "./abschluss-status";

describe("abschlussStatus", () => {
  it("voll erbracht + letzter Termin = Bewilligungsende → unkritisch", () => {
    const st = abschlussStatus({
      geleisteteUe: 80,
      bewilligteUe: 80,
      letzterTermin: "2026-09-18",
      bewilligungsende: "2026-09-18",
    });
    expect(st.ueUnterschritten).toBe(false);
    expect(st.fehlendeUe).toBe(0);
    expect(st.zeitlichVorzeitig).toBe(false);
    expect(st.tageFrueher).toBe(0);
    expect(st.begruendungPflicht).toBe(false);
  });

  it("voll erbracht aber zeitlich früher → Hinweis, keine Begründungspflicht", () => {
    const st = abschlussStatus({
      geleisteteUe: 80,
      bewilligteUe: 80,
      letzterTermin: "2026-09-10",
      bewilligungsende: "2026-09-18",
    });
    expect(st.ueUnterschritten).toBe(false);
    expect(st.zeitlichVorzeitig).toBe(true);
    expect(st.tageFrueher).toBe(8);
    expect(st.begruendungPflicht).toBe(false);
  });

  it("UE unterschritten, aber bis zum Bewilligungsende → nur Begründungspflicht", () => {
    const st = abschlussStatus({
      geleisteteUe: 78,
      bewilligteUe: 80,
      letzterTermin: "2026-09-18",
      bewilligungsende: "2026-09-18",
    });
    expect(st.ueUnterschritten).toBe(true);
    expect(st.fehlendeUe).toBe(2);
    expect(st.zeitlichVorzeitig).toBe(false);
    expect(st.begruendungPflicht).toBe(true);
  });

  it("beides zugleich: weniger UE UND zeitlich früher", () => {
    const st = abschlussStatus({
      geleisteteUe: 40,
      bewilligteUe: 80,
      letzterTermin: "2026-08-01",
      bewilligungsende: "2026-09-18",
    });
    expect(st.ueUnterschritten).toBe(true);
    expect(st.fehlendeUe).toBe(40);
    expect(st.zeitlichVorzeitig).toBe(true);
    expect(st.tageFrueher).toBe(48);
    expect(st.begruendungPflicht).toBe(true);
  });

  it("ohne Bewilligungsende ist die zeitliche Achse nicht berechenbar", () => {
    const st = abschlussStatus({
      geleisteteUe: 80,
      bewilligteUe: 80,
      letzterTermin: "2026-09-10",
      bewilligungsende: null,
    });
    expect(st.zeitlichVorzeitig).toBe(false);
    expect(st.tageFrueher).toBeNull();
  });

  it("ohne Termine (Sofort-Abbruch, 0 UE) → UE unterschritten, keine Zeitachse", () => {
    const st = abschlussStatus({
      geleisteteUe: 0,
      bewilligteUe: 80,
      letzterTermin: null,
      bewilligungsende: "2026-09-18",
    });
    expect(st.ueUnterschritten).toBe(true);
    expect(st.zeitlichVorzeitig).toBe(false);
    expect(st.tageFrueher).toBeNull();
    expect(st.begruendungPflicht).toBe(true);
  });
});

/**
 * Bewilligung nach Zeitraum (AA Regensburg): die beiden Umstände tauschen ihre
 * Rollen. Nicht ausgeschöpfter Zeitraum = Pflicht-Begründung, weniger UE als
 * irgendwo hinterlegt = nur Hinweis.
 */
describe("abschlussStatus mit Basis „Zeitraum\u201c", () => {
  const zeitraum = "zeitraum_nicht_ausgeschoepft" as const;

  it("verlangt die Begründung für den nicht ausgeschöpften Zeitraum", () => {
    const st = abschlussStatus({
      geleisteteUe: 40,
      bewilligteUe: 40,
      letzterTermin: "2026-10-01",
      bewilligungsende: "2026-10-27",
      begruendungPflichtBei: zeitraum,
    });
    expect(st.zeitlichVorzeitig).toBe(true);
    expect(st.begruendungPflicht).toBe(true);
    expect(st.begruendungGrund).toBe(zeitraum);
  });

  it("verlangt KEINE Begründung, nur weil weniger UE erbracht wurden", () => {
    // Der Kern des Regensburg-Falls: 18 statt 60 UE ist kein Verstoß, solange
    // der bewilligte Zeitraum vollständig gelaufen ist.
    const st = abschlussStatus({
      geleisteteUe: 18,
      bewilligteUe: 60,
      letzterTermin: "2026-10-27",
      bewilligungsende: "2026-10-27",
      begruendungPflichtBei: zeitraum,
    });
    expect(st.ueUnterschritten).toBe(true);
    expect(st.begruendungPflicht).toBe(false);
    expect(st.begruendungGrund).toBeNull();
  });

  it("derselbe Fall wäre in der UE-Basis begründungspflichtig", () => {
    const st = abschlussStatus({
      geleisteteUe: 18,
      bewilligteUe: 60,
      letzterTermin: "2026-10-27",
      bewilligungsende: "2026-10-27",
    });
    expect(st.begruendungPflicht).toBe(true);
    expect(st.begruendungGrund).toBe("ue_unterschritten");
  });

  it("ohne Bewilligungsende ist nichts begründungspflichtig (Zeitachse fehlt)", () => {
    const st = abschlussStatus({
      geleisteteUe: 10,
      bewilligteUe: 60,
      letzterTermin: "2026-10-01",
      bewilligungsende: null,
      begruendungPflichtBei: zeitraum,
    });
    expect(st.begruendungPflicht).toBe(false);
  });
});

describe("abschlussStatus: Lücken im bewilligten Zeitraum", () => {
  const zeitraum = "zeitraum_nicht_ausgeschoepft" as const;

  it("macht eine Lücke mitten im Zeitraum begründungspflichtig", () => {
    // Zeitraum bis zum letzten Tag genutzt, aber eine Woche ohne Termine.
    const st = abschlussStatus({
      geleisteteUe: 40,
      bewilligteUe: 0,
      letzterTermin: "2026-10-21",
      bewilligungsende: "2026-10-21",
      begruendungPflichtBei: zeitraum,
      luecken: 2,
    });
    expect(st.zeitlichVorzeitig).toBe(false);
    expect(st.luecken).toBe(2);
    expect(st.begruendungPflicht).toBe(true);
  });

  it("lückenlos + Zeitraum ausgeschöpft → keine Begründung nötig", () => {
    const st = abschlussStatus({
      geleisteteUe: 40,
      bewilligteUe: 0,
      letzterTermin: "2026-10-21",
      bewilligungsende: "2026-10-21",
      begruendungPflichtBei: zeitraum,
      luecken: 0,
    });
    expect(st.begruendungPflicht).toBe(false);
  });

  it("Lücken lassen die UE-Basis unberührt", () => {
    // Wichtig fürs Bestandsverhalten: dort entscheidet allein die UE-Zahl.
    const st = abschlussStatus({
      geleisteteUe: 80,
      bewilligteUe: 80,
      letzterTermin: "2026-10-21",
      bewilligungsende: "2026-10-21",
      luecken: 5,
    });
    expect(st.begruendungPflicht).toBe(false);
  });
});
