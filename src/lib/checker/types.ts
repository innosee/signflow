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

/**
 * Maßnahmetyp — steuert seit Stage 2 die Pflichtbaustein-Liste sowie die
 * Sprache der Prompt-Sektion C. EKC/ESC teilen das klassische 6-Baustein-
 * Set (Karriere-/Standortbestimmungs-Coachings), EGC adressiert Gründungs-
 * Coachings und ESCA die ausbildungs-spezifischen Anteile.
 *
 * Default ist `EKC`, weil das die historische Standard-Maßnahme ist und
 * persistierte Snapshots vor Stage 2 keine Typ-Information mitführen.
 */
export type MassnahmeTyp = "EKC" | "ESC" | "EGC" | "ESCA";

export const MASSNAHME_TYPEN: { id: MassnahmeTyp; label: string; hint: string }[] = [
  {
    id: "EKC",
    label: "EKC — Erango Karriere-Coaching",
    hint: "Klassisches Karriere-Coaching (Standort/Ziele/Strategie/Markt)",
  },
  {
    id: "ESC",
    label: "ESC — Erango Standort-Coaching",
    hint: "Standortbestimmungs-Coaching (gleiches Baustein-Set wie EKC)",
  },
  {
    id: "EGC",
    label: "EGC — Erango Gründungs-Coaching",
    hint: "Gründungs-Coaching (Idee/Plan/Markt/Finanzierung/Recht)",
  },
  {
    id: "ESCA",
    label: "ESCA — Erango Ausbildungs-Coaching",
    hint: "Ausbildungs-/Auszubildenden-Coaching",
  },
];

export const DEFAULT_MASSNAHME_TYP: MassnahmeTyp = "EKC";

function isMassnahmeTyp(value: unknown): value is MassnahmeTyp {
  return (
    value === "EKC" || value === "ESC" || value === "EGC" || value === "ESCA"
  );
}

export type CheckerInput = {
  teilnahme: string;
  ablauf: string;
  fazit: string;
  /**
   * Optional aus Backwards-Compat-Gründen — persistierte Snapshots vor
   * Stage 2 haben kein Feld. Aufrufer normalisieren via
   * `resolveMassnahmeTyp()` auf `DEFAULT_MASSNAHME_TYP`.
   */
  massnahmeTyp?: MassnahmeTyp;
};

export function resolveMassnahmeTyp(
  value: MassnahmeTyp | undefined | null,
): MassnahmeTyp {
  return isMassnahmeTyp(value) ? value : DEFAULT_MASSNAHME_TYP;
}

/**
 * Type-Guard für storage-persistierte Werte (localStorage / sessionStorage).
 * Verhindert, dass manipuliertes oder altformatiges JSON die Form crasht.
 *
 * `massnahmeTyp` ist optional — pre-Stage-2-Drafts/Snapshots dürfen
 * weiterhin durchgelassen werden.
 */
export function isCheckerInput(value: unknown): value is CheckerInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.teilnahme !== "string" ||
    typeof v.ablauf !== "string" ||
    typeof v.fazit !== "string"
  ) {
    return false;
  }
  if (v.massnahmeTyp !== undefined && !isMassnahmeTyp(v.massnahmeTyp)) {
    return false;
  }
  return true;
}

/**
 * Pflichtbausteine quer über alle Maßnahmetypen. Pro Maßnahme wird nur
 * ein Teilset erwartet (siehe `MUST_HAVES_BY_MASSNAHMETYP`) — Azure
 * bekommt im Prompt immer nur das passende Subset zu sehen.
 */
export type MustHaveTopic =
  // EKC + ESC (klassisches Karriere-/Standort-Set)
  | "profiling"
  | "zielarbeit"
  | "strategie"
  | "umsetzung"
  | "marktorientierung"
  | "prozessbegleitung"
  // EGC (Gründungs-Coaching)
  | "egc_persoenlichkeit"
  | "egc_idee_analyse"
  | "egc_businessplan"
  | "egc_marketing"
  | "egc_infrastruktur"
  | "egc_finanzierung"
  | "egc_absicherung"
  | "egc_recht"
  | "egc_individualitaet"
  // ESCA (Ausbildungs-Coaching)
  | "esca_analyse"
  | "esca_planung"
  | "esca_strategie"
  | "esca_begleitung"
  | "esca_problemloesung"
  | "esca_entwicklung"
  | "esca_reflexion";

export const MUST_HAVE_LABELS: Record<MustHaveTopic, string> = {
  // EKC + ESC
  profiling: "Profiling / Potentialanalyse / Standortbestimmung",
  zielarbeit: "Zielarbeit (berufliche Wünsche + Ziele)",
  strategie: "Strategie + Handlungsperspektiven",
  umsetzung: "Umsetzung (Unterlagen, Selbstmarketing)",
  marktorientierung: "Marktorientierung + Netzwerke",
  prozessbegleitung: "Prozessbegleitung + Feedback",
  // EGC
  egc_persoenlichkeit: "Persönlichkeit / Eignung für Selbständigkeit",
  egc_idee_analyse: "Geschäfts-Idee + Analyse",
  egc_businessplan: "Businessplan / Markt-Einschätzung",
  egc_marketing: "Marketing + Vertrieb",
  egc_infrastruktur: "Infrastruktur + Netzwerk",
  egc_finanzierung: "Finanzierung + Tragfähigkeit",
  egc_absicherung: "Soziale Absicherung",
  egc_recht: "Recht + Formalien",
  egc_individualitaet: "Individualität der Beratung",
  // ESCA
  esca_analyse: "Analyse + Start in die Maßnahme",
  esca_planung: "Planung der Ausbildung",
  esca_strategie: "Strategie für den Ausbildungs-Weg",
  esca_begleitung: "Begleitung im Prozess",
  esca_problemloesung: "Problemlösung in akuten Situationen",
  esca_entwicklung: "Entwicklung von Kompetenzen",
  esca_reflexion: "Reflexion + Lerntransfer",
};

/**
 * Welche Pflichtbausteine sind pro Maßnahmetyp zu prüfen? Wird sowohl
 * für den Prompt (Sektion C — was Azure überhaupt fragt) als auch für
 * die Azure-Antwort-Validierung verwendet (unbekannte Topics für den
 * aktiven Typ werden verworfen).
 */
export const MUST_HAVES_BY_MASSNAHMETYP: Record<MassnahmeTyp, MustHaveTopic[]> = {
  EKC: [
    "profiling",
    "zielarbeit",
    "strategie",
    "umsetzung",
    "marktorientierung",
    "prozessbegleitung",
  ],
  ESC: [
    "profiling",
    "zielarbeit",
    "strategie",
    "umsetzung",
    "marktorientierung",
    "prozessbegleitung",
  ],
  EGC: [
    "egc_persoenlichkeit",
    "egc_idee_analyse",
    "egc_businessplan",
    "egc_marketing",
    "egc_infrastruktur",
    "egc_finanzierung",
    "egc_absicherung",
    "egc_recht",
    "egc_individualitaet",
  ],
  ESCA: [
    "esca_analyse",
    "esca_planung",
    "esca_strategie",
    "esca_begleitung",
    "esca_problemloesung",
    "esca_entwicklung",
    "esca_reflexion",
  ],
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
  /**
   * True wenn diese Stelle in unverändertem, bereits geprüftem Text liegt,
   * die vorherige Prüfung sie aber NICHT gemeldet hat. Das ist der
   * „Nachschieber"-Effekt: der Prompt deckelt Findings (max 5 / 2 soft),
   * nach jeder Korrektur rückt die nächst-schwächere Ebene nach — für den
   * Coach wirkt das wie eine endlose Schleife. Konvergenz-Regel: Was die
   * letzte Prüfung im selben Text nicht bemängelt hat, gilt als erledigt
   * (Klappblock), nicht als offen. Nur soft_flags — hard_blocks (Art-9/
   * Gesundheit) erscheinen IMMER, egal was die Vorrunde sagte. Wird
   * clientseitig nach `runCheck` gesetzt, kommt nicht von Azure.
   */
  carriedOver?: boolean;
  /**
   * True für deterministisch erzeugte „inhaltliche Hinweise" (zu dünner/
   * floskelhafter Abschnitt, fehlender Pflichtbaustein) — NICHT vom Modell,
   * sondern client-seitig aus Input + Result abgeleitet (siehe
   * `buildAdvisoryHints`). Kein Zitat/keine Auto-Übernahme: die Card zeigt
   * nur die Empfehlung + „Passt schon". `rule` dient als Badge-Text.
   */
  structural?: boolean;
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

/**
 * Maßnahme-Inhalts-Konsistenz (Stage 2.1). Adressiert Victorias
 * Beobachtung, dass Coaches die Maßnahmen-Inhalte oft mischen — z.B.
 * EKC (Karriere-Coaching) ausgewählt, aber überwiegend Gründungs-
 * Themen bearbeitet. Der Checker erkennt das jetzt explizit und
 * meldet einen Mismatch.
 *
 * `detected=false` → leer in der UI (kein Lärm bei sauberen Berichten).
 * `detected=true` → prominentes Banner oben in BT-Form + Coach-Sidebar,
 * Mail beginnt mit der Mismatch-Warnung VOR den positiven Aspekten.
 */
export type MassnahmeMismatch = {
  detected: boolean;
  /**
   * Bei `detected=true`: konkreter Hinweis welche Themen aus welcher
   * anderen Maßnahme der Bericht beschreibt + Vorschlag (anderen Typ
   * wählen ODER Bericht-Inhalt umstellen). Bei `false` leer.
   */
  hint: string;
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
  /**
   * Maßnahme-Inhalts-Mismatch — Stage 2.1. Optional aus Backwards-Compat
   * mit Snapshots vor Stage 2.1; wenn vorhanden + detected=true rendert
   * die UI ein prominentes Warnbanner.
   */
  massnahmeMismatch?: MassnahmeMismatch;
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
  if (v.massnahmeMismatch !== undefined) {
    const m = v.massnahmeMismatch;
    if (!m || typeof m !== "object") return false;
    const mr = m as Record<string, unknown>;
    if (typeof mr.detected !== "boolean") return false;
    if (typeof mr.hint !== "string") return false;
  }
  return true;
}
