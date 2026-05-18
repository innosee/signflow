import {
  CHECKER_SECTIONS,
  MUST_HAVE_LABELS,
  PROBE_TOPIC_LABELS,
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

  const firstName = extractFirstName(coachName);
  const greeting =
    firstName.length > 0
      ? `Liebe${endsWithUmlautA(firstName) ? "" : "r"} ${firstName},`
      : "Hallo,";
  lines.push(greeting);
  lines.push("");

  const tnRef = tnKuerzel.trim().length > 0
    ? `für den Bericht ${tnKuerzel.trim()}`
    : "beim Bericht";
  lines.push(`vielen Dank für den Abschlussbericht. ${capitalize(tnRef)} sind mir folgende Punkte aufgefallen:`);
  lines.push("");

  // Maßnahme-Mismatch (Stage 2.1): wenn detected, ganz oben in die Mail
  // setzen — DAS ist der wichtigste Hinweis, weil er den Bericht ggf.
  // konzeptionell in Frage stellt (Coach hat die falsche Maßnahme
  // ausgewählt oder den Bericht inhaltlich am Maßnahmen-Auftrag vorbei
  // geschrieben).
  if (result.massnahmeMismatch?.detected && result.massnahmeMismatch.hint) {
    lines.push("Wichtiger Hinweis vorab — Maßnahme-Inhalts-Mismatch:");
    lines.push("");
    lines.push(`    ${result.massnahmeMismatch.hint}`);
    lines.push("");
  }

  // Positive Aspekte zuerst — gibt der Mail einen wohlwollenden
  // Einstieg, auch wenn Korrekturen folgen.
  const positives = (result.positiveAspects ?? []).filter(
    (s) => s.trim().length > 0,
  );
  if (positives.length > 0) {
    lines.push("Vorab kurz, was schon gut gelaufen ist:");
    lines.push("");
    positives.forEach((p) => {
      lines.push(`    - ${p.trim()}`);
    });
    lines.push("");
  }

  // Konkretheits-Probes mit `not_relevant`-Antwort — Audit-Trail nach oben:
  // zeigt dem Coach, dass der Checker bestimmte Aspekte BEWUSST nicht
  // moniert hat (z.B. Bewerbungs-Probes irrelevant weil TN gründet). Ohne
  // diesen Block wirkt's so als wäre der Bericht ungeprüft durchgewunken.
  // Steht VOR den Findings, damit der Coach den Kontext hat, bevor die
  // Korrekturen kommen.
  const notRelevantProbes = (result.konkretheit ?? []).filter(
    (p) => p.answer === "not_relevant",
  );
  if (notRelevantProbes.length > 0) {
    lines.push(
      "Folgende Aspekte habe ich geprüft und im Kontext dieses Berichts bewusst nicht moniert:",
    );
    lines.push("");
    notRelevantProbes.forEach((p) => {
      const label = PROBE_TOPIC_LABELS[p.topic];
      lines.push(`    - ${label}${p.hint ? ` — ${p.hint}` : ""}`);
    });
    lines.push("");
  }

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

  // Echte Konkretheits-Lücken (missing). `yes`-Probes lassen wir hier weg
  // — der positiveAspects-Block deckt das ab. `not_relevant` ist schon im
  // oberen Audit-Trail-Block.
  const missingProbes = (result.konkretheit ?? []).filter(
    (p) => p.answer === "missing",
  );
  if (missingProbes.length > 0) {
    lines.push(
      `Folgende konkrete Angabe${missingProbes.length === 1 ? "" : "n"} fehl${missingProbes.length === 1 ? "t" : "en"} mir noch im Bericht:`,
    );
    lines.push("");
    missingProbes.forEach((p) => {
      const label = PROBE_TOPIC_LABELS[p.topic];
      lines.push(`    - ${label}${p.hint ? ` ${p.hint}` : ""}`);
    });
    lines.push("");
  }

  if (result.tonalityFeedback) {
    lines.push(`Tonalität / Stil-Hinweis: ${result.tonalityFeedback}`);
    lines.push("");
  }

  const allClean =
    ordered.length === 0 &&
    missing.length === 0 &&
    missingProbes.length === 0 &&
    !result.tonalityFeedback &&
    !result.massnahmeMismatch?.detected;
  if (allClean) {
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

// Akademische Titel + Anreden, die im Feld „Coach-Name" oft mit-getippt
// werden („Dr. Irene", „Prof. Schneider", „Frau Müller", …). Beim Bauen
// der Anrede überspringen wir die, damit nicht „Lieber Dr.," steht.
// Liste vorsichtig konservativ — bei Zweifel lieber durchlassen.
const TITLE_TOKENS = new Set([
  "dr",
  "dr.",
  "prof",
  "prof.",
  "dipl",
  "dipl.",
  "dipl.-ing",
  "dipl.-ing.",
  "mag",
  "mag.",
  "mba",
  "msc",
  "msc.",
  "m.sc",
  "m.sc.",
  "bsc",
  "bsc.",
  "b.sc",
  "b.sc.",
  "phd",
  "ph.d",
  "ph.d.",
  "med",
  "med.",
  "rer",
  "rer.",
  "nat",
  "nat.",
  "phil",
  "phil.",
  "ing",
  "ing.",
  "herr",
  "hr",
  "hr.",
  "frau",
  "fr",
  "fr.",
]);

/**
 * Holt den ersten echten Vornamen aus einem Coach-Name-String, indem
 * akademische Titel + Anreden überlesen werden. Liefert leeren String,
 * wenn der ganze Name nur aus Titeln besteht — dann fällt der Komposer
 * auf die generische „Hallo,"-Anrede zurück.
 */
function extractFirstName(coachName: string): string {
  const tokens = coachName.trim().split(/\s+/).filter((t) => t.length > 0);
  for (const token of tokens) {
    if (!TITLE_TOKENS.has(token.toLowerCase())) return token;
  }
  return "";
}

function endsWithUmlautA(firstName: string): boolean {
  // Sehr grobe Heuristik zur „Liebe X" vs. „Lieber X"-Anrede: endet
  // der Vorname auf typische weibliche Endungen, kein "r" anhängen.
  // Bewusst konservativ — bei Unsicherheit dem User-Tipp folgen, dass
  // er die Anrede einfach manuell korrigiert.
  return /(a|e|i|y|ia|tte|ine|line|na)$/.test(firstName.toLowerCase());
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
