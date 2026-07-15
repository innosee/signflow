import { AzureOpenAI } from "openai";

import { quoteJustifiesHardBlock } from "./hard-block-terms";
import { stableViolationId } from "./previously-addressed";
import { buildCheckerSystemPrompt } from "./prompt";
import {
  MUST_HAVES_BY_MASSNAHMETYP,
  resolveMassnahmeTyp,
  type CheckerInput,
  type CheckerResult,
  type MassnahmeMismatch,
  type MassnahmeTyp,
  type MustHaveCoverage,
  type MustHaveTopic,
  type ProbeAnswer,
  type ProbeResult,
  type ProbeTopic,
  type Violation,
  type ViolationCategory,
} from "./types";

// Anti-Halluzinations-Check für Maßnahme-Mismatch: das LLM neigt dazu,
// Beispiel-Hints aus dem Prompt zu übernehmen und dann „gewählter Typ ist
// aber EKC" zu schreiben, auch wenn der User EGC gewählt hat. Ein valider
// Hint muss den tatsächlich gewählten Typ als Kurzcode (\bEKC\b etc.)
// enthalten — sonst ist es Halluzination.
function hintMentionsTyp(hint: string, typ: MassnahmeTyp): boolean {
  return new RegExp(`\\b${typ}\\b`).test(hint);
}

const VALID_PROBE_TOPICS = new Set<ProbeTopic>([
  "bewerbungsunterlagen",
  "bewerbungen_konkret",
  "vorstellungsgespraeche",
  "methoden_erklaert",
  "anstellung_konkret",
  "weiterbildung_zielposition",
]);

const VALID_PROBE_ANSWERS = new Set<ProbeAnswer>([
  "yes",
  "missing",
  "not_relevant",
]);

const API_VERSION = "2024-10-21";

let client: AzureOpenAI | null = null;
let deployment: string | null = null;

function getClient(): { client: AzureOpenAI; deployment: string } {
  if (client && deployment) return { client, deployment };

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const dep = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !dep) {
    throw new Error(
      "Azure OpenAI nicht konfiguriert: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY und AZURE_OPENAI_DEPLOYMENT müssen gesetzt sein.",
    );
  }

  client = new AzureOpenAI({
    endpoint,
    apiKey,
    apiVersion: API_VERSION,
    deployment: dep,
  });
  deployment = dep;
  return { client, deployment };
}

function buildUserMessage(input: CheckerInput): string {
  return [
    "TEILNAHME UND MITARBEIT:",
    input.teilnahme.trim() || "(leer)",
    "",
    "ABLAUF UND INHALTE:",
    input.ablauf.trim() || "(leer)",
    "",
    "FAZIT:",
    input.fazit.trim() || "(leer)",
  ].join("\n");
}

const VALID_CATEGORIES = new Set<ViolationCategory>([
  "medizin",
  "diagnostik",
  "juristisch",
  "pathologisierung",
  "bewertung",
  "prognose",
  "kuechenpsychologie",
]);

const VALID_SECTIONS = new Set(["teilnahme", "ablauf", "fazit"]);

function parseAndValidate(
  raw: string,
  expectedTopics: ReadonlySet<MustHaveTopic>,
  actualMassnahmeTyp: MassnahmeTyp,
): CheckerResult {
  // Tolerant gegen Markdown-Fences, falls das Modell sich nicht ans Prompt hält.
  const stripped = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const data: unknown = JSON.parse(stripped);

  if (!data || typeof data !== "object") {
    throw new Error("Azure-Antwort ist kein JSON-Objekt");
  }
  const obj = data as Record<string, unknown>;

  // Wir berechnen den finalen Status unten selbst basierend auf hard_blocks +
  // Must-Haves, statt dem LLM zu vertrauen — das Modell neigt dazu, bei jeder
  // soft_flag-Violation trotzdem `needs_revision` zu setzen. Der rohe Status
  // wird nur zur Plausibilisierung gelesen.
  const rawStatus = obj.status;
  if (rawStatus !== "pass" && rawStatus !== "needs_revision") {
    throw new Error(`Ungültiger status: ${String(rawStatus)}`);
  }

  // mustHaves: nur Topics akzeptieren, die für den aktiven Maßnahmetyp
  // erwartet sind. Wenn das LLM versehentlich Topics aus einem anderen
  // Typ erfindet, fallen sie hier raus (statt die UI mit unbekannten
  // Topic-Keys crashen zu lassen).
  const mustHavesRaw = Array.isArray(obj.mustHaves) ? obj.mustHaves : [];
  const fromAzure = new Map<MustHaveTopic, MustHaveCoverage>();
  for (const m of mustHavesRaw) {
    if (!m || typeof m !== "object") continue;
    const topic = (m as { topic?: unknown }).topic;
    if (typeof topic !== "string" || !expectedTopics.has(topic as MustHaveTopic)) {
      continue;
    }
    const rec = m as Record<string, unknown>;
    fromAzure.set(topic as MustHaveTopic, {
      topic: topic as MustHaveTopic,
      covered: Boolean(rec.covered),
      hint: typeof rec.hint === "string" ? rec.hint : undefined,
    });
  }
  // Fehlende Topics auffüllen — wenn Azure einen erwarteten Baustein
  // einfach nicht zurückgegeben hat (z.B. weil das Modell das Schema
  // verkürzt hat), werten wir das als `covered: false`. Lieber den Coach
  // einen Hinweis zu viel sehen lassen, als stillschweigend einen
  // Pflicht-Baustein zu überspringen.
  const mustHaves: MustHaveCoverage[] = Array.from(expectedTopics).map(
    (topic) =>
      fromAzure.get(topic) ?? {
        topic,
        covered: false,
        hint: "Vom Checker nicht beantwortet — bitte im Bericht ergänzen.",
      },
  );

  const violationsRaw = Array.isArray(obj.violations) ? obj.violations : [];
  // Inhaltsstabile ID (section::normalize(quote)) statt Positionsindex, damit
  // der Review-State über Re-Checks erhalten bleibt. Gleichzeitig Dedup: zwei
  // identische (Section + Zitat) Treffer kollabieren zu einem — eindeutige
  // React-Keys + keine doppelten Karten.
  const seenIds = new Set<string>();
  const violations: Violation[] = violationsRaw
    .filter(
      (v): v is Record<string, unknown> =>
        !!v &&
        typeof v === "object" &&
        VALID_CATEGORIES.has((v as { category: ViolationCategory }).category) &&
        VALID_SECTIONS.has((v as { section: string }).section),
    )
    .map((v) => {
      const section = v.section as Violation["section"];
      const quote = typeof v.quote === "string" ? v.quote : "";
      // Severity-Leitplanke: hard_block nur, wenn das Modell ihn behauptet
      // UND das Zitat einen der wörtlich gelisteten Risiko-Begriffe enthält
      // (Prompt-Definition, im Code erzwungen — verhindert Flip-Flops
      // zwischen Re-Checks). Vorher defaultete fehlende severity sogar auf
      // hard_block; jetzt ist soft_flag der Fail-Default.
      const severity: Violation["severity"] =
        v.severity === "hard_block" && quoteJustifiesHardBlock(quote)
          ? "hard_block"
          : "soft_flag";
      return {
        id: stableViolationId(section, quote),
        category: v.category as ViolationCategory,
        severity,
        section,
        quote,
        rule: typeof v.rule === "string" ? v.rule : "",
        suggestion: typeof v.suggestion === "string" ? v.suggestion : "",
      };
    })
    .filter((v) => {
      if (seenIds.has(v.id)) return false;
      seenIds.add(v.id);
      return true;
    });

  const tonalityFeedback =
    typeof obj.tonalityFeedback === "string" && obj.tonalityFeedback.trim().length > 0
      ? obj.tonalityFeedback
      : undefined;

  // Konkretheits-Probes (Stage 1, prompt-seitig schon live): kontrolliert
  // an die UI durchreichen. Pro Topic darf das LLM maximal einen Eintrag
  // schicken — Dupes werden via Map dedupliziert.
  const probesRaw = Array.isArray(obj.konkretheit) ? obj.konkretheit : [];
  const probesMap = new Map<ProbeTopic, ProbeResult>();
  for (const p of probesRaw) {
    if (!p || typeof p !== "object") continue;
    const rec = p as Record<string, unknown>;
    const topic = rec.topic;
    const answer = rec.answer;
    if (
      typeof topic !== "string" ||
      !VALID_PROBE_TOPICS.has(topic as ProbeTopic) ||
      typeof answer !== "string" ||
      !VALID_PROBE_ANSWERS.has(answer as ProbeAnswer)
    ) {
      continue;
    }
    probesMap.set(topic as ProbeTopic, {
      topic: topic as ProbeTopic,
      answer: answer as ProbeAnswer,
      quote: typeof rec.quote === "string" ? rec.quote : undefined,
      hint: typeof rec.hint === "string" ? rec.hint : undefined,
    });
  }
  const konkretheit: ProbeResult[] | undefined =
    probesMap.size > 0 ? Array.from(probesMap.values()) : undefined;

  // Positive Aspekte — sehr kurze Stichworte. Strings über 200 Zeichen
  // verwerfen, das wäre kein "kurzer Stich­wort"-Eintrag mehr und passt
  // nicht ins UI-Layout.
  const positiveRaw = Array.isArray(obj.positiveAspects)
    ? obj.positiveAspects
    : [];
  const positiveAspects: string[] | undefined = positiveRaw
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim())
    .filter((s) => s.length <= 200);

  // Maßnahme-Inhalts-Mismatch (Stage 2.1). Nur durchreichen wenn das LLM
  // explizit `detected=true` UND eine Begründung geliefert hat — sonst
  // weglassen, damit die UI keine leere Warnbox rendert.
  //
  // Zusätzliche Anti-Halluzinations-Schicht: der hint muss den tatsächlich
  // gewählten Maßnahmetyp wörtlich nennen. Tut er es nicht, ist er fast
  // sicher eine Beispiel-Übernahme aus dem Prompt (siehe `hintMentionsTyp`).
  // Dann gar nicht zeigen — false-positive-Mismatch ist schädlicher als
  // ein übersehener echter Mismatch (Coach sieht ja den Bericht trotzdem).
  let massnahmeMismatch: MassnahmeMismatch | undefined;
  if (obj.massnahmeMismatch && typeof obj.massnahmeMismatch === "object") {
    const mm = obj.massnahmeMismatch as Record<string, unknown>;
    if (mm.detected === true) {
      const hint = typeof mm.hint === "string" ? mm.hint.trim() : "";
      if (hint.length > 0 && hintMentionsTyp(hint, actualMassnahmeTyp)) {
        massnahmeMismatch = { detected: true, hint };
      }
    }
  }

  // Canonicaler Status: pass nur wenn KEIN hard_block UND alle Must-Haves
  // covered. soft_flags sind Hinweise und blockieren Submit nicht.
  // Maßnahme-Mismatch ist ein eigener Kanal — blockt das Pass nicht
  // automatisch, weil's konzeptionell „falsche Maßnahme gewählt" sein
  // könnte und nicht „Bericht-Mangel". Der Coach/BT entscheidet manuell.
  const hasHardBlock = violations.some((v) => v.severity === "hard_block");
  const allMustHavesCovered = mustHaves.every((m) => m.covered);
  const status: CheckerResult["status"] =
    !hasHardBlock && allMustHavesCovered ? "pass" : "needs_revision";

  return {
    status,
    mustHaves,
    violations,
    tonalityFeedback,
    konkretheit,
    positiveAspects: positiveAspects.length > 0 ? positiveAspects : undefined,
    massnahmeMismatch,
  };
}

export async function runAzureCheck(input: CheckerInput): Promise<CheckerResult> {
  const { client: c, deployment: d } = getClient();

  const massnahmeTyp = resolveMassnahmeTyp(input.massnahmeTyp);
  const expectedTopics = new Set<MustHaveTopic>(
    MUST_HAVES_BY_MASSNAHMETYP[massnahmeTyp],
  );

  const completion = await c.chat.completions.create({
    model: d,
    // Determinismus: temperature 0 + fester seed. Azure garantiert keinen
    // 100%-bit-stabilen Output (Top-P, Server-Batching), reduziert Drift
    // zwischen Re-Checks aber spürbar — wichtig nach „Alle Verbesserungen
    // einbinden", damit der Coach nicht bei jedem Klick neue Cosmetics sieht.
    temperature: 0,
    seed: 42,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildCheckerSystemPrompt(massnahmeTyp) },
      { role: "user", content: buildUserMessage(input) },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Azure-Antwort enthielt keinen Inhalt");
  }
  return parseAndValidate(raw, expectedTopics, massnahmeTyp);
}
