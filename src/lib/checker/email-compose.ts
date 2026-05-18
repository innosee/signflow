import {
  CHECKER_SECTIONS,
  MUST_HAVE_LABELS,
  VIOLATION_CATEGORY_LABELS,
  type CheckerResult,
  type CheckerSection,
  type Violation,
} from "./types";

const SECTION_LABEL: Record<CheckerSection, string> = Object.fromEntries(
  CHECKER_SECTIONS.map((s) => [s.id, s.label]),
) as Record<CheckerSection, string>;

export type EmailComposerInput = {
  /** Optional — wird in der Anrede genutzt. Leer = generische Anrede. */
  coachName: string;
  /** Optional — wird in der Einleitung referenziert. Leer = generische Einleitung. */
  tnKuerzel: string;
  /** Optional — Unterschrift unter der Email. */
  btName: string;
  /** Vollständiges Check-Ergebnis. */
  result: CheckerResult;
};

/**
 * Komponiert einen versandfertigen Email-Body aus den Findings eines
 * BT-Checker-Laufs. Format orientiert sich an Victorias bestehenden
 * Mängel-Mails: kurze Anrede, durchnummerierte Hinweise mit Zitat +
 * FEEDBACK-Block, knapper Schlusssatz, Signatur.
 *
 * **Bewusst plain-text:** der BT pastet das Ergebnis in Outlook/Gmail/
 * Apple Mail — HTML-Formatierung würde dort meist eh entstellt.
 * Einrückungen mit 4 Spaces statt Tabs, damit gängige Email-Clients
 * sie nicht zerlegen.
 *
 * **Nicht enthalten:** Anhänge, optisches Branding, Reply-Header. Wer
 * darüber will, baut sich das im Mail-Client selber drumherum.
 */
export function composeBtFeedbackEmail(params: EmailComposerInput): string {
  const { coachName, tnKuerzel, btName, result } = params;
  const lines: string[] = [];

  const greeting = coachName.trim().length > 0
    ? `Liebe${endsWithUmlautA(coachName.trim()) ? "" : "r"} ${coachName.trim().split(/\s+/)[0]},`
    : "Hallo,";
  lines.push(greeting);
  lines.push("");

  const tnRef = tnKuerzel.trim().length > 0
    ? `für den Bericht ${tnKuerzel.trim()}`
    : "beim Bericht";
  lines.push(`vielen Dank für den Abschlussbericht. ${capitalize(tnRef)} sind mir folgende Punkte aufgefallen:`);
  lines.push("");

  // Violations: nach Sektion gruppiert, hard_block zuerst, soft_flag danach.
  const ordered = [...result.violations].sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "hard_block" ? -1 : 1;
    }
    // Innerhalb gleicher Severity nach Sektions-Reihenfolge sortieren.
    const sectionOrder = ["teilnahme", "ablauf", "fazit"] as const;
    return sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section);
  });

  ordered.forEach((v, i) => {
    lines.push(`${i + 1}. Im Abschnitt „${SECTION_LABEL[v.section]}":`);
    lines.push("");
    lines.push(`    Zitat: „${v.quote.trim()}"`);
    lines.push("");
    lines.push(`    FEEDBACK: ${renderFeedback(v)}`);
    lines.push("");
  });

  // Fehlende Pflichtbausteine als Sammel-Hinweis am Ende — pro
  // einzelne Aufzählung würde die Mail unnötig lang werden.
  const missing = result.mustHaves.filter((m) => !m.covered);
  if (missing.length > 0) {
    lines.push(
      `Außerdem fehl${missing.length === 1 ? "t" : "en"} noch ${missing.length === 1 ? "ein Pflichtbaustein" : "folgende Pflichtbausteine"}:`,
    );
    lines.push("");
    missing.forEach((m) => {
      lines.push(`    - ${MUST_HAVE_LABELS[m.topic]}${m.hint ? ` (${m.hint})` : ""}`);
    });
    lines.push("");
  }

  if (result.tonalityFeedback) {
    lines.push(`Tonalität / Stil-Hinweis: ${result.tonalityFeedback}`);
    lines.push("");
  }

  if (ordered.length === 0 && missing.length === 0 && !result.tonalityFeedback) {
    lines.push(
      "Aus Sicht des Checkers passt der Bericht inhaltlich und formal — danke für die saubere Ausarbeitung!",
    );
    lines.push("");
  } else {
    lines.push(
      "Bitte überarbeite den Bericht und schick ihn mir zeitnah zurück.",
    );
    lines.push("");
  }

  lines.push("Liebe Grüße");
  if (btName.trim().length > 0) {
    lines.push(btName.trim());
  }

  return lines.join("\n");
}

/**
 * Variante für eine EINZELNE Violation — Coach soll auch ein einzelnes
 * Finding in eine bestehende Mail-Konversation einfügen können, ohne
 * den ganzen Email-Body zu kopieren.
 */
export function composeSingleFinding(v: Violation): string {
  return [
    `Im Abschnitt „${SECTION_LABEL[v.section]}":`,
    "",
    `Zitat: „${v.quote.trim()}"`,
    "",
    `FEEDBACK: ${renderFeedback(v)}`,
  ].join("\n");
}

function renderFeedback(v: Violation): string {
  const categoryLabel = VIOLATION_CATEGORY_LABELS[v.category];
  // `rule` ist die Regelbegründung vom Checker, `suggestion` der
  // Umformulierungs-Vorschlag. Wenn beides da ist, zeigen wir beides;
  // Severity-Hinweis spezifisch nur bei hard_block (sonst wirkt es
  // schroffer als nötig).
  const parts: string[] = [];
  if (v.severity === "hard_block") {
    parts.push(`Verstoß (${categoryLabel}): ${v.rule}`);
  } else {
    parts.push(`Hinweis (${categoryLabel}): ${v.rule}`);
  }
  if (v.suggestion && v.suggestion.trim().length > 0) {
    parts.push(`Bitte umformulieren in Richtung: „${v.suggestion.trim()}"`);
  }
  return parts.join(" ");
}

function endsWithUmlautA(name: string): boolean {
  // Sehr grobe Heuristik zur „Liebe X" vs. „Lieber X"-Anrede: endet
  // der Vorname auf typische weibliche Endungen, kein "r" anhängen.
  // Bewusst konservativ — bei Unsicherheit dem User-Tipp folgen, dass
  // er die Anrede einfach manuell korrigiert.
  const first = name.split(/\s+/)[0]?.toLowerCase() ?? "";
  return /(a|e|i|y|ia|tte|ine|line|na)$/.test(first);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
