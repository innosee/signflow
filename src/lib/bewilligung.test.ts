import { describe, expect, it } from "vitest";

import { bewilligungsRegeln, zeitraumWochen } from "@/lib/bewilligung";

describe("bewilligungsRegeln", () => {
  it("Basis UE verhält sich wie bisher: bewilligte UE sind Grenze und werden ausgewiesen", () => {
    expect(
      bewilligungsRegeln({ basis: "ue", anzahlBewilligteUe: 80, zertMaxUe: 80 }),
    ).toEqual({
      ueObergrenze: 80,
      weistBewilligteUeAus: true,
      begruendungPflichtBei: "ue_unterschritten",
    });
  });

  it("Basis UE ignoriert die Zertifizierungs-Grenze (die bewilligte Zahl gilt)", () => {
    const r = bewilligungsRegeln({
      basis: "ue",
      anzahlBewilligteUe: 20,
      zertMaxUe: 80,
    });
    expect(r.ueObergrenze).toBe(20);
  });

  it("Basis Zeitraum nutzt die zertifizierte Obergrenze statt der bewilligten UE", () => {
    const r = bewilligungsRegeln({
      basis: "zeitraum",
      anzahlBewilligteUe: 20,
      zertMaxUe: 80,
    });
    expect(r.ueObergrenze).toBe(80);
  });

  it("Basis Zeitraum weist KEINE bewilligte UE-Zahl aus", () => {
    // Eine Zahl auf dem AfA-Nachweis, die niemand bewilligt hat, wäre falsch.
    expect(
      bewilligungsRegeln({
        basis: "zeitraum",
        anzahlBewilligteUe: 60,
        zertMaxUe: 80,
      }).weistBewilligteUeAus,
    ).toBe(false);
  });

  it("Basis Zeitraum verlangt die Begründung für den nicht ausgeschöpften Zeitraum", () => {
    expect(
      bewilligungsRegeln({
        basis: "zeitraum",
        anzahlBewilligteUe: 0,
        zertMaxUe: 80,
      }).begruendungPflichtBei,
    ).toBe("zeitraum_nicht_ausgeschoepft");
  });
});

describe("zeitraumWochen", () => {
  it("rechnet Kalendertage in Wochen um", () => {
    expect(zeitraumWochen("2026-08-04", "2026-10-27")).toBeCloseTo(12, 1);
  });

  it("erkennt die Überschreitung der zertifizierten 16 Wochen", () => {
    // Echter Bestandskurs (AA Regensburg): 27.08. – 23.12.2026.
    expect(zeitraumWochen("2026-08-27", "2026-12-23")).toBeGreaterThan(16);
  });

  it("liefert null bei unvollständigen Daten", () => {
    expect(zeitraumWochen(null, "2026-10-27")).toBeNull();
    expect(zeitraumWochen("2026-08-04", null)).toBeNull();
    expect(zeitraumWochen("", "")).toBeNull();
  });
});
