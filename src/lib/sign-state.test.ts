import { describe, expect, it } from "vitest";

import {
  classifyApprovalGate,
  deriveSessionStatus,
  evaluateSealReadiness,
  type SessionStatus,
} from "./sign-state";

describe("deriveSessionStatus", () => {
  it("ist 'pending', solange der Coach nicht signiert hat — auch wenn der Kunde schon signiert hat", () => {
    expect(deriveSessionStatus(false, false)).toBe("pending");
    // Kunde signiert VOR dem Coach (erlaubt) → Termin bleibt trotzdem pending.
    expect(deriveSessionStatus(false, true)).toBe("pending");
  });

  it("ist 'coach_signed', wenn nur der Coach signiert hat", () => {
    expect(deriveSessionStatus(true, false)).toBe("coach_signed");
  });

  it("ist 'completed', wenn Coach UND Kunde signiert haben", () => {
    expect(deriveSessionStatus(true, true)).toBe("completed");
  });
});

describe("classifyApprovalGate", () => {
  const completed = (participantSigned = true) =>
    ({ status: "completed" as SessionStatus, participantSigned });

  it("ist 'ready', wenn alle Termine vollständig sind", () => {
    expect(classifyApprovalGate([completed(), completed()])).toBe("ready");
  });

  it("leere Liste gilt als 'ready' (Leer-Fall behandeln die Aufrufer separat)", () => {
    expect(classifyApprovalGate([])).toBe("ready");
  });

  it("ist 'participant_open', wenn der Kunde selbst noch einen Termin offen hat", () => {
    const gate = classifyApprovalGate([
      completed(),
      { status: "coach_signed", participantSigned: false },
    ]);
    expect(gate).toBe("participant_open");
  });

  it("ist 'coach_open', wenn der Kunde fertig ist, aber der Coach noch nicht (der gemeldete Bug)", () => {
    // Kunde hat überall signiert; ein Termin ist nur 'pending', weil der Coach
    // (z.B. ein zweiter Kompetenzteam-Coach) noch nicht signiert hat.
    const gate = classifyApprovalGate([
      completed(),
      { status: "pending", participantSigned: true },
    ]);
    expect(gate).toBe("coach_open");
  });

  it("priorisiert 'participant_open' über 'coach_open', wenn beides offen ist", () => {
    const gate = classifyApprovalGate([
      { status: "pending", participantSigned: true }, // nur Coach offen
      { status: "pending", participantSigned: false }, // Kunde offen
    ]);
    expect(gate).toBe("participant_open");
  });
});

describe("evaluateSealReadiness", () => {
  const ok = {
    anwCheckPassedAt: new Date("2026-06-20"),
    abgeschlossenAt: new Date("2026-06-21"),
    reviewStatus: "approved",
    sessionStatuses: ["completed", "completed"] as SessionStatus[],
  };

  it("gibt null zurück, wenn alle Gates erfüllt sind", () => {
    expect(evaluateSealReadiness(ok)).toBeNull();
  });

  it("blockt fehlenden ANW-Check zuerst", () => {
    expect(evaluateSealReadiness({ ...ok, anwCheckPassedAt: null })).toBe(
      "anw_check_missing",
    );
  });

  it("blockt fehlenden Maßnahme-Abschluss", () => {
    expect(evaluateSealReadiness({ ...ok, abgeschlossenAt: null })).toBe(
      "not_abgeschlossen",
    );
  });

  it("blockt fehlende Bildungsträger-Freigabe", () => {
    expect(evaluateSealReadiness({ ...ok, reviewStatus: "pending" })).toBe(
      "review_not_approved",
    );
  });

  it("blockt einen Kurs ohne Termine", () => {
    expect(evaluateSealReadiness({ ...ok, sessionStatuses: [] })).toBe(
      "no_sessions",
    );
  });

  it("blockt, solange ein Termin nicht vollständig signiert ist", () => {
    expect(
      evaluateSealReadiness({
        ...ok,
        sessionStatuses: ["completed", "coach_signed"],
      }),
    ).toBe("sessions_incomplete");
  });

  it("prüft die Gates in fester Reihenfolge (ANW vor Abschluss)", () => {
    // Beide verletzt → der erste (ANW) gewinnt.
    expect(
      evaluateSealReadiness({
        ...ok,
        anwCheckPassedAt: null,
        abgeschlossenAt: null,
      }),
    ).toBe("anw_check_missing");
  });
});
