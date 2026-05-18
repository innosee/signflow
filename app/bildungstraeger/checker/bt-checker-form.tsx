"use client";

import { useMemo, useState } from "react";

import { anonymize } from "@/lib/checker/anonymize";
import {
  composeBtFeedbackEmail,
  composeSingleFinding,
} from "@/lib/checker/email-compose";
import { reverseMap } from "@/lib/checker/reverse-map";
import { runCheck } from "@/lib/checker/run-check";
import {
  CHECKER_SECTIONS,
  MUST_HAVE_LABELS,
  VIOLATION_CATEGORY_LABELS,
  type CheckerInput,
  type CheckerResult,
  type CheckerSection,
  type Violation,
} from "@/lib/checker/types";

const EMPTY: CheckerInput = { teilnahme: "", ablauf: "", fazit: "" };

const SECTION_LABEL: Record<CheckerSection, string> = Object.fromEntries(
  CHECKER_SECTIONS.map((s) => [s.id, s.label]),
) as Record<CheckerSection, string>;

type State =
  | { phase: "idle" }
  | { phase: "running"; stage: "anon" | "azure" }
  | { phase: "done"; result: CheckerResult }
  | { phase: "error"; message: string };

export function BtCheckerForm({ btName }: { btName: string }) {
  const [input, setInput] = useState<CheckerInput>(EMPTY);
  const [coachName, setCoachName] = useState("");
  const [tnKuerzel, setTnKuerzel] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  const hasInput = useMemo(
    () =>
      input.teilnahme.trim().length +
        input.ablauf.trim().length +
        input.fazit.trim().length >
      0,
    [input],
  );

  async function runFlow(e: React.FormEvent) {
    e.preventDefault();
    if (!hasInput) return;
    setState({ phase: "running", stage: "anon" });

    let anonResult: Awaited<ReturnType<typeof anonymize>>;
    try {
      anonResult = await anonymize(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({
        phase: "error",
        message: `Anonymisierung fehlgeschlagen: ${message}`,
      });
      return;
    }

    setState({ phase: "running", stage: "azure" });
    let azureResult: CheckerResult;
    try {
      azureResult = await runCheck(anonResult.anonymized);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({
        phase: "error",
        message: `Regelprüfung fehlgeschlagen: ${message}`,
      });
      return;
    }

    const mapped = reverseMap(anonResult.entities, azureResult);
    setState({ phase: "done", result: mapped });
  }

  function reset() {
    setInput(EMPTY);
    setCoachName("");
    setTnKuerzel("");
    setState({ phase: "idle" });
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_420px]">
      <form onSubmit={runFlow} className="space-y-6">
        <div className="rounded-xl border border-zinc-300 bg-white p-5 text-sm text-zinc-700">
          <p>
            Kopiere die drei Berichts-Abschnitte einzeln in die Felder unten.
            Personenbezogene Daten werden vor der Prüfung im IONOS-Anonymizer
            in Frankfurt durch Platzhalter ersetzt — der Klartext verlässt nie
            den Browser.
          </p>
        </div>

        {CHECKER_SECTIONS.map((section) => (
          <div key={section.id} className="space-y-2">
            <label
              htmlFor={`bt-checker-${section.id}`}
              className="block text-sm font-medium text-zinc-900"
            >
              {section.label}
            </label>
            <textarea
              id={`bt-checker-${section.id}`}
              rows={8}
              value={input[section.id]}
              onChange={(e) =>
                setInput((prev) => ({
                  ...prev,
                  [section.id]: e.target.value,
                }))
              }
              placeholder={section.placeholder}
              spellCheck
              lang="de"
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
            />
          </div>
        ))}

        <fieldset className="space-y-3 rounded-xl border border-zinc-300 bg-white p-5">
          <legend className="px-1 text-sm font-medium text-zinc-700">
            Personalisierung der E-Mail (optional)
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs text-zinc-600">Coach-Name (Vorname reicht)</span>
              <input
                type="text"
                value={coachName}
                onChange={(e) => setCoachName(e.target.value)}
                placeholder="Heidi"
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-zinc-600">TN-Kürzel / Kunden-Nr.</span>
              <input
                type="text"
                value={tnKuerzel}
                onChange={(e) => setTnKuerzel(e.target.value)}
                placeholder="863D243398"
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
              />
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            Beide Felder sind optional. Wenn leer, baut der Komposer eine
            generische Anrede und Einleitung — du kannst die Anrede in der
            Email-Vorschau auch manuell anpassen, bevor du sie kopierst.
          </p>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-xs text-zinc-500">
            Prüfung dauert ca. 6 Sekunden (Anonymisierung + Azure-Regelprüfung).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {state.phase === "done" && (
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Neuer Bericht
              </button>
            )}
            <button
              type="submit"
              disabled={!hasInput || state.phase === "running"}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {state.phase === "running"
                ? state.stage === "anon"
                  ? "Anonymisiere…"
                  : "Prüfe…"
                : "Bericht prüfen"}
            </button>
          </div>
        </div>
      </form>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {state.phase === "idle" && <IdleHint />}
        {state.phase === "running" && <RunningIndicator stage={state.stage} />}
        {state.phase === "error" && <ErrorBox message={state.message} />}
        {state.phase === "done" && (
          <FindingsPanel
            result={state.result}
            coachName={coachName}
            tnKuerzel={tnKuerzel}
            btName={btName}
          />
        )}
      </aside>
    </div>
  );
}

function IdleHint() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600">
      <p className="font-medium text-zinc-800">Was du gleich bekommst:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
        <li>Liste aller Regelverstöße im Bericht (mit Original-Zitat)</li>
        <li>Liste fehlender Pflichtbausteine</li>
        <li>Ein versandfertiger E-Mail-Text mit allem zusammen</li>
        <li>Per-Finding-Copy für einzelne Mängel in laufende Konversationen</li>
      </ul>
    </div>
  );
}

function RunningIndicator({ stage }: { stage: "anon" | "azure" }) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-900">
      <p className="font-medium">
        {stage === "anon"
          ? "Anonymisierung läuft (IONOS Frankfurt)…"
          : "Regelprüfung läuft (Azure EU)…"}
      </p>
      <p className="mt-1 text-xs text-indigo-800">
        Klartext-Berichts-Daten verlassen den Browser nur in pseudonymisierter
        Form. Keine Rohtexte auf US-Servern.
      </p>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
      <p className="font-medium">Prüfung fehlgeschlagen</p>
      <p className="mt-1 text-xs">{message}</p>
    </div>
  );
}

function FindingsPanel({
  result,
  coachName,
  tnKuerzel,
  btName,
}: {
  result: CheckerResult;
  coachName: string;
  tnKuerzel: string;
  btName: string;
}) {
  const emailBody = useMemo(
    () =>
      composeBtFeedbackEmail({
        coachName,
        tnKuerzel,
        btName,
        result,
      }),
    [coachName, tnKuerzel, btName, result],
  );

  const missing = result.mustHaves.filter((m) => !m.covered);
  const okBadge = result.status === "pass";

  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border p-4 text-sm ${
          okBadge
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        <p className="font-medium">
          {okBadge
            ? "Aus Sicht des Checkers passt der Bericht."
            : `${result.violations.length} ${
                result.violations.length === 1 ? "Hinweis" : "Hinweise"
              }${missing.length > 0 ? ` · ${missing.length} fehlend${missing.length === 1 ? "er Baustein" : "e Bausteine"}` : ""}`}
        </p>
      </div>

      <div className="rounded-xl border border-zinc-300 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <p className="text-sm font-medium text-zinc-900">
            E-Mail-Entwurf (komplett)
          </p>
          <CopyButton text={emailBody} />
        </div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-4 py-3 font-sans text-xs leading-relaxed text-zinc-700">
          {emailBody}
        </pre>
      </div>

      {result.violations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-800">
            Einzelne Findings ({result.violations.length})
          </h3>
          {result.violations.map((v) => (
            <FindingCard key={v.id} v={v} />
          ))}
        </div>
      )}

      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">
            Fehlende Pflichtbausteine
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
            {missing.map((m) => (
              <li key={m.topic}>
                {MUST_HAVE_LABELS[m.topic]}
                {m.hint && <span className="text-amber-700"> — {m.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FindingCard({ v }: { v: Violation }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-xs">
          <span
            className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              v.severity === "hard_block"
                ? "bg-red-100 text-red-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {VIOLATION_CATEGORY_LABELS[v.category]}
          </span>
          <span className="text-zinc-500">
            {SECTION_LABEL[v.section].split(" /")[0]}
          </span>
        </div>
        <CopyButton compact text={composeSingleFinding(v)} />
      </div>
      <p className="mt-2 text-xs italic text-zinc-700">„{v.quote.trim()}"</p>
      <p className="mt-1 text-xs text-zinc-600">{v.rule}</p>
      {v.suggestion && (
        <p className="mt-1 text-xs text-zinc-600">
          <span className="font-medium">Vorschlag:</span>{" "}
          <span className="italic">{v.suggestion}</span>
        </p>
      )}
    </div>
  );
}

function CopyButton({
  text,
  compact = false,
}: {
  text: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard kann durch Browser-Policy blockiert sein — Fallback:
      // wir markieren ein hidden textarea und nutzen document.execCommand.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`shrink-0 rounded-md border border-zinc-300 bg-white font-medium text-zinc-700 transition hover:bg-zinc-50 ${
        compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      }`}
    >
      {copied ? "✓ Kopiert" : "Kopieren"}
    </button>
  );
}
