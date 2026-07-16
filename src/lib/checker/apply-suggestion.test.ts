import { describe, expect, it } from "vitest";

import { applySuggestionToText } from "./apply-suggestion";
import { locateQuote } from "./locate-quote";

describe("applySuggestionToText (Naht-Bereinigung)", () => {
  it("schneidet ein dupliziertes Subjekt ab (Fall: Herr M. Herr M.)", () => {
    const text = "Herr M. wirkt insgesamt unmotiviert und antriebslos. Weiter im Text.";
    // Quote deckt nur das Prädikat ab, die Suggestion wiederholt das Subjekt.
    const start = text.indexOf("wirkt");
    const end = text.indexOf("antriebslos.") + "antriebslos.".length;
    const out = applySuggestionToText(
      text,
      start,
      end,
      "Herr M. zeigte Herausforderungen in der Motivation.",
    );
    expect(out).toBe(
      "Herr M. zeigte Herausforderungen in der Motivation. Weiter im Text.",
    );
    expect(out).not.toContain("Herr M. Herr M.");
  });

  it("lässt Suggestions ohne Überlappung unverändert", () => {
    const text = "Anfang. Er ist einfach kein Macher-Typ. Ende.";
    const start = text.indexOf("Er ist");
    const end = text.indexOf("Macher-Typ.") + "Macher-Typ.".length;
    const out = applySuggestionToText(
      text,
      start,
      end,
      "Die Übungen erforderten zusätzliche Impulse.",
    );
    expect(out).toBe("Anfang. Die Übungen erforderten zusätzliche Impulse. Ende.");
  });

  it("vergleicht case-insensitiv (Satzanfang vs. Kleinschreibung)", () => {
    const text = "HERR M. wirkt unmotiviert.";
    const start = text.indexOf("wirkt");
    const out = applySuggestionToText(
      text,
      start,
      text.length,
      "Herr M. arbeitet an seiner Motivation.",
    );
    expect(out).toBe("HERR M. arbeitet an seiner Motivation.");
  });

  it("schneidet nicht mitten im Wort (keine Wortgrenze = keine Bereinigung)", () => {
    const text = "Er kann das. Erfahrung sammelte er kaum.";
    const start = text.indexOf("Erfahrung");
    const out = applySuggestionToText(
      text,
      start,
      text.length,
      "Erfahrungen wurden im Coaching gezielt aufgebaut.",
    );
    // "Er" steht vor der Stelle, aber "Erfahrungen" darf nicht zu "fahrungen…" werden.
    expect(out).toContain("Erfahrungen wurden im Coaching");
  });
});

describe("locateQuote — case-tolerant (LLM ändert Groß-/Kleinschreibung)", () => {
  it("findet ein Zitat, dessen erstes Wort das LLM kleingeschrieben hat", () => {
    const text =
      "Vorher etwas Kontext. Seine chaotische Art und die offensichtlich fehlende Disziplin haben den Coaching-Verlauf erschwert. Danach mehr.";
    const loc = locateQuote(
      text,
      "seine chaotische Art und die offensichtlich fehlende Disziplin haben den Coaching-Verlauf erschwert.",
    );
    expect(loc.found).toBe(true);
    if (loc.found) {
      expect(text.slice(loc.start, loc.end)).toContain("Seine chaotische Art");
    }
  });
});
