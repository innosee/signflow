import { describe, expect, it } from "vitest";

import { AVGS_STAGE_LABEL, avgsStage } from "./avgs-stage";

describe("avgsStage", () => {
  it("ist 'startdatum_ausstehend', solange kein Startdatum vereinbart ist", () => {
    expect(avgsStage({ startDate: null, endDate: null })).toBe(
      "startdatum_ausstehend",
    );
    // Defensiv: Bewilligungsende ohne Startdatum bleibt 'startdatum_ausstehend'.
    expect(avgsStage({ startDate: null, endDate: "2026-09-18" })).toBe(
      "startdatum_ausstehend",
    );
  });

  it("ist 'bewilligung_ausstehend', wenn Startdatum gesetzt aber kein Ende", () => {
    expect(avgsStage({ startDate: "2026-06-29", endDate: null })).toBe(
      "bewilligung_ausstehend",
    );
  });

  it("ist 'bewilligt', wenn Startdatum und Bewilligungsende gesetzt sind", () => {
    expect(avgsStage({ startDate: "2026-06-29", endDate: "2026-09-18" })).toBe(
      "bewilligt",
    );
  });

  it("hat ein Label für jeden Stage", () => {
    for (const stage of [
      "startdatum_ausstehend",
      "bewilligung_ausstehend",
      "bewilligt",
    ] as const) {
      expect(AVGS_STAGE_LABEL[stage]).toBeTruthy();
    }
  });
});
