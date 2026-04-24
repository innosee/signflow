/**
 * Robuster String-Ersetzer für die Quick-Apply-Funktion im Checker. Das
 * LLM liefert Zitate leider nicht immer byte-identisch mit der Quelle:
 *
 *   - Trailing `…` oder `...` (Abbruch eines langen Zitats)
 *   - Trailing Satzzeichen, die nicht im Original stehen (z.B. hinzugefügter Punkt)
 *   - Unterschiedliche Whitespace-Runs (Doppelspace, Non-Breaking-Space,
 *     Tabs, harte Zeilenumbrüche innerhalb eines Satzes)
 *   - Variierende Anführungszeichen (" vs „ vs " vs ")
 *
 * Wir versuchen mehrere Match-Strategien, von „exakt" nach „flexibel".
 * Jede erfolgreiche Strategie liefert zurück, welches Original-Substring
 * ersetzt wurde — damit das UI die Erfolgsquote kommunizieren kann.
 */
export type ApplyResult =
  | { found: false }
  | { found: true; text: string; matchedOriginal: string };

export function applySuggestion(
  text: string,
  quote: string,
  suggestion: string,
): ApplyResult {
  if (!quote) return { found: false };

  // 1. Exakter Match — billigster Weg.
  if (text.includes(quote)) {
    return {
      found: true,
      text: text.replace(quote, suggestion),
      matchedOriginal: quote,
    };
  }

  // 2. Trailing Ellipse/Whitespace/Satzzeichen strippen und nochmal versuchen.
  // Schwellwert 20 Zeichen, damit wir nicht aus Versehen ein 3-Buchstaben-Fragment
  // ersetzen, das überall vorkommen könnte.
  const trimmed = quote.replace(/[…\s.,;:!?]+$/u, "");
  if (trimmed.length >= 20 && trimmed !== quote && text.includes(trimmed)) {
    return {
      found: true,
      text: text.replace(trimmed, suggestion),
      matchedOriginal: trimmed,
    };
  }

  // 3. Flexibler Regex — Whitespace-Runs + Anführungszeichen + Ellipsen
  // werden toleriert. Wir suchen das längste Prefix des bereinigten Zitats,
  // das im Text vorkommt, und ersetzen diesen Bereich.
  const cleaned = quote.replace(/[…]+$/gu, "").trim();
  if (cleaned.length >= 20) {
    const pattern = buildFlexiblePattern(cleaned);
    const match = text.match(pattern);
    if (match && match[0].length >= 20) {
      return {
        found: true,
        text: text.replace(match[0], suggestion),
        matchedOriginal: match[0],
      };
    }
  }

  return { found: false };
}

function buildFlexiblePattern(quote: string): RegExp {
  // Zuerst Regex-Metazeichen escapen.
  const escaped = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Whitespace-Runs im Zitat als flexibles \s+ — toleriert Doppelspaces,
  // NBSP, hart umbrochene Zeilen etc.
  const flexWs = escaped.replace(/\s+/g, "\\s+");
  // Anführungszeichen: alle Varianten gegenseitig akzeptieren.
  const flexQuotes = flexWs
    .replace(/["„""]/g, `["„""]`)
    .replace(/['']/g, `['']`);
  return new RegExp(flexQuotes, "u");
}
