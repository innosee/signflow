import { describe, expect, it } from "vitest";

import { AVGS_STAGE_LABEL, avgsStage } from "./avgs-stage";

describe("avgsStage", () => {
  it("ist 'startdatum_ausstehend', solange kein Startdatum vereinbart und nicht bewilligt ist", () => {
    expect(avgsStage({ startDate: null, bewilligtAt: null })).toBe(
      "startdatum_ausstehend",
    );
  });

  it("ist 'bewilligung_ausstehend', wenn Startdatum gesetzt aber (noch) nicht bewilligt", () => {
    expect(avgsStage({ startDate: "2026-06-29", bewilligtAt: null })).toBe(
      "bewilligung_ausstehend",
    );
  });

  it("ist 'bewilligt', sobald bewilligtAt gesetzt ist (mit Startdatum)", () => {
    expect(
      avgsStage({ startDate: "2026-06-29", bewilligtAt: new Date() }),
    ).toBe("bewilligt");
  });

  it("bewilligtAt gewinnt: 'bewilligt' auch ohne Startdatum (BT hat aktiv bestätigt)", () => {
    expect(avgsStage({ startDate: null, bewilligtAt: new Date() })).toBe(
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
