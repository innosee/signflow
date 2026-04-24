const PATTERNS = [
  { type: "EMAIL", re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { type: "IBAN", re: /\b[A-Z]{2}\d{2}(?:\s?\d{4}){4,7}\s?\d{1,4}\b/g },
  { type: "TEL", re: /(?<!\d)(?:\+49|0)[\s\-/]?\d{2,5}[\s\-/]?\d{3,}[\s\-/]?\d{0,}/g },
  { type: "KUNDEN_NR", re: /\b\d{3}[A-Z]\d{6}_\d+\b/g },
  { type: "DATUM", re: /\b(?:\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g },
  { type: "PLZ", re: /(?<!\d)\d{5}(?!\d)/g },
];

/**
 * Wendet Regex-Pseudonymisierung auf einen Text-Block an.
 *
 * Teilt einen gemeinsamen Zustand (entities, counters) mit anderen Sections —
 * dadurch bekommt dieselbe E-Mail/IBAN in "teilnahme" und "ablauf" denselben
 * Platzhalter, und Placeholder-Nummern laufen global durch.
 */
export function applyRegexStage(text, state) {
  let result = text;
  for (const { type, re } of PATTERNS) {
    result = result.replace(re, (match) => {
      const existing = state.originalToPlaceholder.get(match);
      if (existing) return existing;
      const next = (state.counters.get(type) ?? 0) + 1;
      state.counters.set(type, next);
      const placeholder = `[${type}_${next}]`;
      state.originalToPlaceholder.set(match, placeholder);
      state.entities.push({ type, original: match, placeholder });
      return placeholder;
    });
  }
  return result;
}

export function createAnonState() {
  return {
    counters: new Map(),
    originalToPlaceholder: new Map(),
    entities: [],
  };
}
