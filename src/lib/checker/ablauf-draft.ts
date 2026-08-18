import type { MassnahmeTyp } from "./types";

/**
 * Deterministischer Entwurf für das BER-Feld „Ablauf, Inhalte des Coachings".
 * Nimmt EXAKT die vom Coach eingetragenen Termin-Themen — KEINE KI, kein
 * externer Verarbeiter, nichts Erfundenes. Bewusst nüchtern: der Coach
 * poliert den Entwurf danach selbst. Faithful > schön, weil der Bericht
 * abbilden muss, was tatsächlich passiert ist (AfA-Compliance).
 *
 * Bewusst NUR für dieses eine Feld: `teilnahme` (wie der TN mitarbeitet) und
 * `fazit` (Bewertung/Empfehlung) lassen sich nicht aus Termin-Themen ableiten.
 */

export type AblaufDraftSession = {
  topic: string;
  isErstgespraech: boolean;
};

const INTRO: Record<MassnahmeTyp, string> = {
  EKC: "Im Rahmen des Karriere-Coachings",
  ESC: "Im Rahmen des systemischen Coachings",
  EGC: "Im Rahmen des Gründungs-Coachings",
  ESCA: "Im Rahmen des Ausbildungs-Coachings",
};

export function buildAblaufDraft(
  sessions: readonly AblaufDraftSession[],
  massnahmeTyp: MassnahmeTyp,
): string {
  const intro = INTRO[massnahmeTyp];
  const hasErstgespraech = sessions.some((s) => s.isErstgespraech);

  const regular = sessions.filter((s) => !s.isErstgespraech);
  // Themen in chronologischer Reihenfolge, dedupliziert (gleiches Thema an
  // mehreren Terminen → einmal nennen), Endinterpunktion vereinheitlicht.
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const s of regular) {
    const t = s.topic.trim().replace(/[.;]+$/, "");
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(t);
  }

  const erstPart = hasErstgespraech
    ? " Den Auftakt bildete das Erstgespräch inklusive Eignungsanalyse."
    : "";
  const closePart =
    " Die einzelnen Termine mit Datum und Unterrichtseinheiten sind im Anwesenheitsnachweis dokumentiert.";

  if (topics.length === 0) {
    return `${intro} wurden die vereinbarten Inhalte bearbeitet.${erstPart}${closePart}`;
  }

  const terminWort = regular.length === 1 ? "Termin" : "Termine";
  return `${intro} wurden über ${regular.length} ${terminWort} folgende Inhalte erarbeitet: ${topics.join("; ")}.${erstPart}${closePart}`;
}
