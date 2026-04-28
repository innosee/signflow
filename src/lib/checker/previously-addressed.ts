import type { CheckerResult, CheckerSection, Violation } from "./types";

/**
 * Fingerprint einer übernommenen Umformulierung — wir merken uns für die
 * Lebensdauer der Browser-Session, welche Suggestion-Texte schon mal als
 * Ersatz im Bericht gelandet sind. Pro Section getrennt, weil das LLM
 * Quotes immer einer Section zuordnet.
 */
export function fingerprintApplied(
  section: CheckerSection,
  suggestion: string,
): string {
  return `${section}::${normalize(suggestion)}`;
}

/**
 * Markiert Violations, deren Quote auf einem schon übernommenen Vorschlag
 * sitzt. Heuristik: nach Whitespace-/Case-Normalisierung muss das Quote
 * Substring der applied-Suggestion sein, oder umgekehrt — fängt sowohl
 * den Fall „LLM zitiert Bruchstück der neuen Formulierung" als auch
 * „LLM zitiert die ganze neue Formulierung" ab.
 */
export function markPreviouslyAddressed(
  result: CheckerResult,
  applied: ReadonlySet<string>,
): CheckerResult {
  if (applied.size === 0) return result;

  const bySection = new Map<CheckerSection, string[]>();
  for (const fp of applied) {
    const idx = fp.indexOf("::");
    if (idx < 0) continue;
    const section = fp.slice(0, idx) as CheckerSection;
    const suggestion = fp.slice(idx + 2);
    const list = bySection.get(section) ?? [];
    list.push(suggestion);
    bySection.set(section, list);
  }

  const violations: Violation[] = result.violations.map((v) => {
    const candidates = bySection.get(v.section);
    if (!candidates) return v;
    const normalQuote = normalize(v.quote);
    if (normalQuote.length < 10) return v; // zu kurz für sichere Substring-Match
    const hit = candidates.some(
      (sug) => sug.includes(normalQuote) || normalQuote.includes(sug),
    );
    return hit ? { ...v, previouslyAddressed: true } : v;
  });

  return { ...result, violations };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
