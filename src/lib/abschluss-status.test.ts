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
