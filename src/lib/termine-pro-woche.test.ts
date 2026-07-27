import { describe, expect, it } from "vitest";

import {
  innereWochenUnter2,
  isoWeek,
  isoWeekKey,
  randWochenUnter2,
  wochenUnter2,
} from "./termine-pro-woche";

describe("isoWeek", () => {
  it("zählt Mo–So als eine Woche", () => {
    // 2026-06-08 (Mo) bis 2026-06-14 (So) = KW 24.
    expect(isoWeek("2026-06-08")).toEqual({ year: 2026, week: 24 });
    expect(isoWeek("2026-06-14")).toEqual({ year: 2026, week: 24 });
    // 2026-06-15 (Mo) = KW 25.
    expect(isoWeek("2026-06-15")).toEqual({ year: 2026, week: 25 });
  });

  it("ordnet Jahreswechsel korrekt zu (ISO-Wochenjahr)", () => {
    // 2025-12-29 (Mo) gehört zu KW 1/2026.
    expect(isoWeek("2025-12-29")).toEqual({ year: 2026, week: 1 });
    // 2027-01-01 (Fr) gehört noch zu KW 53/2026.
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
  });

  it("isoWeekKey formatiert zweistellig", () => {
    expect(isoWeekKey("2026-01-05")).toBe("2026-W02");
    expect(isoWeekKey("2026-06-08")).toBe("2026-W24");
  });
});

describe("wochenUnter2", () => {
  it("meldet Wochen mit nur einem Termin", () => {
    const verletzt = wochenUnter2(["2026-06-08", "2026-06-15", "2026-06-16"]);
    // KW24: 1 Termin → Verstoß; KW25: 2 Termine → ok.
    expect(verletzt).toEqual(["2026-W24"]);
  });

  it("ist leer, wenn jede Woche ≥2 Termine hat", () => {
    expect(
      wochenUnter2(["2026-06-08", "2026-06-10", "2026-06-15", "2026-06-17"]),
    ).toEqual([]);
  });

  it("ignoriert Wochen ohne Termine (keine Lücken-Strafe)", () => {
    // KW24 zwei Termine, dann Lücke, KW27 zwei Termine — kein Verstoß.
    expect(
      wochenUnter2(["2026-06-08", "2026-06-09", "2026-06-29", "2026-06-30"]),
    ).toEqual([]);
  });

  it("leere Eingabe → kein Verstoß", () => {
    expect(wochenUnter2([])).toEqual([]);
  });
});

describe("innereWochenUnter2", () => {
  it("meldet nur ECHTE innere Einzel-Termin-Wochen", () => {
    // KW24 (2) | KW25 (1, INNEN) | KW26 (2) → nur KW25 ist ein Verstoß.
    expect(
      innereWochenUnter2([
        "2026-06-08",
        "2026-06-09",
        "2026-06-15",
        "2026-06-22",
        "2026-06-23",
      ]),
    ).toEqual(["2026-W25"]);
  });

  it("nimmt die Schlusswoche aus (Wrap-up mit 1 Termin ist kein Verstoß)", () => {
    // KW24 (2) | KW25 (2) | KW26 (1, LETZTE) → kein Verstoß (Antonenko-Fall).
    expect(
      innereWochenUnter2([
        "2026-06-08",
        "2026-06-09",
        "2026-06-15",
        "2026-06-16",
        "2026-06-22",
      ]),
    ).toEqual([]);
  });

  it("bei ≤2 belegten Wochen gibt es keine inneren Wochen", () => {
    expect(innereWochenUnter2(["2026-06-08", "2026-06-15"])).toEqual([]);
  });

  it("leere Eingabe → kein Verstoß", () => {
    expect(innereWochenUnter2([])).toEqual([]);
  });
});

describe("randWochenUnter2", () => {
  it("meldet die Schlusswoche mit nur 1 Termin", () => {
    // KW24 (2) | KW25 (2) | KW26 (1, LETZTE) → Randwoche KW26.
    expect(
      randWochenUnter2([
        "2026-06-08",
        "2026-06-09",
        "2026-06-15",
        "2026-06-16",
        "2026-06-22",
      ]),
    ).toEqual(["2026-W26"]);
  });

  it("meldet die Anfangswoche mit nur 1 Termin", () => {
    // KW24 (1, ERSTE) | KW25 (2) | KW26 (2) → Randwoche KW24.
    expect(
      randWochenUnter2([
        "2026-06-08",
        "2026-06-15",
        "2026-06-16",
        "2026-06-22",
        "2026-06-23",
      ]),
    ).toEqual(["2026-W24"]);
  });

  it("keine Randwoche, wenn Anfang und Ende ≥2 Termine haben", () => {
    expect(
      randWochenUnter2(["2026-06-08", "2026-06-09", "2026-06-15", "2026-06-16"]),
    ).toEqual([]);
  });

  it("leere Eingabe → keine Randwoche", () => {
    expect(randWochenUnter2([])).toEqual([]);
  });
});
