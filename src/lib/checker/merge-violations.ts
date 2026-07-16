import type { Violation } from "./types";

/**
 * Vereinigt die Violations des Haupt-Laufs mit denen des Recall-Scans
 * (Satz-für-Satz-Enumerator, siehe buildRecallScanPrompt). Der Haupt-Lauf
 * gewinnt bei Überschneidungen — seine Vorschläge entstehen mit vollem
 * Prüf-Kontext. Ein Recall-Fund kommt nur dazu, wenn er eine Stelle
 * betrifft, die der Haupt-Lauf NICHT gemeldet hat:
 *
 *   - gleiche stabile ID (Section + normalisiertes Zitat) → Duplikat, skip
 *   - Zitate in derselben Section, die sich gegenseitig (normalisiert)
 *     enthalten → dieselbe Stelle, nur anders geschnitten → skip
 *
 * Damit erzwingt die Architektur die Vollständigkeit von Runde 1, ohne
 * doppelte Karten für dieselbe Textstelle zu produzieren.
 */
export function mergeViolationSets(
  primary: Violation[],
  recall: Violation[],
): Violation[] {
  const merged = [...primary];
  const seenIds = new Set(primary.map((v) => v.id));

  for (const candidate of recall) {
    if (seenIds.has(candidate.id)) continue;
    const cQuote = normalize(candidate.quote);
    if (cQuote.length === 0) continue;
    const overlaps = merged.some((existing) => {
      if (existing.section !== candidate.section) return false;
      const eQuote = normalize(existing.quote);
      if (eQuote.length === 0) return false;
      return eQuote.includes(cQuote) || cQuote.includes(eQuote);
    });
    if (overlaps) continue;
    merged.push(candidate);
    seenIds.add(candidate.id);
  }

  return merged;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
