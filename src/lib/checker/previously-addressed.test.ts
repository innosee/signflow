import { describe, expect, it } from "vitest";

import { markCarriedOver, stableViolationId } from "./previously-addressed";
import type { CheckerInput, CheckerResult, Violation } from "./types";

const input = (over: Partial<CheckerInput> = {}): CheckerInput => ({
  teilnahme: "",
  ablauf: "",
  fazit: "",
  massnahmeTyp: "EKC",
  ...over,
});

const violation = (over: Partial<Violation> = {}): Violation => ({
  id: "fazit::test",
  category: "bewertung",
  severity: "soft_flag",
  section: "fazit",
  quote: "der Teilnehmer wirkt wenig motiviert",
  rule: "Keine Charakter-Bewertungen",
  suggestion: "der Teilnehmer äußerte, aktuell wenig Antrieb zu verspüren",
  ...over,
});

const result = (violations: Violation[]): CheckerResult => ({
  status: "needs_revision",
  mustHaves: [],
  violations,
});

describe("markCarriedOver (Konvergenz-Regel gegen Anpassungsrunden-Schleife)", () => {
  const quote = "der Teilnehmer wirkt wenig motiviert";
  const prevWithQuote = input({
    fazit: `Insgesamt zeigte sich, dass ${quote}, aber Fortschritte macht.`,
  });

  it("markiert beim ersten Check (keine Vorrunde) nichts", () => {
    const r = markCarriedOver(result([violation({ quote })]), null, null);
    expect(r.violations[0]!.carriedOver).toBeUndefined();
  });

  it("markiert Nachschieber: Quote lag unverändert im Vorrunden-Text, wurde aber nicht gemeldet", () => {
    const r = markCarriedOver(
      result([violation({ quote })]),
      prevWithQuote,
      new Set(["fazit::etwas-anderes"]),
    );
    expect(r.violations[0]!.carriedOver).toBe(true);
  });

  it("lässt bekannte, noch offene Findings offen (ID war in der Vorrunde)", () => {
    const v = violation({ quote, id: stableViolationId("fazit", quote) });
    const r = markCarriedOver(result([v]), prevWithQuote, new Set([v.id]));
    expect(r.violations[0]!.carriedOver).toBeUndefined();
  });

  it("lässt Findings in neuem/geändertem Text offen (Quote nicht im Vorrunden-Text)", () => {
    const r = markCarriedOver(
      result([violation({ quote: "eine ganz neue problematische Formulierung" })]),
      prevWithQuote,
      new Set<string>(),
    );
    expect(r.violations[0]!.carriedOver).toBeUndefined();
  });

  it("markiert hard_blocks NIE (Art-9/Gesundheit erscheint immer)", () => {
    const r = markCarriedOver(
      result([violation({ quote, severity: "hard_block", category: "medizin" })]),
      prevWithQuote,
      new Set<string>(),
    );
    expect(r.violations[0]!.carriedOver).toBeUndefined();
  });

  it("matcht Whitespace-/Case-tolerant (normalisierter Substring)", () => {
    const r = markCarriedOver(
      result([violation({ quote: "  Der  Teilnehmer\nwirkt wenig MOTIVIERT " })]),
      prevWithQuote,
      new Set<string>(),
    );
    expect(r.violations[0]!.carriedOver).toBe(true);
  });

  it("überspringt zu kurze Quotes (< 10 Zeichen, unsicherer Match)", () => {
    const r = markCarriedOver(
      result([violation({ quote: "wirkt" })]),
      prevWithQuote,
      new Set<string>(),
    );
    expect(r.violations[0]!.carriedOver).toBeUndefined();
  });

  it("prüft nur die eigene Section (Quote aus fazit matcht nicht gegen ablauf)", () => {
    const r = markCarriedOver(
      result([violation({ quote, section: "ablauf", id: `ablauf::x` })]),
      prevWithQuote, // Quote steht im fazit der Vorrunde, ablauf ist leer
      new Set<string>(),
    );
    expect(r.violations[0]!.carriedOver).toBeUndefined();
  });
});
