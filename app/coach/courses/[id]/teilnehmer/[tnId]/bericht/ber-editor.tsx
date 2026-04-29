"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  CheckerProgress,
  type CheckerStep,
} from "@/components/checker/checker-progress";
import { LiveFeedback } from "@/components/checker/live-feedback";
import { ReviewSidebar } from "@/components/checker/review-sidebar";
import { anonymize } from "@/lib/checker/anonymize";
import { locateQuote } from "@/lib/checker/locate-quote";
import { countPseudonymisedEntities } from "@/lib/checker/dummy-response";
import {
  fingerprintApplied,
  markPreviouslyAddressed,
} from "@/lib/checker/previously-addressed";
import { reverseMap } from "@/lib/checker/reverse-map";
import { runCheck } from "@/lib/checker/run-check";
import {
  buildSnapshot,
  inputsEqual,
  readSnapshotInput,
  readSnapshotResult,
} from "@/lib/checker/snapshot";
import {
  CHECKER_SECTIONS,
  type CheckerInput,
  type CheckerResult,
  type CheckerSection,
  type Violation,
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
  impersonating: boolean;
  stopImpersonationAction: () => Promise<void>;
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
  impersonating,
  stopImpersonationAction,
}: Props) {
  const router = useRouter();

  const [input, setInput] = useState<CheckerInput>({
    teilnahme: initialBer?.teilnahme ?? "",
    ablauf: initialBer?.ablauf ?? "",
    fazit: initialBer?.fazit ?? "",
  });
  const [sonstiges, setSonstiges] = useState(initialBer?.sonstiges ?? "");
  const [keineFehlzeiten, setKeineFehlzeiten] = useState(
    initialBer?.keineFehlzeiten ?? false,
  );
  const [mustHaveOverrideReason, setMustHaveOverrideReason] = useState(
    initialBer?.mustHaveOverrideReason ?? "",
  );
  const [status, setStatus] = useState<"draft" | "submitted">(
    initialBer?.status ?? "draft",
  );
  const [submittedBerId, setSubmittedBerId] = useState<string | null>(
    initialBer?.id ?? null,
  );
  const [submittedAt, setSubmittedAt] = useState<Date | null>(
    initialBer?.submittedAt ? new Date(initialBer.submittedAt) : null,
  );
  const [savedAt, setSavedAt] = useState<Date | null>(
    initialBer?.updatedAt ? new Date(initialBer.updatedAt) : null,
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [steps, setSteps] = useState<CheckerStep[]>(INITIAL_STEPS);
  // Stepwise-Review-State analog zum Schnell-Check: acceptedIds = pro Check
  // neu (Coach hakt Verstöße manuell oder durch Apply ab); appliedFingerprints
  // überleben den Check und markieren beim Re-Check „schon übernommen"-Stellen.
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(() => new Set());
  const [appliedFingerprints, setAppliedFingerprints] = useState<Set<string>>(
    () => new Set(),
  );
  // Cache des letzten Checks: gleicher Input → kein erneuter Azure-Call.
  // Preseed aus dem persistierten Snapshot, wenn er v2 ist und der Input
  // zu den gespeicherten Textfeldern passt (beim ersten Mount).
  const [lastCheckedInput, setLastCheckedInput] = useState<CheckerInput | null>(
    () => readSnapshotInput(initialBer?.checkSnapshot),
  );
  const [result, setResult] = useState<CheckerResult | null>(() =>
    readSnapshotResult(initialBer?.checkSnapshot),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const textareaRefs = useRef<Record<CheckerSection, HTMLTextAreaElement | null>>({
    teilnahme: null,
    ablauf: null,
    fazit: null,
  });
  const [pendingSelection, setPendingSelection] = useState<{
    section: CheckerSection;
    start: number;
    end: number;
  } | null>(null);

  function handleLocateViolation(v: Violation): "found" | "not_found" {
    const loc = locateQuote(input[v.section], v.quote);
    if (!loc.found) return "not_found";
    void navigator.clipboard.writeText(v.suggestion).catch(() => {
      /* ignore — Coach kann immer noch manuell kopieren */
    });
    setPendingSelection({
      section: v.section,
      start: loc.start,
      end: loc.end,
    });
    return "found";
  }

  function handleApplySuggestion(v: Violation): "applied" | "not_found" {
    const text = input[v.section];
    const loc = locateQuote(text, v.quote);
    if (!loc.found) return "not_found";
    const nextText =
      text.slice(0, loc.start) + v.suggestion + text.slice(loc.end);
    setInput((prev) => ({ ...prev, [v.section]: nextText }));
    setAcceptedIds((prev) => {
      const out = new Set(prev);
      out.add(v.id);
      return out;
    });
    setAppliedFingerprints((prev) => {
      const out = new Set(prev);
      out.add(fingerprintApplied(v.section, v.suggestion));
      return out;
    });
    return "applied";
  }

  function handleToggleAccepted(violationId: string) {
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      if (next.has(violationId)) next.delete(violationId);
      else next.add(violationId);
      return next;
    });
  }

  const hasHydrated = useRef(false);
  useEffect(() => {
    if (!hasHydrated.current) {
      hasHydrated.current = true;
      return;
    }
    // Während Impersonation wird nicht gespeichert — der Bildungsträger sieht
    // den Bericht nur zu Support-Zwecken. Inline-Banner oben erklärt das.
    if (impersonating) return;
    const handle = setTimeout(() => {
      const fd = new FormData();
      fd.append("courseId", courseId);
      fd.append("participantId", participantId);
      fd.append("teilnahme", input.teilnahme);
      fd.append("ablauf", input.ablauf);
      fd.append("fazit", input.fazit);
      fd.append("sonstiges", sonstiges);
      fd.append("keineFehlzeiten", keineFehlzeiten ? "true" : "false");
      startSaveTransition(async () => {
        const res = await saveBerDraftAction(undefined, fd);
        if (res?.savedAt) setSavedAt(new Date(res.savedAt));
        if (res?.berId) setSubmittedBerId(res.berId);
      });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [
    input,
    sonstiges,
    keineFehlzeiten,
    courseId,
    participantId,
    impersonating,
  ]);

  useEffect(() => {
    if (!pendingSelection) return;
    const el = textareaRefs.current[pendingSelection.section];
    if (!el) return;
    el.focus();
    el.setSelectionRange(pendingSelection.start, pendingSelection.end);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const textBefore = el.value.substring(0, pendingSelection.start);
    const lineIndex = (textBefore.match(/\n/g) ?? []).length;
    const approxLineHeight = 22;
    el.scrollTop = Math.max(0, lineIndex * approxLineHeight - 60);
    setPendingSelection(null);
  }, [pendingSelection]);

  function updateStep(id: string, patch: Partial<CheckerStep>) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  async function handleRunCheck(e: React.FormEvent) {
    e.preventDefault();
    // Short-circuit: gleicher Input wie beim letzten Check → kein neuer
    // Azure-Call. Sidebar-Result und Steps bleiben sichtbar.
    if (result && lastCheckedInput && inputsEqual(input, lastCheckedInput)) {
      return;
    }
    setIsProcessing(true);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, state: "pending" })));
    setResult(null);
    setSubmitError(null);
    setAcceptedIds(new Set());

    updateStep("anon", { state: "active" });
    let anonResult: Awaited<ReturnType<typeof anonymize>>;
    try {
      anonResult = await anonymize(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateStep("anon", {
        state: "error",
        detail: message,
        actionHref: "/coach/checker/diagnose",
        actionLabel: "Verbindung prüfen",
      });
      updateStep("verdict", {
        state: "error",
        detail: "Anonymisierung fehlgeschlagen — Prüfung abgebrochen.",
      });
      setSubmitError(message);
      setIsProcessing(false);
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
      setIsProcessing(false);
      return;
    }
    const reverseMapped = reverseMap(anonResult.entities, r);
    const mapped = markPreviouslyAddressed(reverseMapped, appliedFingerprints);
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
        : "Bericht muss überarbeitet werden — siehe Sidebar rechts.",
    });

    setResult(mapped);
    // Input-Snapshot merken, damit ein erneutes „Prüfen" ohne Änderungen
    // keinen weiteren Azure-Call verursacht. Wichtig: Kopie, nicht Referenz,
    // damit spätere Edits des Live-Inputs den Cache nicht aus Versehen
    // invalidieren (State-Vergleich per inputsEqual wertebasiert).
    setLastCheckedInput({ ...input });
    setIsProcessing(false);
  }

  function handleSubmitBer() {
    if (!result) return;
    const overrideTrim = mustHaveOverrideReason.trim();
    const overrideActive = overrideTrim.length >= 10;
    if (result.status !== "pass" && !overrideActive) return;
    setSubmitError(null);
    const fd = new FormData();
    fd.append("courseId", courseId);
    fd.append("participantId", participantId);
    fd.append("teilnahme", input.teilnahme);
    fd.append("ablauf", input.ablauf);
    fd.append("fazit", input.fazit);
    fd.append("sonstiges", sonstiges);
    fd.append("keineFehlzeiten", keineFehlzeiten ? "true" : "false");
    if (overrideActive) {
      fd.append("mustHaveOverrideReason", overrideTrim);
    }
    fd.append("lastCheckPassed", "true");
    // Snapshot v2 = { v: 2, input, result } — mit eingebettetem Input,
    // damit wir beim nächsten Öffnen des BER (und unverändertem Text)
    // nicht noch einen Azure-Call verbraten.
    if (result) {
      fd.append("checkSnapshot", JSON.stringify(buildSnapshot(input, result)));
    }
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
      if (res?.berId) {
        setSubmittedBerId(res.berId);
        // Direkt zur Print-Page springen — Coach soll das fertige PDF
        // sofort sehen und drucken/speichern können.
        router.push(`/coach/abschlussberichte/${res.berId}/print`);
        return;
      }
      router.refresh();
    });
  }

  function handleExportPdf() {
    // Wenn der Bericht schon einmal gespeichert wurde (Autosave hat einen
    // berId geliefert oder existiert von vorher), direkt zur autoritativen
    // Print-Page mit allen TN-Daten. Andernfalls Fallback auf den
    // sessionStorage-Preview.
    if (submittedBerId) {
      router.push(`/coach/abschlussberichte/${submittedBerId}/print`);
      return;
    }
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

  const overrideReasonTrim = mustHaveOverrideReason.trim();
  const overrideActive = overrideReasonTrim.length >= 10;
  const hasMissingMustHaves =
    !!result && result.mustHaves.some((m) => !m.covered);
  const hasHardBlock =
    !!result && result.violations.some((v) => v.severity === "hard_block");
  const effectivePass =
    !isProcessing &&
    !!result &&
    (result.status === "pass" ||
      (overrideActive && !hasHardBlock && hasMissingMustHaves));

  // 60-Sekunden-Buffer filtert Mikro-Autosaves direkt nach dem Submit raus
  // (z.B. wenn der Submit kurz nach einem Tipp kommt). Gleicher Wert wie
  // auf der Bildungsträger-Seite — nicht auseinanderlaufen lassen.
  const wasEditedAfterSubmit =
    status === "submitted" &&
    submittedAt !== null &&
    savedAt !== null &&
    savedAt.getTime() - submittedAt.getTime() > 60_000;

  const inputUnchangedSinceCheck =
    !!result && !!lastCheckedInput && inputsEqual(input, lastCheckedInput);
  const passed = effectivePass;
  const checkLabel = isProcessing
    ? "Prüfung läuft…"
    : result
      ? inputUnchangedSinceCheck
        ? "Schon geprüft"
        : "Erneut prüfen"
      : "Bericht final prüfen";

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
      <form onSubmit={handleRunCheck} className="space-y-6">
        {impersonating && (
          <ImpersonationReadOnlyBanner
            stopImpersonationAction={stopImpersonationAction}
          />
        )}
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
              ref={(el) => {
                textareaRefs.current[section.id] = el;
              }}
              rows={10}
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
              className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 selection:bg-amber-300 selection:text-zinc-900"
            />
          </div>
        ))}

        {/* Optionales 4. Feld — nicht durch den Checker geprüft. */}
        <div className="space-y-2">
          <label
            htmlFor="ber-sonstiges"
            className="block text-sm font-medium text-zinc-900"
          >
            Sonstige AVGS-Inhalte{" "}
            <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <textarea
            id="ber-sonstiges"
            rows={4}
            value={sonstiges}
            onChange={(e) => setSonstiges(e.target.value)}
            placeholder="z.B. GEPEDU-Test durchgeführt, Anerkennung ausländischer Diplome, Tragfähigkeitsanalyse, Weiterbildungssuche …"
            spellCheck
            lang="de"
            maxLength={4000}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
          <p className="text-xs text-zinc-500">
            Wird nicht gegen den Regelkatalog geprüft und nicht anonymisiert —
            bitte hier <strong>keine Klarnamen oder Kunden-Nr.</strong>{" "}
            eintragen.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-800 cursor-pointer">
          <input
            type="checkbox"
            checked={keineFehlzeiten}
            onChange={(e) => setKeineFehlzeiten(e.target.checked)}
            className="h-4 w-4 accent-zinc-900"
          />
          <span>Keine Fehlzeiten</span>
          <span className="text-xs text-zinc-500">
            (erscheint im PDF-Header)
          </span>
        </label>

        {submitError && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-3 text-sm text-rose-800">
            {submitError}
          </div>
        )}

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
          <div className="flex flex-wrap items-center gap-2">
            {passed && (
              <button
                type="button"
                onClick={handleExportPdf}
                className="rounded-lg border border-emerald-400 bg-white px-5 py-2.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-50"
              >
                Als Erango-PDF exportieren
              </button>
            )}
            {passed &&
              (status === "submitted" ? (
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white">
                    ✓ Bereits eingereicht
                  </div>
                  {submittedBerId && (
                    <Link
                      href={`/coach/abschlussberichte/${submittedBerId}/print`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-emerald-400 bg-white px-3 py-2.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-50"
                    >
                      PDF öffnen ↗
                    </Link>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitBer}
                  disabled={isSubmitting || impersonating}
                  title={
                    impersonating
                      ? "Im Support-Modus deaktiviert — Bildungsträger kann keine TN-Berichte einreichen."
                      : undefined
                  }
                  className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                >
                  {isSubmitting
                    ? "Reiche ein …"
                    : "Einreichen + PDF anzeigen →"}
                </button>
              ))}
            <button
              type="submit"
              disabled={
                !canSubmit || isProcessing || inputUnchangedSinceCheck
              }
              className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {checkLabel}
            </button>
          </div>
        </div>
      </form>

      <div>
        {isProcessing ? (
          <div className="sticky top-4">
            <CheckerProgress steps={steps} />
          </div>
        ) : result ? (
          <ReviewSidebar
            result={result}
            acceptedIds={acceptedIds}
            onToggleAccepted={handleToggleAccepted}
            onApply={handleApplySuggestion}
            onLocate={handleLocateViolation}
            mustHaveOverrideReason={mustHaveOverrideReason}
            onMustHaveOverrideReasonChange={setMustHaveOverrideReason}
          />
        ) : (
          <div className="space-y-4">
            <LiveFeedback input={input} />
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-xs text-zinc-600">
              <div className="font-medium text-zinc-900">Kontext</div>
              <div className="mt-1">
                Teilnehmer:{" "}
                <span className="text-zinc-900">{participantName}</span>
              </div>
              <div>Kunden-Nr.: {kundenNr}</div>
              <div>AVGS: {avgsNummer}</div>
              <div>Zeitraum: {zeitraum}</div>
              <div>Gesamt UE: {gesamtzahlUe}</div>
              <div className="mt-1">Coach: {coachName}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ImpersonationReadOnlyBanner({
  stopImpersonationAction,
}: {
  stopImpersonationAction: () => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">Nur-Lese-Modus (Support)</p>
          <p className="mt-1 text-xs">
            Du bist als Bildungsträger in die Coach-Sicht gewechselt.
            Änderungen am Bericht werden <strong>nicht gespeichert</strong>,
            Einreichen ist deaktiviert — Coaches müssen eigene Unterschrift/
            Einreichung selbst vornehmen.
          </p>
        </div>
        <form action={stopImpersonationAction}>
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-amber-600 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            Support-Modus verlassen →
          </button>
        </form>
      </div>
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
