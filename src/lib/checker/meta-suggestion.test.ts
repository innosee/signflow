import { describe, expect, it } from "vitest";

import { quoteJustifiesHardBlock } from "./hard-block-terms";
import { isMetaSuggestion } from "./meta-suggestion";

describe("isMetaSuggestion", () => {
  // Reale Meta-Vorschläge aus dem Staging-Test 2026-07-15, die per
  // „Im Text übernehmen" wörtlich im Bericht gelandet sind.
  it("erkennt die beobachteten Meta-Vorschläge", () => {
    expect(
      isMetaSuggestion(
        "Es wäre besser, diese Formulierung zu vermeiden und stattdessen auf die Herausforderungen in der Selbstorganisation hinzuweisen.",
      ),
    ).toBe(true);
    expect(
      isMetaSuggestion(
        "Es wäre hilfreich, die Teilnahme als Lernprozess zu betrachten und die Möglichkeit zur Verbesserung zu betonen.",
      ),
    ).toBe(true);
    expect(
      isMetaSuggestion(
        "Stattdessen könnte man formulieren, dass Herr M. Unterstützung benötigt, um seine Selbstmarketing-Fähigkeiten zu entwickeln.",
      ),
    ).toBe(true);
    expect(
      isMetaSuggestion(
        "Es könnte hilfreich sein, die Formulierung zu ändern, um die Unterstützung und Entwicklungsmöglichkeiten zu betonen.",
      ),
    ).toBe(true);
  });

  it("lässt echte Ersatz-Formulierungen durch (Beispiele aus dem Prompt)", () => {
    expect(
      isMetaSuggestion(
        "thematisierte gesundheitliche Einschränkungen, die Auswirkungen auf die aktuelle Belastbarkeit haben",
      ),
    ).toBe(false);
    expect(
      isMetaSuggestion("TN benötigt weitere Unterstützung bei der Neuausrichtung"),
    ).toBe(false);
    expect(
      isMetaSuggestion("Integration erfordert eine Anpassung der Suchstrategie"),
    ).toBe(false);
    expect(
      isMetaSuggestion(
        "Der TN benötigte zu Beginn Unterstützung, um ins eigenständige Arbeiten zu finden; im Verlauf nahm die Eigeninitiative zu.",
      ),
    ).toBe(false);
  });
});

describe("quoteJustifiesHardBlock (Severity-Leitplanke)", () => {
  it("bestätigt hard_block bei wörtlich gelisteten Risiko-Begriffen", () => {
    expect(quoteJustifiesHardBlock("Herr M. leidet unter Depressionen.")).toBe(true);
    expect(quoteJustifiesHardBlock("Der TN ist nicht vermittelbar.")).toBe(true);
    expect(quoteJustifiesHardBlock("Er wurde am Arbeitsplatz gemobbt.")).toBe(true);
    expect(quoteJustifiesHardBlock("Sein Verhalten ist krankhaft kontrollierend.")).toBe(true);
    expect(quoteJustifiesHardBlock("Das liegt an seiner schweren Kindheit.")).toBe(true);
  });

  it("verweigert hard_block bei Küchenpsychologie ohne Listen-Begriff (der Flip-Flop-Fall)", () => {
    expect(
      quoteJustifiesHardBlock(
        "Vermutlich liegt ein Selbstwertproblem vor, ein typischer Fall von Aufschieberitis.",
      ),
    ).toBe(false);
    expect(
      quoteJustifiesHardBlock("Herr M. wirkt insgesamt unmotiviert und antriebslos."),
    ).toBe(false);
    expect(quoteJustifiesHardBlock("Seine Selbsteinschätzung ist unrealistisch.")).toBe(
      false,
    );
  });
});
