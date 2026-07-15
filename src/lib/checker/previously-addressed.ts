import type {
  CheckerInput,
  CheckerResult,
  CheckerSection,
  Violation,
} from "./types";

/**
 * Inhaltsstabile ID einer Violation — `section::normalisiertes Zitat`. Anders
 * als ein positionsbasierter Index (`azure_0`, `azure_1`, …) bleibt diese ID
 * über Re-Checks hinweg gleich, solange Stelle + Zitat gleich sind. Dadurch
 * überlebt der „erledigt"/„weggeklickt"-State (acceptedIds, dismissReasons)
 * einen Re-Check, statt zurückgesetzt werden zu müssen.
 */
export function stableViolationId(
  section: CheckerSection,
  quote: string,
): string {
  return `${section}::${normalize(quote)}`;
}

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

/**
 * Konvergenz-Regel gegen die „endlose Anpassungsrunden"-Schleife
 * (Miriam-Feedback 2026-07-15): Ein Re-Check darf nur bemängeln, was
 *   (a) die vorherige Prüfung schon gemeldet hat (gleiche stabile ID —
 *       bekanntes, noch offenes Finding), ODER
 *   (b) in Text liegt, der sich seit der letzten Prüfung geändert hat.
 *
 * Ein soft_flag zu unverändertem, bereits geprüftem Text, das die Vorrunde
 * NICHT gemeldet hat, ist ein „Nachschieber": der Prompt deckelt Findings
 * (max 5 / 2 soft), nach jeder Korrektur rückt die nächst-schwächere Ebene
 * nach. Solche Findings werden als `carriedOver` markiert — die Sidebar
 * behandelt sie wie `previouslyAddressed` als erledigt (Klappblock), damit
 * der Coach nach dem Übernehmen der Vorschläge tatsächlich „grün" sieht.
 *
 * Bewusst NIE unterdrückt:
 *   - hard_blocks (Art-9/Gesundheit) — Datenschutz schlägt Komfort; auch
 *     wenn die Vorrunde sie verpasst hat, müssen sie erscheinen.
 *   - Findings, deren Quote im Vorrunden-Text nicht vorkommt — der Text
 *     ist neu/geändert, das Finding ist legitim.
 *   - Quotes < 10 Zeichen — zu kurz für einen sicheren Substring-Match
 *     (gleiche Schwelle wie `markPreviouslyAddressed`).
 *
 * Erster Check (`prevInput === null`): nichts wird markiert.
 */
export function markCarriedOver(
  result: CheckerResult,
  prevInput: CheckerInput | null,
  prevIds: ReadonlySet<string> | null,
): CheckerResult {
  if (!prevInput || !prevIds) return result;

  // Vorrunden-Text pro Section einmal normalisieren (nicht pro Violation).
  const prevBySection: Record<CheckerSection, string> = {
    teilnahme: normalize(prevInput.teilnahme),
    ablauf: normalize(prevInput.ablauf),
    fazit: normalize(prevInput.fazit),
  };

  const violations: Violation[] = result.violations.map((v) => {
    if (v.severity === "hard_block") return v;
    if (v.previouslyAddressed || v.carriedOver) return v;
    if (prevIds.has(v.id)) return v; // bekanntes Finding — bleibt offen
    const normalQuote = normalize(v.quote);
    if (normalQuote.length < 10) return v;
    return prevBySection[v.section].includes(normalQuote)
      ? { ...v, carriedOver: true }
      : v;
  });

  return { ...result, violations };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
