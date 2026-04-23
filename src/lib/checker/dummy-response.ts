import type {
  CheckerInput,
  CheckerResult,
  MustHaveCoverage,
  MustHaveTopic,
  Violation,
  ViolationCategory,
} from "./types";

type ForbiddenTerm = {
  pattern: RegExp;
  category: ViolationCategory;
  rule: string;
  suggestion: string;
};

const FORBIDDEN_TERMS: ForbiddenTerm[] = [
  {
    pattern: /\b(chronische[rnms]?\s+)?depression(en)?\b/gi,
    category: "medizin",
    rule: "Diagnosen unzulässig",
    suggestion:
      "Der Teilnehmer thematisierte gesundheitliche Einschränkungen, die Auswirkungen auf die aktuelle Belastbarkeit haben.",
  },
  {
    pattern: /\bburnout\b/gi,
    category: "medizin",
    rule: "Diagnosen unzulässig",
    suggestion:
      "Der Teilnehmer thematisierte eine persönliche Belastungssituation, die im Coaching berücksichtigt wurde.",
  },
  {
    pattern: /\btrauma(ta)?\b/gi,
    category: "medizin",
    rule: "Diagnosen unzulässig",
    suggestion: "Persönliche Belastungssituation, die bei der Arbeit berücksichtigt wurde.",
  },
  {
    pattern: /\bAD[H]?S\b/g,
    category: "medizin",
    rule: "Diagnosen unzulässig",
    suggestion: "Persönliche Herausforderung, auf die im Coaching Rücksicht genommen wurde.",
  },
  {
    pattern: /\bpanikattack\w*\b/gi,
    category: "medizin",
    rule: "Diagnosen unzulässig",
    suggestion: "Gesundheitliche Einschränkung, die Auswirkungen auf die Belastbarkeit hatte.",
  },
  {
    pattern: /\barbeits[un]?fähig\w*\b/gi,
    category: "diagnostik",
    rule: "Medizinische Einschätzung unzulässig",
    suggestion:
      "Der Fokus lag auf der schrittweisen Stabilisierung der Leistungsfähigkeit und der Klärung der Rahmenbedingungen.",
  },
  {
    pattern: /\btherapie\s+empfohlen\b/gi,
    category: "diagnostik",
    rule: "Therapieempfehlungen sind nicht Coach-Aufgabe",
    suggestion:
      "Empfohlen wurde die Klärung der gesundheitlichen Rahmenbedingungen vor Aufnahme weiterer beruflicher Schritte.",
  },
  {
    pattern: /\bpsychisch\s+instabil\b/gi,
    category: "pathologisierung",
    rule: "Pathologisierende Wertung unzulässig",
    suggestion:
      "Der Teilnehmer arbeitete an der Stabilisierung der persönlichen Rahmenbedingungen als Grundlage für die berufliche Neuorientierung.",
  },
  {
    pattern: /\bbehandlungsbedürftig\b/gi,
    category: "diagnostik",
    rule: "Medizinische Einschätzung unzulässig",
    suggestion: "— bitte diese Formulierung ersatzlos streichen —",
  },
  {
    pattern: /\bmobbing\b/gi,
    category: "juristisch",
    rule: "Juristische Wertung unzulässig",
    suggestion: "Konfliktbehaftetes Vorbeschäftigungsverhältnis, das reflektiert wurde.",
  },
  {
    pattern: /\bdiskriminierung\b/gi,
    category: "juristisch",
    rule: "Juristische Wertung unzulässig",
    suggestion: "Schwierigkeiten im vorherigen Arbeitsumfeld, die im Coaching thematisiert wurden.",
  },
  {
    pattern: /\bnarzisstisch\w*\b/gi,
    category: "pathologisierung",
    rule: "Pathologisierende Charakterzuschreibung unzulässig",
    suggestion: "— bitte ersatzlos streichen —",
  },
  {
    pattern: /\btoxisch\w*\b/gi,
    category: "pathologisierung",
    rule: "Pathologisierende Wertung unzulässig",
    suggestion: "— bitte ersatzlos streichen —",
  },
  {
    pattern: /\bmanipulativ\w*\b/gi,
    category: "pathologisierung",
    rule: "Charakter-Wertung unzulässig",
    suggestion: "— bitte ersatzlos streichen —",
  },
  {
    pattern: /\b(faul|faulheit|desinteressiert)\w*\b/gi,
    category: "bewertung",
    rule: "Abwertende Charakter-Bewertung unzulässig",
    suggestion:
      "TN benötigt Impulse zur Eigenmotivation — entsprechende Methoden wurden im Coaching eingesetzt.",
  },
  {
    pattern: /\bemotional\s+labil\b/gi,
    category: "bewertung",
    rule: "Pathologisierende Wertung unzulässig",
    suggestion:
      "Herausforderung in der Selbstregulation — entsprechende Impulse zur Stabilisierung wurden gesetzt.",
  },
  {
    pattern: /\b(nicht\s+vermittelbar|unvermittelbar)\b/gi,
    category: "prognose",
    rule: "Negative Prognose unzulässig",
    suggestion: "Integration erfordert eine Anpassung der Suchstrategie und weitere Vertiefung des Profils.",
  },
  {
    pattern: /\bungeeignet\s+für\s+(den\s+)?arbeitsmarkt\b/gi,
    category: "prognose",
    rule: "Negative Prognose unzulässig",
    suggestion: "TN benötigt weitere Unterstützung bei der beruflichen Neuausrichtung.",
  },
  {
    pattern: /\bcoaching\s+war\s+erfolglos\b/gi,
    category: "prognose",
    rule: "Negative Prognose unzulässig",
    suggestion:
      "Im Coaching wurden Grundlagen gelegt; weitere Unterstützung ist für eine nachhaltige Integration empfehlenswert.",
  },
  {
    pattern: /\bträumer\b/gi,
    category: "bewertung",
    rule: "Abwertende Charakter-Bewertung unzulässig",
    suggestion:
      "TN befand sich noch in der Orientierungsphase — gemeinsam wurden realistische Zwischenziele formuliert.",
  },
  {
    pattern: /\bschwere\s+kindheit\b/gi,
    category: "kuechenpsychologie",
    rule: "Persönliche Bewertung des Privatlebens unzulässig",
    suggestion: "— bitte ersatzlos streichen, Coaching-Fokus auf berufliche Ziele lenken —",
  },
];

const MUST_HAVE_KEYWORDS: Record<MustHaveTopic, RegExp> = {
  profiling: /profil(ing|analyse)|potential|potenzial|standortbestimmung|ausgangslage|st(ä|ae)rken\s+und\s+schw(ä|ae)chen/i,
  zielarbeit: /beruflich\w*\s+ziel|zielarbeit|ziele?\s+definier|zielgruppe|berufswünsche|reise(route|plan)/i,
  strategie: /strategie|bewerbungsstrategie|handlungsperspektiv|konzept|geschäftsmodell/i,
  umsetzung: /umsetzung|selbstmarketing|selbstpräsentation|bewerbungsunterlagen|lebenslauf/i,
  marktorientierung: /arbeitsmarkt|netzwerk|marktanalyse|akquise|branche/i,
  prozessbegleitung: /feedback|begleitung|reflexion|problembewältigung|prozessbegleitung/i,
};

export function generateDummyResult(input: CheckerInput): CheckerResult {
  const violations: Violation[] = [];
  const sections: (keyof CheckerInput)[] = ["teilnahme", "ablauf", "fazit"];

  for (const section of sections) {
    const text = input[section];
    if (!text) continue;

    for (const term of FORBIDDEN_TERMS) {
      const re = new RegExp(term.pattern.source, term.pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        const start = Math.max(0, match.index - 30);
        const end = Math.min(text.length, match.index + match[0].length + 50);
        const quote = text.slice(start, end).replace(/\s+/g, " ").trim();
        violations.push({
          id: `v_${section}_${violations.length}_${match.index}`,
          category: term.category,
          severity: "hard_block",
          section,
          quote: (start > 0 ? "… " : "") + quote + (end < text.length ? " …" : ""),
          rule: term.rule,
          suggestion: term.suggestion,
        });
        if (!term.pattern.global) break;
      }
    }
  }

  const combined = [input.teilnahme, input.ablauf, input.fazit].join(" ");
  const mustHaves: MustHaveCoverage[] = (
    Object.keys(MUST_HAVE_KEYWORDS) as MustHaveTopic[]
  ).map((topic) => {
    const covered = MUST_HAVE_KEYWORDS[topic].test(combined);
    return {
      topic,
      covered,
      hint: covered
        ? undefined
        : "Dieser Pflichtbaustein ist im Bericht nicht erkennbar — bitte ergänzen.",
    };
  });

  const hasTonalityIssue = /\b(stur(heit)?|dramatisch|katastrophal|unfähig)\b/i.test(
    combined,
  );
  const tonalityFeedback = hasTonalityIssue
    ? "Der Bericht enthält wertende Sprache. Bitte ressourcenorientiert umformulieren — was wurde erarbeitet, welche Potentiale wurden aktiviert?"
    : undefined;

  const status: CheckerResult["status"] =
    violations.length === 0 && mustHaves.every((m) => m.covered) && !hasTonalityIssue
      ? "pass"
      : "needs_revision";

  return { status, mustHaves, violations, tonalityFeedback };
}

export function countPseudonymisedEntities(input: CheckerInput): number {
  const combined = [input.teilnahme, input.ablauf, input.fazit].join(" ");
  const patterns = [
    /\b[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+\b/g,
    /\b\d{5}\b/g,
    /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g,
    /\b[\w.]+@[\w.]+\.\w+\b/g,
  ];
  let count = 0;
  for (const p of patterns) {
    const matches = combined.match(p);
    if (matches) count += matches.length;
  }
  return count;
}
