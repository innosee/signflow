"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  CheckerProgress,
  type CheckerStep,
} from "@/components/checker/checker-progress";
import { FeedbackDetails } from "@/components/checker/feedback-details";
import { LiveFeedback } from "@/components/checker/live-feedback";
import { VerdictCard } from "@/components/checker/verdict-card";
import { anonymize } from "@/lib/checker/anonymize";
import { applySuggestion } from "@/lib/checker/apply-suggestion";
import { countPseudonymisedEntities } from "@/lib/checker/dummy-response";
import { reverseMap } from "@/lib/checker/reverse-map";
import { runCheck } from "@/lib/checker/run-check";
import {
  CHECKER_SECTIONS,
  type CheckerInput,
  type CheckerResult,
  type CheckerSection,
} from "@/lib/checker/types";
import type { Abschlussbericht } from "@/db/schema";

import { saveBerDraftAction, submitBerAction } from "./actions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const AUTOSAVE_DEBOUNCE_MS = 1200;
const EXPORT_STORAGE_KEY = "signflow:checker-export";

// Pipeline:
//   1. Anonymisierung im IONOS-Proxy (Frankfurt) — ersetzt Namen/Orte/Daten
//      durch Platzhalter. Browser ruft direkt auf, Vercel sieht keinen Rohtext.
//   2. Azure OpenAI EU (Sweden Central) prüft den anonymen Text.
//   3. Browser mappt Placeholder im Feedback wieder auf Originale.
const INITIAL_STEPS: CheckerStep[] = [
  {
    id: "anon",
    label: "Anonymisierung (IONOS Frankfurt)",
    description:
      "Personenbezogene Daten werden durch Platzhalter ersetzt — direkt aus dem Browser zum Proxy in Frankfurt.",
    state: "pending",
  },
  {
    id: "validate",
    label: "Regel-Validierung (Azure EU)",
    description:
      "Der anonymisierte Text wird gegen den Regelkatalog geprüft — Azure OpenAI in Sweden Central.",
    state: "pending",
  },
  {
    id: "feedback",
    label: "Feedback wird erstellt",
    description:
      "Ergebnisse werden aufbereitet und Umformulierungs-Vorschläge formuliert.",
    state: "pending",
  },
  {
    id: "verdict",
    label: "Ergebnis",
    description: "Abschließende Bewertung des Berichts.",
    state: "pending",
  },
];

type Phase = "input" | "processing" | "done";

type Props = {
  courseId: string;
  participantId: string;
  coachName: string;
  participantName: string;
  kundenNr: string;
  avgsNummer: string;
  zeitraum: string;
  gesamtzahlUe: string;
  initialBer: Abschlussbericht | null;
};

export function BerEditor({
  courseId,
  participantId,
  coachName,
  participantName,
  kundenNr,
  avgsNummer,
  zeitraum,
  gesamtzahlUe,
  initialBer,
}: Props) {
  const router = useRouter();

  const [input, setInput] = useState<CheckerInput>({
    teilnahme: initialBer?.teilnahme ?? "",
    ablauf: initialBer?.ablauf ?? "",
    fazit: initialBer?.fazit ?? "",
  });
  const [status, setStatus] = useState<"draft" | "submitted">(
    initialBer?.status ?? "draft",
  );
  const [submittedAt, setSubmittedAt] = useState<Date | null>(
    initialBer?.submittedAt ? new Date(initialBer.submittedAt) : null,
  );
  const [savedAt, setSavedAt] = useState<Date | null>(
    initialBer?.updatedAt ? new Date(initialBer.updatedAt) : null,
  );

  const [phase, setPhase] = useState<Phase>("input");
  const [steps, setSteps] = useState<CheckerStep[]>(INITIAL_STEPS);
  const [result, setResult] = useState<CheckerResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [appliedViolationIds, setAppliedViolationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [failedViolationIds, setFailedViolationIds] = useState<Set<string>>(
    () => new Set(),
  );

  function handleApplySuggestion(v: {
    id: string;
    section: CheckerSection;
    quote: string;
    suggestion: string;
  }) {
    let replaced = false;
    setInput((prev) => {
      const result = applySuggestion(prev[v.section], v.quote, v.suggestion);
      if (!result.found) return prev;
      replaced = true;
      return { ...prev, [v.section]: result.text };
    });
    if (replaced) {
      setAppliedViolationIds((prev) => new Set(prev).add(v.id));
    } else {
      setFailedViolationIds((prev) => new Set(prev).add(v.id));
    }
  }

  const hasHydrated = useRef(false);
  useEffect(() => {
    if (!hasHydrated.current) {
      hasHydrated.current = true;
      return;
    }
    const handle = setTimeout(() => {
      const fd = new FormData();
      fd.append("courseId", courseId);
      fd.append("participantId", participantId);
      fd.append("teilnahme", input.teilnahme);
      fd.append("ablauf", input.ablauf);
      fd.append("fazit", input.fazit);
      startSaveTransition(async () => {
        const res = await saveBerDraftAction(undefined, fd);
        if (res?.savedAt) setSavedAt(new Date(res.savedAt));
      });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [input, courseId, participantId]);

  function updateStep(id: string, patch: Partial<CheckerStep>) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  async function handleRunCheck(e: React.FormEvent) {
    e.preventDefault();
    setPhase("processing");
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, state: "pending" })));
    setResult(null);
    setSubmitError(null);
    setAppliedViolationIds(new Set());
    setFailedViolationIds(new Set());

    updateStep("anon", { state: "active" });
    let anonResult: Awaited<ReturnType<typeof anonymize>>;
    try {
      anonResult = await anonymize(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateStep("anon", { state: "error", detail: message });
      updateStep("verdict", {
        state: "error",
        detail: "Anonymisierung fehlgeschlagen — Prüfung abgebrochen.",
      });
      setSubmitError(message);
      setPhase("done");
      return;
    }
    if (anonResult.bypassed) {
      const piiHits = countPseudonymisedEntities(input);
      updateStep("anon", {
        state: "success",
        detail:
          piiHits > 0
            ? `IONOS-Proxy nicht konfiguriert — ${piiHits} potenziell personenbezogene Angaben im Klartext an Azure gesendet.`
            : "IONOS-Proxy nicht konfiguriert — Klartext an Azure gesendet (kein PII erkannt).",
      });
    } else {
      const n = anonResult.entities.length;
      updateStep("anon", {
        state: "success",
        detail:
          n > 0
            ? `${n} ${n === 1 ? "Entität" : "Entitäten"} pseudonymisiert (Namen, Orte, Daten, …).`
            : "Keine personenbezogenen Angaben gefunden — anonymisierter Text ist identisch zum Original.",
      });
    }

    updateStep("validate", { state: "active" });
    let r: CheckerResult;
    try {
      r = await runCheck(anonResult.anonymized);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateStep("validate", { state: "error", detail: message });
      updateStep("verdict", {
        state: "error",
        detail: "Prüfung konnte nicht durchgeführt werden.",
      });
      setSubmitError(message);
      setPhase("done");
      return;
    }
    const mapped = reverseMap(anonResult.entities, r);
    updateStep("validate", {
      state: "success",
      detail: `${mapped.violations.length} ${mapped.violations.length === 1 ? "Regelverstoß" : "Regelverstöße"} · ${mapped.mustHaves.filter((m) => m.covered).length}/${mapped.mustHaves.length} Pflichtbausteine abgedeckt.`,
    });

    updateStep("feedback", { state: "active" });
    await sleep(300);
    updateStep("feedback", {
      state: "success",
      detail:
        mapped.violations.length > 0
          ? `${mapped.violations.length} Umformulierungs-Vorschläge bereit.`
          : "Keine Umformulierungen nötig.",
    });

    await sleep(200);
    const passed = mapped.status === "pass";
    updateStep("verdict", {
      state: passed ? "success" : "error",
      detail: passed
        ? "Der Bericht kann so an den Bildungsträger eingereicht werden."
        : "Bericht muss überarbeitet werden — siehe Feedback unten.",
    });

    setResult(mapped);
    setPhase("done");
  }

  function handleBackToEdit() {
    setPhase("input");
    setSteps(INITIAL_STEPS);
    setResult(null);
    setAppliedViolationIds(new Set());
    setFailedViolationIds(new Set());
  }

  function handleSubmitBer() {
    if (!result || result.status !== "pass") return;
    setSubmitError(null);
    const fd = new FormData();
    fd.append("courseId", courseId);
    fd.append("participantId", participantId);
    fd.append("teilnahme", input.teilnahme);
    fd.append("ablauf", input.ablauf);
    fd.append("fazit", input.fazit);
    fd.append("lastCheckPassed", "true");
    startSubmitTransition(async () => {
      const res = await submitBerAction(undefined, fd);
      if (res?.error) {
        setSubmitError(res.error);
        return;
      }
      const now = res?.savedAt ? new Date(res.savedAt) : new Date();
      setStatus("submitted");
      setSubmittedAt(now);
      setSavedAt(now);
      router.refresh();
    });
  }

  function handleExportPdf() {
    try {
      sessionStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(input));
    } catch {
      /* ignore */
    }
    router.push("/coach/checker/export");
  }

  const canSubmit =
    input.teilnahme.trim().length > 0 &&
    input.ablauf.trim().length > 0 &&
    input.fazit.trim().length > 0;

  // 60-Sekunden-Buffer filtert Mikro-Autosaves direkt nach dem Submit raus
  // (z.B. wenn der Submit kurz nach einem Tipp kommt). Gleicher Wert wie
  // auf der Bildungsträger-Seite — nicht auseinanderlaufen lassen.
  const wasEditedAfterSubmit =
    status === "submitted" &&
    submittedAt !== null &&
    savedAt !== null &&
    savedAt.getTime() - submittedAt.getTime() > 60_000;

  if (phase === "input") {
    return (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <form onSubmit={handleRunCheck} className="space-y-6">
          <StatusBanner
            status={status}
            submittedAt={submittedAt}
            wasEditedAfterSubmit={wasEditedAfterSubmit}
          />

          {CHECKER_SECTIONS.map((section) => (
            <div key={section.id} className="space-y-2">
              <label
                htmlFor={`ber-${section.id}`}
                className="block text-sm font-medium text-zinc-900"
              >
                {section.label}
              </label>
              <textarea
                id={`ber-${section.id}`}
                rows={10}
                value={input[section.id]}
                onChange={(e) =>
                  setInput((prev) => ({
                    ...prev,
                    [section.id]: e.target.value,
                  }))
                }
                placeholder={section.placeholder}
                className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="min-w-0 text-xs text-zinc-500">
              <p>
                Finale Prüfung läuft lokal + anonymisiert — dauert ca. 6
                Sekunden.
              </p>
              <p className="mt-1">
                {isSaving ? (
                  <span className="text-zinc-600">Speichert …</span>
                ) : savedAt ? (
                  <>
                    <span aria-hidden className="text-emerald-600">
                      ●
                    </span>{" "}
                    Entwurf gespeichert um{" "}
                    {savedAt.toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </>
                ) : (
                  <span className="text-zinc-400">
                    Autosave läuft, sobald du anfängst zu schreiben.
                  </span>
                )}
              </p>
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              Bericht final prüfen
            </button>
          </div>
        </form>

        <div>
          <LiveFeedback input={input} />
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-xs text-zinc-600">
            <div className="font-medium text-zinc-900">Kontext</div>
            <div className="mt-1">
              Teilnehmer: <span className="text-zinc-900">{participantName}</span>
            </div>
            <div>Kunden-Nr.: {kundenNr}</div>
            <div>AVGS: {avgsNummer}</div>
            <div>Zeitraum: {zeitraum}</div>
            <div>Gesamt UE: {gesamtzahlUe}</div>
            <div className="mt-1">Coach: {coachName}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CheckerProgress steps={steps} />

      {phase === "done" && result && (
        <>
          <VerdictCard result={result} />
          {result.status === "needs_revision" && (
            <FeedbackDetails
              result={result}
              appliedViolationIds={appliedViolationIds}
              failedViolationIds={failedViolationIds}
              onApplySuggestion={handleApplySuggestion}
            />
          )}

          {submitError && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-3 text-sm text-rose-800">
              {submitError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleBackToEdit}
              className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
            >
              Weiter bearbeiten
            </button>
            {result.status === "pass" && (
              <>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="rounded-lg border border-emerald-400 bg-white px-5 py-2.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-50"
                >
                  Als Erango-PDF exportieren
                </button>
                {status === "submitted" ? (
                  <div className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white">
                    ✓ Bereits eingereicht
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmitBer}
                    disabled={isSubmitting}
                    className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:bg-zinc-600"
                  >
                    {isSubmitting
                      ? "Reiche ein …"
                      : "An Bildungsträger einreichen →"}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatusBanner({
  status,
  submittedAt,
  wasEditedAfterSubmit,
}: {
  status: "draft" | "submitted";
  submittedAt: Date | null;
  wasEditedAfterSubmit: boolean;
}) {
  if (status === "draft") {
    return (
      <div className="rounded-xl border border-zinc-300 bg-white p-5 text-sm text-zinc-700">
        <p>
          Schreib den Bericht direkt hier. Autosave läuft im Hintergrund —
          wenn alles stimmt, klick &bdquo;Bericht final prüfen&ldquo; und
          danach &bdquo;An Bildungsträger einreichen&ldquo;.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-sm text-emerald-900">
      <p className="font-medium">
        ✓ Bericht wurde bereits an den Bildungsträger eingereicht
      </p>
      {submittedAt && (
        <p className="mt-0.5 text-xs text-emerald-800">
          Eingereicht am{" "}
          {submittedAt.toLocaleDateString("de-DE")} um{" "}
          {submittedAt.toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {wasEditedAfterSubmit && " — seitdem nochmal bearbeitet"}
        </p>
      )}
      <p className="mt-2 text-xs text-emerald-800">
        Du kannst den Text weiterhin anpassen — Änderungen werden automatisch
        gespeichert und beim Bildungsträger sichtbar.
      </p>
    </div>
  );
}
