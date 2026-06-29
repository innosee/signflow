import {
  CHECKER_SECTIONS,
  MUST_HAVE_LABELS,
  type CheckerInput,
  type CheckerResult,
  type CheckerSection,
  type Violation,
} from "./types";

/**
 * Deterministische „inhaltliche Hinweise" — ergänzen die modell-basierten
 * Soft-Flags (verbotene Formulierungen) um Inhalts-/Qualitäts-Nudges, die das
 * Modell bewusst NICHT liefert: zu dünne Abschnitte, umgangssprachliche
 * Floskeln, fehlende Pflichtbausteine. Rein client-seitig aus Input + Result
 * abgeleitet (keine KI, kein externer Verarbeiter), als `structural`-Violations
 * mit stabiler ID — integrieren sich so in Fortschritt/„Erledigt"/„Passt schon"
 * + Reload-Persistenz wie echte Hinweise.
 */

/** Abschnitt gilt als „knapp", wenn er Inhalt hat, aber < dieser Wortzahl. */
const THIN_WORD_THRESHOLD = 15;

/** Max. Floskel-Hinweise insgesamt — kein Spam bei sehr saloppem Text. */
const MAX_FLOSKEL_HINTS = 3;

/**
 * Umgangssprachliche/floskelhafte Wendungen, die nicht in einen AfA-Bericht
 * gehören. Bewusst konservativ + eindeutig, um False-Positives zu vermeiden.
 */
const FLOSKELN = [
  "war cool",
  "wird schon",
  "passt schon",
  "läuft",
  "alles gut",
  "mega",
  "krass",
  "voll gut",
  "easy",
  "kein ding",
  "kein problem",
  "no problem",
  "geil",
  "top",
  "läuft bei",
];

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

const THIN_ADVICE: Record<CheckerSection, string> = {
  teilnahme:
    "Ergänze, wie der Teilnehmende mitgearbeitet hat — Engagement, Eigeninitiative, Zuverlässigkeit, persönliche Stärken/Interessen.",
  ablauf:
    "Ergänze die konkreten Inhalte und Methoden, die im Coaching bearbeitet wurden — möglichst chronologisch und benannt (Tipp: „Aus Terminen vorbefüllen“).",
  fazit:
    "Ergänze das Fazit: erreichte Ergebnisse, eine Empfehlung und — bei Gründung — die konkrete Gründungsperspektive.",
};

function structural(
  over: Pick<Violation, "id" | "section" | "rule" | "suggestion">,
): Violation {
  return {
    category: "bewertung", // für structural irrelevant (Badge zeigt `rule`)
    severity: "soft_flag",
    quote: "",
    structural: true,
    ...over,
  };
}

export function buildAdvisoryHints(
  input: CheckerInput,
  result: CheckerResult,
): Violation[] {
  const hints: Violation[] = [];

  // 1) Zu dünne Abschnitte (mit Inhalt, aber sehr knapp). Leere Abschnitte
  //    deckt die Pflichtbausteine-/Vollständigkeitslogik ab.
  for (const section of CHECKER_SECTIONS) {
    const wc = wordCount(input[section.id]);
    if (wc > 0 && wc < THIN_WORD_THRESHOLD) {
      hints.push(
        structural({
          id: `hint::thin::${section.id}`,
          section: section.id,
          rule: "Abschnitt zu knapp",
          suggestion: `Der Abschnitt „${section.label}" ist mit ${wc} ${wc === 1 ? "Wort" : "Wörtern"} sehr knapp. ${THIN_ADVICE[section.id]}`,
        }),
      );
    }
  }

  // 2) Umgangssprachliche Floskeln (eindeutige Wendungen).
  let floskelCount = 0;
  for (const section of CHECKER_SECTIONS) {
    if (floskelCount >= MAX_FLOSKEL_HINTS) break;
    const haystack = input[section.id].toLowerCase();
    for (const phrase of FLOSKELN) {
      if (floskelCount >= MAX_FLOSKEL_HINTS) break;
      // Phrasen sind reine Wörter/Leerzeichen → kein Escaping nötig; Wort-
      // grenzen verhindern Teiltreffer (z.B. „top" in „Laptop").
      const re = new RegExp(`\\b${phrase}\\b`);
      if (re.test(haystack)) {
        hints.push(
          structural({
            id: `hint::floskel::${section.id}::${phrase.replace(/\s+/g, "_")}`,
            section: section.id,
            rule: "Umgangssprachlich",
            suggestion: `Die Formulierung „${phrase}" ist umgangssprachlich und gehört nicht in einen AfA-Bericht — bitte sachlich/professionell formulieren.`,
          }),
        );
        floskelCount++;
      }
    }
  }

  // 3) Fehlende Pflichtbausteine als aktionable Hinweis-Cards.
  for (const m of result.mustHaves) {
    if (m.covered) continue;
    hints.push(
      structural({
        id: `hint::musthave::${m.topic}`,
        section: "ablauf",
        rule: "Pflichtbaustein fehlt",
        suggestion: `„${MUST_HAVE_LABELS[m.topic]}" ist im Bericht noch nicht erkennbar.${m.hint ? ` ${m.hint}` : ""} Ergänze einen Satz dazu.`,
      }),
    );
  }

  return hints;
}

/** Result um die deterministischen Hinweise erweitern — NUR fürs Rendering. */
export function withAdvisoryHints(
  result: CheckerResult,
  input: CheckerInput,
): CheckerResult {
  return {
    ...result,
    violations: [...result.violations, ...buildAdvisoryHints(input, result)],
  };
}
