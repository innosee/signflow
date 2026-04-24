/**
 * Findet die Position eines LLM-gelieferten Zitats im Bericht-Text.
 * Das LLM zitiert leider nicht immer byte-identisch — trailing Ellipse,
 * zusätzliche Satzzeichen, Whitespace-Drift. Wir versuchen mehrere
 * Match-Strategien von strikt nach flexibel und geben die Start/End-
 * Position zurück, damit die UI die Stelle in der textarea markieren kann.
 *
 * Wir ersetzen hier NICHT — das Ersetzen passiert im UI über natives
 * Selektieren + Cmd+V durch den Coach. Damit ist der Use-Case robust
 * auch wenn das Zitat leicht abweicht: der Coach sieht, was markiert
 * wurde, und entscheidet selbst.
 */
export type LocateResult =
  | { found: false }
  | { found: true; start: number; end: number; matched: string };

export function locateQuote(text: string, quote: string): LocateResult {
  if (!quote || !text) return { found: false };

  // 1. Exakter Match.
  const exact = text.indexOf(quote);
  if (exact >= 0) {
    return {
      found: true,
      start: exact,
      end: exact + quote.length,
      matched: quote,
    };
  }

  // 2. Trailing Ellipse/Whitespace/Satzzeichen strippen, erneut suchen.
  // Schwellwert 20 Zeichen gegen False Positives bei kurzen Fragmenten.
  const trimmed = quote.replace(/[…\s.,;:!?]+$/u, "");
  if (trimmed.length >= 20 && trimmed !== quote) {
    const pos = text.indexOf(trimmed);
    if (pos >= 0) {
      return {
        found: true,
        start: pos,
        end: pos + trimmed.length,
        matched: trimmed,
      };
    }
  }

  // 3. Flexibler Regex — Whitespace-Runs tolerant, Anführungszeichen-Varianten.
  const cleaned = quote.replace(/[…]+$/gu, "").trim();
  if (cleaned.length >= 20) {
    try {
      const pattern = buildFlexiblePattern(cleaned);
      const match = pattern.exec(text);
      if (match && match[0].length >= 20 && match.index !== undefined) {
        return {
          found: true,
          start: match.index,
          end: match.index + match[0].length,
          matched: match[0],
        };
      }
    } catch {
      // Defekter Regex (unwahrscheinlich, escape sollte das abfangen) — ignorieren
    }
  }

  return { found: false };
}

function buildFlexiblePattern(quote: string): RegExp {
  const escaped = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexWs = escaped.replace(/\s+/g, "\\s+");
  const flexQuotes = flexWs
    .replace(/["„""]/g, `["„""]`)
    .replace(/['']/g, `['']`);
  return new RegExp(flexQuotes, "u");
}
