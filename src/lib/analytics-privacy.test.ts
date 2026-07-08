import { describe, expect, it } from "vitest";

import { buildSearchEventPayload, shouldLoadAnalytics } from "./analytics-privacy";

/**
 * Regression zu PR #135 (docs/test-plan-access-control.md §G):
 *  - Analytics-Script darf NICHT auf /sign/<token> laden (Token-Leak-Schutz).
 *  - Such-Tracking im Cockpit darf nie den Suchstring (= Teilnehmernamen)
 *    enthalten, nur dessen Länge.
 */
describe("shouldLoadAnalytics", () => {
  it("lädt NICHT auf den Magic-Link-Seiten /sign/<token>", () => {
    expect(shouldLoadAnalytics("/sign/abc123def456")).toBe(false);
    expect(shouldLoadAnalytics("/sign/")).toBe(false);
  });

  it("lädt auf allen anderen Seiten", () => {
    for (const p of ["/", "/login", "/coach", "/bildungstraeger", "/coach/courses/1"]) {
      expect(shouldLoadAnalytics(p)).toBe(true);
    }
  });

  it("verwechselt /signup o. Ä. nicht mit /sign/ (kein false positive)", () => {
    expect(shouldLoadAnalytics("/signup")).toBe(true);
    expect(shouldLoadAnalytics("/sign-in")).toBe(true);
  });

  it("lädt bei null/undefined-Pfad (bisheriges Verhalten, kein /sign/-Pfad)", () => {
    expect(shouldLoadAnalytics(null)).toBe(true);
    expect(shouldLoadAnalytics(undefined)).toBe(true);
  });
});

describe("buildSearchEventPayload", () => {
  it("gibt NUR die Länge zurück, nie den Suchstring", () => {
    const payload = buildSearchEventPayload("Max Mustermann");
    expect(payload).toEqual({ qLength: 14 });
    // Absicherung gegen versehentliches Leaken: kein Feld enthält den String.
    expect(JSON.stringify(payload)).not.toContain("Max");
  });

  it("feuert kein Event (null) bei < 2 Zeichen nach Trim", () => {
    expect(buildSearchEventPayload("")).toBeNull();
    expect(buildSearchEventPayload(" ")).toBeNull();
    expect(buildSearchEventPayload("a")).toBeNull();
    expect(buildSearchEventPayload("  b  ")).toBeNull();
  });

  it("trimmt vor der Längenmessung", () => {
    expect(buildSearchEventPayload("  ab  ")).toEqual({ qLength: 2 });
  });
});
