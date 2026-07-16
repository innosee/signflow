import { describe, expect, it } from "vitest";

import { mergeViolationSets } from "./merge-violations";
import type { Violation } from "./types";

const violation = (over: Partial<Violation> = {}): Violation => ({
  id: over.quote ? `${over.section ?? "fazit"}::${over.quote.toLowerCase()}` : "fazit::x",
  category: "bewertung",
  severity: "soft_flag",
  section: "fazit",
  quote: "Platzhalter-Zitat für den Test",
  rule: "Regel",
  suggestion: "Ersatz",
  ...over,
});

describe("mergeViolationSets (Haupt-Lauf ∪ Recall-Scan)", () => {
  it("ergänzt Recall-Funde, die der Haupt-Lauf nicht gemeldet hat", () => {
    const primary = [violation({ quote: "Seine chaotische Art erschwerte den Verlauf" })];
    const recall = [violation({ quote: "Seine Selbsteinschätzung ist unrealistisch" })];
    const merged = mergeViolationSets(primary, recall);
    expect(merged).toHaveLength(2);
  });

  it("überspringt identische IDs (gleiche Section + gleiches Zitat)", () => {
    const v = violation({ quote: "wirkt unmotiviert und antriebslos" });
    expect(mergeViolationSets([v], [{ ...v }])).toHaveLength(1);
  });

  it("überspringt überlappende Zitate derselben Stelle (anders geschnitten)", () => {
    const primary = [
      violation({ quote: "Herr [NAME_1] wirkt insgesamt unmotiviert und antriebslos." }),
    ];
    const recall = [
      violation({ quote: "wirkt insgesamt unmotiviert", id: "fazit::kurz" }),
    ];
    expect(mergeViolationSets(primary, recall)).toHaveLength(1);
  });

  it("behandelt gleiche Zitate in VERSCHIEDENEN Sections als verschiedene Stellen", () => {
    const primary = [violation({ section: "fazit", quote: "zeigte wenig Eigeninitiative" })];
    const recall = [
      violation({ section: "ablauf", quote: "zeigte wenig Eigeninitiative", id: "ablauf::a" }),
    ];
    expect(mergeViolationSets(primary, recall)).toHaveLength(2);
  });

  it("Haupt-Lauf gewinnt: bei Überlappung bleibt dessen Karte (bessere Suggestion)", () => {
    const primary = [
      violation({ quote: "ist einfach kein Macher-Typ", suggestion: "gute Haupt-Suggestion" }),
    ];
    const recall = [
      violation({ quote: "kein Macher-Typ", id: "fazit::r", suggestion: "Recall-Suggestion" }),
    ];
    const merged = mergeViolationSets(primary, recall);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.suggestion).toBe("gute Haupt-Suggestion");
  });
});
