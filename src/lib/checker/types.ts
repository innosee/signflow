export type CheckerSection = "teilnahme" | "ablauf" | "fazit";

export const CHECKER_SECTIONS: {
  id: CheckerSection;
  label: string;
  placeholder: string;
}[] = [
  {
    id: "teilnahme",
    label: "Teilnahme und Mitarbeit / persönliche Interessen und Stärken",
    placeholder: `Beispiel: Frau H. nahm aktiv, kontinuierlich und engagiert am Coaching teil. Sie brachte eigene Fragestellungen ein und arbeitete reflektiert an den vereinbarten Inhalten …`,
  },
  {
    id: "ablauf",
    label: "Ablauf, Inhalte des Coachings / erarbeitete Konzepte und Strategien",
    placeholder: `Beispiel: Ziel des Coachings war die inhaltliche und strategische Klärung des Angebots, die Definition der Zielgruppe sowie die Vorbereitung der selbständigen Tätigkeit …`,
  },
  {
    id: "fazit",
    label: "Fazit, Ergebnisse, Empfehlungen, Gründungsperspektive",
    placeholder: `Beispiel: Das Coaching führte zu einer realistischen, gut vorbereiteten und nachhaltigen Ausrichtung der geplanten Selbständigkeit …`,
  },
];

export type CheckerInput = {
  teilnahme: string;
  ablauf: string;
  fazit: string;
};

/**
 * Type-Guard für storage-persistierte Werte (localStorage / sessionStorage).
 * Verhindert, dass manipuliertes oder altformatiges JSON die Form crasht.
 */
export function isCheckerInput(value: unknown): value is CheckerInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.teilnahme === "string" &&
    typeof v.ablauf === "string" &&
    typeof v.fazit === "string"
  );
}

export type MustHaveTopic =
  | "profiling"
  | "zielarbeit"
  | "strategie"
  | "umsetzung"
  | "marktorientierung"
  | "prozessbegleitung";

export const MUST_HAVE_LABELS: Record<MustHaveTopic, string> = {
  profiling: "Profiling / Potentialanalyse / Standortbestimmung",
  zielarbeit: "Zielarbeit (berufliche Wünsche + Ziele)",
  strategie: "Strategie + Handlungsperspektiven",
  umsetzung: "Umsetzung (Unterlagen, Selbstmarketing)",
  marktorientierung: "Marktorientierung + Netzwerke",
  prozessbegleitung: "Prozessbegleitung + Feedback",
};

export type MustHaveCoverage = {
  topic: MustHaveTopic;
  covered: boolean;
  hint?: string;
};

export type ViolationCategory =
  | "medizin"
  | "diagnostik"
  | "juristisch"
  | "pathologisierung"
  | "bewertung"
  | "prognose"
  | "kuechenpsychologie";

export const VIOLATION_CATEGORY_LABELS: Record<ViolationCategory, string> = {
  medizin: "Medizin / Psyche",
  diagnostik: "Diagnostik",
  juristisch: "Juristische Wertung",
  pathologisierung: "Pathologisierung",
  bewertung: "Charakter-Bewertung",
  prognose: "Negative Prognose",
  kuechenpsychologie: "Küchenpsychologie",
};

export type Violation = {
  id: string;
  category: ViolationCategory;
  severity: "hard_block" | "soft_flag";
  section: CheckerSection;
  quote: string;
  rule: string;
  suggestion: string;
  /**
   * True wenn diese Violation auf einer schon übernommenen Umformulierung
   * sitzt (Coach hat „Im Text übernehmen" geklickt, das LLM mäkelt aber
   * beim Re-Check nochmal). Wird clientseitig nach `runCheck` markiert,
   * kommt nicht von Azure. Visuell als „schon übernommen"-Badge gerendert.
   */
  previouslyAddressed?: boolean;
};

export type CheckerResult = {
  status: "pass" | "needs_revision";
  mustHaves: MustHaveCoverage[];
  violations: Violation[];
  tonalityFeedback?: string;
};

/**
 * Type-Guard für storage-persistierte CheckerResult-Werte. Schützt vor
 * altformatigen oder manuell manipulierten localStorage-Einträgen.
 */
export function isCheckerResult(value: unknown): value is CheckerResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.status !== "pass" && v.status !== "needs_revision") return false;
  if (!Array.isArray(v.mustHaves)) return false;
  if (!Array.isArray(v.violations)) return false;
  if (
    v.tonalityFeedback !== undefined &&
    typeof v.tonalityFeedback !== "string"
  ) {
    return false;
  }
  return true;
}
