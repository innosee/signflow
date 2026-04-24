import { AzureOpenAI } from "openai";

import { CHECKER_SYSTEM_PROMPT } from "./prompt";
import type {
  CheckerInput,
  CheckerResult,
  MustHaveCoverage,
  MustHaveTopic,
  Violation,
  ViolationCategory,
} from "./types";

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

const VALID_TOPICS = new Set<MustHaveTopic>([
  "profiling",
  "zielarbeit",
  "strategie",
  "umsetzung",
  "marktorientierung",
  "prozessbegleitung",
]);

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

function parseAndValidate(raw: string): CheckerResult {
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

  const mustHavesRaw = Array.isArray(obj.mustHaves) ? obj.mustHaves : [];
  const mustHaves: MustHaveCoverage[] = mustHavesRaw
    .filter(
      (m): m is Record<string, unknown> =>
        !!m && typeof m === "object" && VALID_TOPICS.has((m as { topic: MustHaveTopic }).topic),
    )
    .map((m) => ({
      topic: m.topic as MustHaveTopic,
      covered: Boolean(m.covered),
      hint: typeof m.hint === "string" ? m.hint : undefined,
    }));

  const violationsRaw = Array.isArray(obj.violations) ? obj.violations : [];
  const violations: Violation[] = violationsRaw
    .filter(
      (v): v is Record<string, unknown> =>
        !!v &&
        typeof v === "object" &&
        VALID_CATEGORIES.has((v as { category: ViolationCategory }).category) &&
        VALID_SECTIONS.has((v as { section: string }).section),
    )
    .map((v, idx) => ({
      id: `azure_${idx}`,
      category: v.category as ViolationCategory,
      severity: v.severity === "soft_flag" ? "soft_flag" : "hard_block",
      section: v.section as Violation["section"],
      quote: typeof v.quote === "string" ? v.quote : "",
      rule: typeof v.rule === "string" ? v.rule : "",
      suggestion: typeof v.suggestion === "string" ? v.suggestion : "",
    }));

  const tonalityFeedback =
    typeof obj.tonalityFeedback === "string" && obj.tonalityFeedback.trim().length > 0
      ? obj.tonalityFeedback
      : undefined;

  // Canonicaler Status: pass nur wenn KEIN hard_block UND alle Must-Haves
  // covered. soft_flags sind Hinweise und blockieren Submit nicht.
  const hasHardBlock = violations.some((v) => v.severity === "hard_block");
  const allMustHavesCovered = mustHaves.every((m) => m.covered);
  const status: CheckerResult["status"] =
    !hasHardBlock && allMustHavesCovered ? "pass" : "needs_revision";

  return { status, mustHaves, violations, tonalityFeedback };
}

export async function runAzureCheck(input: CheckerInput): Promise<CheckerResult> {
  const { client: c, deployment: d } = getClient();

  const completion = await c.chat.completions.create({
    model: d,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CHECKER_SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Azure-Antwort enthielt keinen Inhalt");
  }
  return parseAndValidate(raw);
}
