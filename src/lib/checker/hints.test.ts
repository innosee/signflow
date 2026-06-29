import { describe, expect, it } from "vitest";

import { buildAdvisoryHints } from "./hints";
import type { CheckerInput, CheckerResult } from "./types";

const input = (over: Partial<CheckerInput> = {}): CheckerInput => ({
  teilnahme: "",
  ablauf: "",
  fazit: "",
  ...over,
});

const result = (over: Partial<CheckerResult> = {}): CheckerResult => ({
  status: "needs_revision",
  mustHaves: [],
  violations: [],
  ...over,
});

describe("buildAdvisoryHints", () => {
  it("flaggt einen zu knappen Abschnitt mit konkretem Vorschlag", () => {
    const hints = buildAdvisoryHints(input({ fazit: "wird schon" }), result());
    const thin = hints.find((h) => h.id === "hint::thin::fazit");
    expect(thin).toBeTruthy();
    expect(thin!.structural).toBe(true);
    expect(thin!.severity).toBe("soft_flag");
    expect(thin!.suggestion).toContain("Fazit");
  });

  it("flaggt zu knappe Abschnitte NICHT, wenn sie ausführlich sind", () => {
    const lang =
      "Der Teilnehmer arbeitete durchgehend engagiert mit und brachte viele eigene Ideen und Fragestellungen aktiv in jede Sitzung ein.";
    const hints = buildAdvisoryHints(input({ teilnahme: lang }), result());
    expect(hints.find((h) => h.id === "hint::thin::teilnahme")).toBeUndefined();
  });

  it("ignoriert leere Abschnitte (deckt Pflichtbausteine ab)", () => {
    const hints = buildAdvisoryHints(input({ fazit: "" }), result());
    expect(hints.find((h) => h.id === "hint::thin::fazit")).toBeUndefined();
  });

  it("erkennt umgangssprachliche Floskeln", () => {
    const hints = buildAdvisoryHints(
      input({ ablauf: "war cool und alles lief super im Coaching." }),
      result(),
    );
    expect(hints.some((h) => h.rule === "Umgangssprachlich")).toBe(true);
    expect(hints.some((h) => h.suggestion.includes("war cool"))).toBe(true);
  });

  it("erzeugt Hinweis-Cards für fehlende Pflichtbausteine", () => {
    const r = result({
      mustHaves: [
        { topic: "profiling", covered: true },
        { topic: "umsetzung", covered: false, hint: "fehlt" },
      ],
    });
    const hints = buildAdvisoryHints(input(), r);
    const mh = hints.find((h) => h.id === "hint::musthave::umsetzung");
    expect(mh).toBeTruthy();
    expect(mh!.rule).toBe("Pflichtbaustein fehlt");
    expect(hints.find((h) => h.id === "hint::musthave::profiling")).toBeUndefined();
  });
});
