"use client";

import { useEffect, useRef, useState } from "react";

import {
  CheckerProgress,
  type CheckerStep,
} from "@/components/checker/checker-progress";
import { LiveFeedback } from "@/components/checker/live-feedback";
import { MassnahmetypPicker } from "@/components/checker/massnahmetyp-picker";
import { ReviewSidebar } from "@/components/checker/review-sidebar";
import { anonymize } from "@/lib/checker/anonymize";
import { AuthRequiredError } from "@/lib/checker/errors";
import { withAdvisoryHints } from "@/lib/checker/hints";
import { locateQuote } from "@/lib/checker/locate-quote";
import {
  fingerprintApplied,
  markCarriedOver,
  markPreviouslyAddressed,
} from "@/lib/checker/previously-addressed";
import { inputsEqual } from "@/lib/checker/snapshot";
import { countPseudonymisedEntities } from "@/lib/checker/dummy-response";
import { reverseMap } from "@/lib/checker/reverse-map";
import { runCheck } from "@/lib/checker/run-check";
import {
  CHECKER_ENGINE_REV,
  CHECKER_SECTIONS,
  DEFAULT_MASSNAHME_TYP,
  isCheckerInput,
  isCheckerResult,
  resolveMassnahmeTyp,
  type CheckerInput,
  type CheckerResult,
  type CheckerSection,
  type MassnahmeTyp,
  type Violation,
} from "@/lib/checker/types";

// Legacy unscoped key — wird beim Mount gelöscht, damit Reste aus älteren
// Sessions auf demselben Browser nicht in fremde Coach-Konten leaken.
const LEGACY_DRAFT_STORAGE_KEY = "signflow:checker-draft";
const draftStorageKey = (userId: string) =>
  `signflow:checker-draft:${userId}`;
// Result + lastCheckedInput werden mitpersistiert, damit nach Navigation
// oder Refresh der „An BT einreichen"-Button nicht verloren geht — der
// Coach soll nicht erneut Tokens verbrennen müssen, nur weil er kurz
// die Seite gewechselt hat.
const resultStorageKey = (userId: string) =>
  `signflow:checker-result:${userId}`;
const DRAFT_DEBOUNCE_MS = 800;

function hasAnyContent(input: CheckerInput): boolean {
  return (
    input.teilnahme.trim().length > 0 ||
    input.ablauf.trim().length > 0 ||
    input.fazit.trim().length > 0
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

const EMPTY_INPUT: CheckerInput = {
  teilnahme: "",
  ablauf: "",
  fazit: "",
  massnahmeTyp: DEFAULT_MASSNAHME_TYP,
};

export function CheckerForm({ userId }: { userId: string }) {
  const draftKey = draftStorageKey(userId);
  const resultKey = resultStorageKey(userId);
  const sonstigesKey = `signflow:checker-sonstiges:${userId}`;
  const [isProcessing, setIsProcessing] = useState(false);
  const [input, setInput] = useState<CheckerInput>(EMPTY_INPUT);
  // Optionales Sonstiges-Feld (AVGS-Inhalte / Freitext). Außerhalb von
  // CheckerInput, weil es NICHT durch den Checker läuft (kein PII-Pass,
  // keine Pflicht-Bausteine, keine Verstöße geprüft).
  const [sonstiges, setSonstiges] = useState("");
  // „Passt schon"-Status (acceptedIds) hält erledigte Hinweise; im reinen
  // Prüf-Tool gibt es keinen Einreichen-Gate. dismissReasons bleibt für die
  // geteilte Sidebar erhalten (im Check-Modus ungenutzt).
  const [dismissReasons, setDismissReasons] = useState<Record<string, string>>(
    {},
  );
  function handleDismissReasonChange(id: string, reason: string) {
    setDismissReasons((prev) => ({ ...prev, [id]: reason }));
  }
  const [steps, setSteps] = useState<CheckerStep[]>(INITIAL_STEPS);
  const [result, setResult] = useState<CheckerResult | null>(null);
  // Input-Snapshot des letzten Checks — kein erneuter Azure-Call wenn
  // der Coach ohne Text-Änderungen nochmal „Erneut prüfen" klickt.
  const [lastCheckedInput, setLastCheckedInput] = useState<CheckerInput | null>(
    null,
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const textareaRefs = useRef<Record<CheckerSection, HTMLTextAreaElement | null>>({
    teilnahme: null,
    ablauf: null,
    fazit: null,
  });
  // Zielbereich für „Im Text markieren" — wird im useEffect unten auf die
  // textarea angewendet. useState statt Ref, damit React den Effekt nach
  // dem Render triggert.
  const [pendingSelection, setPendingSelection] = useState<{
    section: CheckerSection;
    start: number;
    end: number;
  } | null>(null);
  // Verstoß-IDs, die der Coach in der aktuellen Result-Ansicht als „erledigt"
  // markiert hat — entweder per Checkbox-Klick oder implizit durch
  // „Im Text übernehmen". Wird beim nächsten Re-Check zurückgesetzt, weil
  // Azure neue IDs vergibt; Übernahme-Memory läuft über `appliedFingerprints`.
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Fingerprints aller Suggestions, die in dieser Session schon einmal
  // ins Dokument übernommen wurden. Wird beim nächsten Re-Check genutzt,
  // um vom LLM wieder geflaggte Stellen als „schon übernommen" zu
  // kennzeichnen — damit der Coach erkennt: nicht-deterministisches
  // LLM-Rauschen, keine echte neue Anmerkung.
  const [appliedFingerprints, setAppliedFingerprints] = useState<Set<string>>(
    () => new Set(),
  );
  // Violation-IDs des VORHERIGEN Checks — Basis für den „neu seit letzter
  // Prüfung"-Diff. `null` = noch kein Check gelaufen (erster Check badged nichts).
  const [lastCheckIds, setLastCheckIds] = useState<Set<string> | null>(null);
  // IDs, die im aktuellen Result neu hinzukamen → „Neu"-Badge in der Sidebar.
  const [newViolationIds, setNewViolationIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    // Legacy unscoped Key löschen — Reste aus Sessions vor dem User-Scoping
    // dürfen nicht in fremde Coach-Konten leaken.
    try {
      localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
    } catch {
      /* noop */
    }
    let parsed: CheckerInput | null = null;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const maybe: unknown = JSON.parse(raw);
        if (isCheckerInput(maybe)) parsed = maybe;
      }
    } catch {
      // corrupted — ignore
    }
    if (parsed && hasAnyContent(parsed)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage ist External State, per Design nur client-seitig lesbar; einmaliges Sync beim Mount
      setInput(parsed);
    }

    try {
      const rawSonstiges = localStorage.getItem(sonstigesKey);
      if (rawSonstiges && typeof rawSonstiges === "string") {
        setSonstiges(rawSonstiges);
      }
    } catch {
      // ignore
    }

    // Letztes Check-Ergebnis wiederherstellen — Buttons („Als PDF",
    // „An BT einreichen") sollen nach Navigation oder Refresh weiter
    // verfügbar sein, ohne erneuten Azure-Call.
    try {
      const raw = localStorage.getItem(resultKey);
      if (raw) {
        const maybe: unknown = JSON.parse(raw);
        if (
          maybe &&
          typeof maybe === "object" &&
          // Engine-Revision: Zustand aus einer älteren Checker-Version wird
          // verworfen — sonst würde die Konvergenz-Regel die Funde der neuen,
          // besseren Engine als „bereits geprüft" wegsortieren.
          (maybe as { rev?: unknown }).rev === CHECKER_ENGINE_REV &&
          isCheckerResult((maybe as { result?: unknown }).result) &&
          isCheckerInput(
            (maybe as { lastCheckedInput?: unknown }).lastCheckedInput,
          )
        ) {
          const payload = maybe as {
            result: CheckerResult;
            lastCheckedInput: CheckerInput;
            acceptedIds?: unknown;
            dismissReasons?: unknown;
            appliedFingerprints?: unknown;
            lastCheckIds?: unknown;
          };
          setResult(payload.result);
          setLastCheckedInput(payload.lastCheckedInput);
          // Review-State wiederherstellen (best effort, defensiv validiert).
          const strArray = (v: unknown): string[] =>
            Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
          if (Array.isArray(payload.acceptedIds)) {
            setAcceptedIds(new Set(strArray(payload.acceptedIds)));
          }
          if (
            payload.dismissReasons &&
            typeof payload.dismissReasons === "object" &&
            !Array.isArray(payload.dismissReasons)
          ) {
            const clean: Record<string, string> = {};
            for (const [k, val] of Object.entries(
              payload.dismissReasons as Record<string, unknown>,
            )) {
              if (typeof val === "string") clean[k] = val;
            }
            setDismissReasons(clean);
          }
          if (Array.isArray(payload.appliedFingerprints)) {
            setAppliedFingerprints(
              new Set(strArray(payload.appliedFingerprints)),
            );
          }
          if (Array.isArray(payload.lastCheckIds)) {
            setLastCheckIds(new Set(strArray(payload.lastCheckIds)));
          }
        }
      }
    } catch {
      // corrupted — ignore
    }

    setDraftLoaded(true);
  }, [draftKey, resultKey, sonstigesKey]);

  // Sonstiges separat persistieren — kleines Feld, eigener Key.
  useEffect(() => {
    if (!draftLoaded) return;
    try {
      if (sonstiges.trim().length > 0) {
        localStorage.setItem(sonstigesKey, sonstiges);
      } else {
        localStorage.removeItem(sonstigesKey);
      }
    } catch {
      /* noop */
    }
  }, [sonstiges, draftLoaded, sonstigesKey]);

  useEffect(() => {
    if (!draftLoaded) return;
    try {
      if (result && lastCheckedInput) {
        localStorage.setItem(
          resultKey,
          JSON.stringify({
            rev: CHECKER_ENGINE_REV,
            result,
            lastCheckedInput,
            // Review-State mitpersistieren, damit erledigte/weggeklickte
            // Stellen einen Reload überleben (sonst zeigt der Check nach
            // Refresh wieder alles offen).
            acceptedIds: [...acceptedIds],
            dismissReasons,
            appliedFingerprints: [...appliedFingerprints],
            lastCheckIds: lastCheckIds ? [...lastCheckIds] : null,
          }),
        );
      } else {
        localStorage.removeItem(resultKey);
      }
    } catch {
      // quota / blocked — silent fall-back, Result bleibt nur in-memory
    }
  }, [
    result,
    lastCheckedInput,
    acceptedIds,
    dismissReasons,
    appliedFingerprints,
    lastCheckIds,
    draftLoaded,
    resultKey,
  ]);

  useEffect(() => {
    if (!draftLoaded) return;
    const handle = setTimeout(() => {
      try {
        if (hasAnyContent(input)) {
          localStorage.setItem(draftKey, JSON.stringify(input));
          setSavedAt(new Date());
        } else {
          localStorage.removeItem(draftKey);
          setSavedAt(null);
        }
      } catch {
        // quota exceeded oder blockiert — still-fallen silent
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [input, draftLoaded, draftKey]);

  function handleDiscardDraft() {
    const confirmed = window.confirm(
      "Entwurf wirklich verwerfen? Alle eingegebenen Texte gehen verloren.",
    );
    if (!confirmed) return;
    try {
      localStorage.removeItem(draftKey);
      localStorage.removeItem(sonstigesKey);
    } catch {
      /* noop */
    }
    setInput(EMPTY_INPUT);
    setSonstiges("");
    setDismissReasons({});
    setSavedAt(null);
    setResult(null);
    setLastCheckedInput(null);
    setAcceptedIds(new Set());
    setAppliedFingerprints(new Set());
    setLastCheckIds(null);
    setNewViolationIds(new Set());
  }

  function updateStep(id: string, patch: Partial<CheckerStep>) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  /**
   * Setzt alle laufenden Steps auf einen klaren „Session abgelaufen"-Stand
   * mit Login-Action. Wird von beiden Phasen (anon, validate) aufgerufen
   * wenn das Backend 401 liefert — typisch nach 12h Hard-Cap (Tab über
   * Nacht offen). Draft im localStorage bleibt erhalten, weil wir hier
   * KEIN setInput aufrufen.
   */
  function renderAuthRequired() {
    updateStep("anon", {
      state: "error",
      detail:
        "Session abgelaufen — bitte neu einloggen. Deine Eingaben oben bleiben erhalten.",
      actionHref: "/login",
      actionLabel: "Zum Login",
    });
    updateStep("validate", { state: "pending", detail: undefined });
    updateStep("feedback", { state: "pending", detail: undefined });
    updateStep("verdict", {
      state: "error",
      detail: "Prüfung wegen abgelaufener Session abgebrochen.",
    });
    setIsProcessing(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Short-circuit: gleicher Input wie beim letzten Check → kein neuer
    // Azure-Call. Das aktuelle Result + Steps bleiben sichtbar, der Coach
    // sieht keinen Spinner für eine identische Prüfung.
    if (result && lastCheckedInput && inputsEqual(input, lastCheckedInput)) {
      return;
    }
    setIsProcessing(true);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, state: "pending" })));
    setResult(null);
    // Merge statt Reset: acceptedIds + dismissReasons bleiben über Re-Checks
    // erhalten (per inhaltsstabiler violation.id). Erledigte/weggeklickte
    // Stellen tauchen nicht erneut als „offen" auf; nur echte neue Treffer
    // werden unten als „neu" markiert. Stale Keys (Stelle ist weg) schaden
    // nicht — sie matchen einfach keine aktuelle Violation mehr.

    updateStep("anon", { state: "active" });
    let anonResult: Awaited<ReturnType<typeof anonymize>>;
    try {
      anonResult = await anonymize(input);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        renderAuthRequired();
        return;
      }
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
    let azureResult: CheckerResult;
    try {
      azureResult = await runCheck(anonResult.anonymized);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        renderAuthRequired();
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      updateStep("validate", { state: "error", detail: message });
      updateStep("verdict", {
        state: "error",
        detail: "Prüfung konnte nicht durchgeführt werden.",
      });
      setIsProcessing(false);
      return;
    }
    const reverseMapped = reverseMap(anonResult.entities, azureResult);
    // Konvergenz: erst „sitzt auf übernommener Umformulierung" markieren,
    // dann Nachschieber in unverändertem Text (markCarriedOver). Beide
    // Marker zählen in der Sidebar als erledigt — nach dem Übernehmen der
    // Vorschläge konvergiert der Re-Check auf grün, statt endlos „Neues"
    // zu zeigen. lastCheckedInput/lastCheckIds sind hier noch die Werte
    // der VORHERIGEN Runde (werden erst unten überschrieben).
    const mappedResult = markCarriedOver(
      markPreviouslyAddressed(reverseMapped, appliedFingerprints),
      lastCheckedInput,
      lastCheckIds,
      input,
    );
    updateStep("validate", {
      state: "success",
      detail: `${mappedResult.violations.length} ${mappedResult.violations.length === 1 ? "Regelverstoß" : "Regelverstöße"} · ${mappedResult.mustHaves.filter((m) => m.covered).length}/${mappedResult.mustHaves.length} Pflichtbausteine abgedeckt.`,
    });

    updateStep("feedback", { state: "active" });
    await sleep(300);
    updateStep("feedback", {
      state: "success",
      detail:
        mappedResult.violations.length > 0
          ? `${mappedResult.violations.length} Umformulierungs-Vorschläge bereit.`
          : "Keine Umformulierungen nötig.",
    });

    await sleep(200);
    const passed = mappedResult.status === "pass";
    updateStep("verdict", {
      state: passed ? "success" : "error",
      detail: passed
        ? "Der Bericht kann so eingereicht werden."
        : "Bericht muss überarbeitet werden — siehe Sidebar rechts.",
    });

    // „Neu seit letzter Prüfung": IDs, die im vorigen Check noch nicht
    // vorkamen. Beim ersten Check (lastCheckIds === null) ist nichts „neu".
    const currentIds = new Set(mappedResult.violations.map((v) => v.id));
    setNewViolationIds(
      lastCheckIds
        ? new Set([...currentIds].filter((id) => !lastCheckIds.has(id)))
        : new Set(),
    );
    setLastCheckIds(currentIds);

    setResult(mappedResult);
    setLastCheckedInput({ ...input });
    setIsProcessing(false);
  }

  function handleToggleAccepted(violationId: string) {
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      if (next.has(violationId)) next.delete(violationId);
      else next.add(violationId);
      return next;
    });
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

  useEffect(() => {
    if (!pendingSelection) return;
    const el = textareaRefs.current[pendingSelection.section];
    if (!el) return;
    el.focus();
    el.setSelectionRange(pendingSelection.start, pendingSelection.end);
    // scrollIntoView auf textarea selber — zentriert sie im Viewport.
    // Danach noch manuell auf die Selektion scrollen, damit die markierte
    // Stelle sichtbar ist (setSelectionRange scrollt nicht automatisch).
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Approximation der Y-Position der Selektion: wir nutzen die Zeilenhöhe
    // * line-index. Nicht pixel-genau, aber reicht, damit das Auge des
    // Coaches die Selektion findet.
    const textBefore = el.value.substring(0, pendingSelection.start);
    const lineIndex = (textBefore.match(/\n/g) ?? []).length;
    const approxLineHeight = 22;
    el.scrollTop = Math.max(0, lineIndex * approxLineHeight - 60);
    setPendingSelection(null);
  }, [pendingSelection]);

  // Mindestens ein Abschnitt muss Inhalt haben — sonst gibt es nichts zu
  // prüfen. Drei-Felder-Pflicht würde Coaches mit kurzen AVGS-Maßnahmen
  // (z.B. 5 UE „Bewerbungsunterlagen optimieren") in eine Falle laufen
  // lassen: ohne Check kein Override-Toggle, ohne Override kein Submit.
  const canSubmit =
    input.teilnahme.trim().length > 0 ||
    input.ablauf.trim().length > 0 ||
    input.fazit.trim().length > 0;
  const inputUnchangedSinceCheck =
    !!result &&
    !!lastCheckedInput &&
    inputsEqual(input, lastCheckedInput);
  const submitLabel = isProcessing
    ? "Prüfung läuft…"
    : result
      ? inputUnchangedSinceCheck
        ? "Schon geprüft"
        : "Bericht erneut prüfen"
      : "Bericht prüfen";
  // Export-Buttons bleiben sichtbar, sobald einmal erfolgreich geprüft —
  // auch wenn der Coach danach noch Text editiert. Bei verändertem Text
  // werden sie disabled (siehe `inputUnchangedSinceCheck`).
  const filledSectionCount = (Object.keys(input) as CheckerSection[]).filter(
    (k) => input[k].trim().length > 0,
  ).length;
  const partiallyFilled = filledSectionCount > 0 && filledSectionCount < 3;
  const showResetButton = hasAnyContent(input) || !!result;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-zinc-300 bg-white p-5 text-sm text-zinc-700">
          <p>
            Schreibe den Abschlussbericht direkt hier in Signflow. Rechts
            siehst du <span className="font-medium">live</span>, welche
            Pflichtbausteine schon abgedeckt sind und welche Formulierungen
            der Bildungsträger nicht akzeptiert. Personenbezogene Daten
            werden vor der finalen Prüfung automatisch anonymisiert —{" "}
            <span className="font-medium text-zinc-900">
              deine Daten verlassen nie Deutschland.
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-zinc-300 bg-white p-5">
          <MassnahmetypPicker
            id="coach-checker-massnahmetyp"
            value={resolveMassnahmeTyp(input.massnahmeTyp)}
            onChange={(next: MassnahmeTyp) =>
              setInput((prev) => ({ ...prev, massnahmeTyp: next }))
            }
          />
        </div>

        {CHECKER_SECTIONS.map((section) => (
          <div key={section.id} className="space-y-2">
            <label
              htmlFor={`checker-${section.id}`}
              className="block text-sm font-medium text-zinc-900"
            >
              {section.label}
            </label>
            <textarea
              id={`checker-${section.id}`}
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
              // Drittanbieter-Plugins (Grammarly, LanguageTool, …)
              // hart deaktiviert: sie würden Klartext mit potentiell PII
              // an US-Server schicken, BEVOR unser IONOS-Anonymizer greift.
              // Native Browser-Spellcheck bleibt aktiv (`spellCheck`).
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 selection:bg-amber-300 selection:text-zinc-900"
            />
          </div>
        ))}

        {/* Optionales Sonstiges-Feld — nicht durch den Checker geprüft. */}
        <div className="space-y-2">
          <label
            htmlFor="checker-sonstiges"
            className="block text-sm font-medium text-zinc-900"
          >
            Sonstige AVGS-Inhalte{" "}
            <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <textarea
            id="checker-sonstiges"
            rows={4}
            value={sonstiges}
            onChange={(e) => setSonstiges(e.target.value)}
            placeholder={`z.B. GEPEDU-Test durchgeführt, Anerkennung ausländischer Diplome, Tragfähigkeitsanalyse, Weiterbildungssuche …`}
            spellCheck
            lang="de"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            maxLength={4000}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
          <p className="text-xs text-zinc-500">
            Wird nicht gegen den Regelkatalog geprüft und nicht anonymisiert —
            bitte hier <strong>keine Klarnamen oder Kunden-Nr.</strong>{" "}
            eintragen. Rechtschreibung prüft dein Browser; der Checker
            kümmert sich um Inhalte.
          </p>
        </div>

        {result && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-xs leading-relaxed text-zinc-600">
            Dies ist ein <strong>Prüf-Tool</strong> — hier wird nichts
            eingereicht. Den fertigen, kundengebundenen Bericht erstellst und
            reichst du über{" "}
            <strong>Berichts-Checker → Kunde</strong> ein (dort hängt er am
            Kunden-Datensatz und lässt sich als PDF herunterladen).
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="min-w-0 text-xs text-zinc-500">
            <p>Finale Prüfung dauert ca. 6 Sekunden.</p>
            {savedAt ? (
              <p className="mt-1">
                <span aria-hidden className="text-emerald-600">
                  ●
                </span>{" "}
                Entwurf automatisch im Browser gespeichert (zuletzt{" "}
                {savedAt.toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
                ).
              </p>
            ) : (
              <p className="mt-1 text-zinc-400">
                Entwurf wird automatisch im Browser gespeichert, sobald du
                schreibst — Refresh ist ungefährlich.
              </p>
            )}
            {result && !inputUnchangedSinceCheck && (
              <p className="mt-1 text-amber-700">
                Text wurde nach der letzten Prüfung geändert — bei Bedarf erneut
                prüfen.
              </p>
            )}
            {partiallyFilled && !result && !isProcessing && (
              <p className="mt-1 text-zinc-500">
                Du kannst auch mit nur einem ausgefüllten Abschnitt prüfen.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showResetButton && (
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Neuer Bericht
              </button>
            )}
            <button
              type="submit"
              disabled={!canSubmit || isProcessing || inputUnchangedSinceCheck}
              className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {submitLabel}
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
            mode="check"
            result={withAdvisoryHints(result, input)}
            acceptedIds={acceptedIds}
            onToggleAccepted={handleToggleAccepted}
            onApply={handleApplySuggestion}
            onLocate={handleLocateViolation}
            dismissReasons={dismissReasons}
            onDismissReasonChange={handleDismissReasonChange}
            newViolationIds={newViolationIds}
          />
        ) : (
          <LiveFeedback input={input} />
        )}
      </div>
    </div>
  );
}
