import type { CheckerInput, CheckerSection } from "./types";

type HeaderPattern = {
  id: CheckerSection;
  pattern: RegExp;
};

const HEADERS: HeaderPattern[] = [
  { id: "teilnahme", pattern: /Teilnahme\s+und\s+Mitarbeit[^:\n]{0,120}:/i },
  { id: "ablauf", pattern: /Ablauf,?\s*Inhalte[^:\n]{0,120}:/i },
  { id: "fazit", pattern: /Fazit\s*,[^:\n]{0,120}:/i },
];

const NOISE_PATTERNS: RegExp[] = [
  /Seite\s+\d+\s+von\s+\d+/gi,
  /\bF\s*\d{2}-?\d*\b/g,
  /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g,
  /(Ekkehardstraße|Erzbergerstraße)\s+\d+\w?/gi,
  /\bD-\d{5}\b\s*\w*/g,
  /Tel\.\s*\+\d[\d\s()/-]{5,}/gi,
  /Fax\s*\+\d[\d\s()/-]{5,}/gi,
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,
  /\bwww\.[\w.-]+\.[A-Za-z]{2,}\b/g,
  /→?\s*TN-bezogener\s+Bericht/gi,
  /\bOrt,?\s*Datum\s+Name\s+Coach\b/gi,
  /\bErfolgreiche\s+Gründung:/gi,
  /\bGründung\s+geplant\s+zum:/gi,
  /\bJA\s+NEIN\b/g,
  /\bkeine\s+Fehlzeiten\b/gi,
];

function stripNoise(text: string): string {
  let result = text;
  for (const re of NOISE_PATTERNS) {
    result = result.replace(re, " ");
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

export function splitReport(fullText: string): CheckerInput {
  const positions: { id: CheckerSection; start: number; headerEnd: number }[] =
    [];

  for (const { id, pattern } of HEADERS) {
    const match = pattern.exec(fullText);
    if (match) {
      positions.push({
        id,
        start: match.index,
        headerEnd: match.index + match[0].length,
      });
    }
  }

  positions.sort((a, b) => a.start - b.start);

  const result: CheckerInput = { teilnahme: "", ablauf: "", fazit: "" };

  for (let i = 0; i < positions.length; i++) {
    const current = positions[i];
    const next = positions[i + 1];
    const raw = fullText.slice(
      current.headerEnd,
      next ? next.start : undefined,
    );
    result[current.id] = stripNoise(raw);
  }

  // Wenn mind. ein Header gefunden wurde, aber die erste Section (Teilnahme)
  // vor dem ersten erkannten Header liegt (z.B. fehlende oder OCR-zerstörte
  // Teilnahme-Überschrift), den führenden Text nicht still verwerfen.
  if (positions.length > 0) {
    const firstStart = positions[0].start;
    const lead = fullText.slice(0, firstStart).trim();
    const firstId = positions[0].id;
    if (lead.length > 0 && firstId !== "teilnahme" && !result.teilnahme) {
      result.teilnahme = stripNoise(lead);
    }
  } else if (fullText.trim().length > 0) {
    result.teilnahme = stripNoise(fullText);
  }

  return result;
}
