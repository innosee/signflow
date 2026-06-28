import { describe, expect, it } from "vitest";

import {
  ANW_STATUS_LABEL,
  ANW_STATUS_TONE,
  ANW_TONE_BADGE,
  anwStatus,
  type AnwStatus,
} from "./anw-status";

const ALL_STATUSES: AnwStatus[] = [
  "in_arbeit",
  "abgeschlossen",
  "anw_check_ok",
  "review_pending",
  "changes_requested",
  "review_approved",
  "gesiegelt",
];

describe("anwStatus", () => {
  it("ist 'in_arbeit', solange kein Gate erreicht ist", () => {
    expect(
      anwStatus({
        abgeschlossenAt: null,
        anwCheckPassedAt: null,
        reviewStatus: "none",
        fesStatus: null,
      }),
    ).toBe("in_arbeit");
  });

  it("ist 'abgeschlossen', sobald die Maßnahme abgeschlossen ist", () => {
    expect(
      anwStatus({
        abgeschlossenAt: new Date(),
        anwCheckPassedAt: null,
        reviewStatus: "none",
        fesStatus: "pending",
      }),
    ).toBe("abgeschlossen");
  });

  it("ist 'anw_check_ok', wenn der ANW-Check bestanden ist", () => {
    expect(
      anwStatus({
        abgeschlossenAt: new Date(),
        anwCheckPassedAt: new Date(),
        reviewStatus: "none",
        fesStatus: "pending",
      }),
    ).toBe("anw_check_ok");
  });

  it("spiegelt den BT-Prüfstatus (pending/changes/approved)", () => {
    const base = {
      abgeschlossenAt: new Date(),
      anwCheckPassedAt: new Date(),
      fesStatus: "pending" as const,
    };
    expect(anwStatus({ ...base, reviewStatus: "pending" })).toBe(
      "review_pending",
    );
    expect(anwStatus({ ...base, reviewStatus: "changes_requested" })).toBe(
      "changes_requested",
    );
    expect(anwStatus({ ...base, reviewStatus: "approved" })).toBe(
      "review_approved",
    );
  });

  it("ist 'gesiegelt', sobald fesStatus='completed' — schlägt alle anderen Gates", () => {
    // Selbst wenn Review noch 'pending' wäre: completed gewinnt (höchste Stufe).
    expect(
      anwStatus({
        abgeschlossenAt: new Date(),
        anwCheckPassedAt: new Date(),
        reviewStatus: "pending",
        fesStatus: "completed",
      }),
    ).toBe("gesiegelt");
  });

  it("zeigt 'changes_requested' als eigenen Status statt auf 'abgeschlossen' zurückzufallen", () => {
    expect(
      anwStatus({
        abgeschlossenAt: new Date(),
        anwCheckPassedAt: null,
        reviewStatus: "changes_requested",
        fesStatus: "pending",
      }),
    ).toBe("changes_requested");
  });

  it("hat Label, Tone und Badge-Klasse für jeden Status", () => {
    for (const status of ALL_STATUSES) {
      expect(ANW_STATUS_LABEL[status]).toBeTruthy();
      const tone = ANW_STATUS_TONE[status];
      expect(tone).toBeTruthy();
      expect(ANW_TONE_BADGE[tone]).toBeTruthy();
    }
  });
});
