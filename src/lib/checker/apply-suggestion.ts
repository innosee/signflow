/**
 * Setzt eine KI-Umformulierung an die Stelle des Zitats ein — mit
 * Naht-Bereinigung: Beginnt die Suggestion mit Wörtern, die unmittelbar
 * vor der Stelle schon im Text stehen (typisch: das Subjekt — „Herr M. " +
 * Suggestion „Herr M. zeigte …"), wird die Wiederholung abgeschnitten.
 * Ohne das entstand beim Übernehmen „Herr M. Herr M. zeigte …"
 * (beobachtet 2026-07-16). Der Prompt verbietet die Doppelung zwar, aber
 * das Modell hält sich nicht zuverlässig daran — deterministisch im Client
 * bereinigen ist die verlässliche Schicht.
 *
 * Vergleich case-insensitiv und tolerant gegen Whitespace am Rand.
 * Bereinigt wird nur, wenn danach noch Text übrig bleibt.
 */
export function applySuggestionToText(
  text: string,
  start: number,
  end: number,
  suggestion: string,
): string {
  const before = text.slice(0, start);
  const after = text.slice(end);

  let sug = suggestion;
  const beforeNorm = before.replace(/\s+$/, "").toLowerCase();
  if (beforeNorm.length > 0) {
    // Längste führende Überlappung suchen (max. 60 Zeichen), an einer
    // Wortgrenze der Suggestion — sonst würde z.B. bei „Er" vs „Erfahrung"
    // mitten im Wort geschnitten.
    const maxLead = Math.min(sug.length, 60);
    for (let k = maxLead; k >= 3; k--) {
      const next = sug[k];
      if (next !== undefined && /\S/.test(next) && /\S/.test(sug[k - 1] ?? "")) {
        continue; // kein Wortende an Position k
      }
      const lead = sug.slice(0, k).replace(/\s+$/, "").toLowerCase();
      if (lead.length < 3) break;
      if (beforeNorm.endsWith(lead)) {
        const rest = sug.slice(k).replace(/^\s+/, "");
        if (rest.length > 0) sug = rest;
        break;
      }
    }
  }

  return before + sug + after;
}
