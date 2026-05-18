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

/**
 * Konkretheits-Probes — 3. Prüfdimension neben Pflichtbausteine +
 * Violations. Adressiert Victorias 2026-05-06-Feedback: Strukturprüfung
 * sagt „6/6 OK", aber das WO und ALS WAS fehlt (Bewerbungen-Wohin,
 * Anstellung-Welche-Position, Bewerbungsunterlagen-überarbeitet-ja-nein).
 *
 * Format ist „Absence-Detection mit Kontext-Awareness": die KI gibt
 * pro Probe drei mögliche Antworten zurück. „not_relevant" mit
 * Begründung verhindert False-Positives bei Use-Cases wo die Probe
 * nicht passt (z.B. TN wird selbstständig → Bewerbungs-Probes
 * irrelevant).
 *
 * Initial-Set deckt EKC/Karrierecoaching ab. Wird in späteren
 * Stufen pro Maßnahmetyp gezielt erweitert (siehe Memory
 * `project_checker_prompt_plan` + `project_checker_konkretheit`).
 */
export type ProbeAnswer = "yes" | "missing" | "not_relevant";

export type ProbeTopic =
  | "bewerbungsunterlagen"
  | "bewerbungen_konkret"
  | "vorstellungsgespraeche"
  | "methoden_erklaert"
  | "anstellung_konkret"
  | "weiterbildung_zielposition";

export const PROBE_TOPIC_LABELS: Record<ProbeTopic, string> = {
  bewerbungsunterlagen: "Bewerbungsunterlagen überarbeitet?",
  bewerbungen_konkret: "Bewerbungen konkret (Arbeitgeber + Position)?",
  vorstellungsgespraeche: "Vorstellungsgespräche vorbereitet/geübt?",
  methoden_erklaert: "Genannte Methoden in 1 Satz erklärt?",
  anstellung_konkret: "Bei Anstellung: AG + Position konkret?",
  weiterbildung_zielposition: "Bei Weiterbildungs-Empfehlung: Zielposition?",
};

export type ProbeResult = {
  topic: ProbeTopic;
  answer: ProbeAnswer;
  /**
   * Bei `answer === "yes"`: Quote-Snippet aus dem Bericht, das die
   * Probe belegt. Bei `missing`/`not_relevant`: leer.
   */
  quote?: string;
  /**
   * Bei `missing`: was fehlt. Bei `not_relevant`: warum die Probe
   * in diesem Fall nicht passt. Bei `yes`: leer.
   */
  hint?: string;
};

export type CheckerResult = {
  status: "pass" | "needs_revision";
  mustHaves: MustHaveCoverage[];
  violations: Violation[];
  tonalityFeedback?: string;
  /**
   * Optional bei Bestands-Daten — Backwards-Compat für persistierte
   * Results aus der Zeit vor Stage 1. Neue Checks befüllen das Feld
   * immer. Wenn leer/undefined: UI rendert die Sektion nicht.
   */
  konkretheit?: ProbeResult[];
  /**
   * Kurze, ressourcenorientierte Aufzählung was im Bericht schon gut
   * gemacht ist — 1–3 Stichworte. UX-Boost für Coach-Editor (nicht nur
   * Tadel sehen) und Email-Template (positiver Auftakt für die Coach-
   * Mängel-Mail).
   */
  positiveAspects?: string[];
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
  // konkretheit + positiveAspects sind optional (Backwards-Compat mit
  // persistierten Results vor Stage 1). Wenn vorhanden: Form prüfen,
  // sonst silently durchlassen.
  if (v.konkretheit !== undefined && !Array.isArray(v.konkretheit)) {
    return false;
  }
  if (v.positiveAspects !== undefined) {
    if (!Array.isArray(v.positiveAspects)) return false;
    if (v.positiveAspects.some((s) => typeof s !== "string")) return false;
  }
  return true;
}
