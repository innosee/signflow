"use client";

import { useEffect, useMemo, useState } from "react";

import { CheckerCoolLoader } from "@/components/checker/checker-cool-loader";
import { MassnahmetypPicker } from "@/components/checker/massnahmetyp-picker";
import { anonymize } from "@/lib/checker/anonymize";
import {
  composeBtFeedbackEmail,
  composeSingleFinding,
} from "@/lib/checker/email-compose";
import { reverseMap } from "@/lib/checker/reverse-map";
import { runCheck } from "@/lib/checker/run-check";
import {
  CHECKER_SECTIONS,
  DEFAULT_MASSNAHME_TYP,
  MUST_HAVE_LABELS,
  PROBE_TOPIC_LABELS,
  VIOLATION_CATEGORY_LABELS,
  isCheckerInput,
  isCheckerResult,
  resolveMassnahmeTyp,
  type CheckerInput,
  type CheckerResult,
  type CheckerSection,
  type MassnahmeTyp,
  type ProbeResult,
  type Violation,
} from "@/lib/checker/types";

const EMPTY: CheckerInput = {
  teilnahme: "",
  ablauf: "",
  fazit: "",
  massnahmeTyp: DEFAULT_MASSNAHME_TYP,
};

const SECTION_LABEL: Record<CheckerSection, string> = Object.fromEntries(
  CHECKER_SECTIONS.map((s) => [s.id, s.label]),
) as Record<CheckerSection, string>;

// User-scoped Keys — gleiches Pattern wie der Coach-Checker, damit Drafts
// auf Shared-Devices nicht zwischen BT-Accounts leaken.
const draftStorageKey = (userId: string) =>
  `signflow:bt-checker-draft:${userId}`;
const resultStorageKey = (userId: string) =>
  `signflow:bt-checker-result:${userId}`;
const DRAFT_DEBOUNCE_MS = 800;

function hasAnyContent(input: CheckerInput): boolean {
  return (
    input.teilnahme.trim().length > 0 ||
    input.ablauf.trim().length > 0 ||
    input.fazit.trim().length > 0
  );
}

type DraftPayload = {
  input: CheckerInput;
  coachName: string;
  tnKuerzel: string;
  /**
   * Editierbare BT-Signatur unter der Email. Optional im Payload, damit
   * Drafts aus der Version vor dem Edit-Feld kompatibel bleiben.
   */
  btName?: string;
};

function isDraftPayload(value: unknown): value is DraftPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    !isCheckerInput(v.input) ||
    typeof v.coachName !== "string" ||
    typeof v.tnKuerzel !== "string"
  ) {
    return false;
  }
  if (v.btName !== undefined && typeof v.btName !== "string") return false;
  return true;
}

type State =
  | { phase: "idle" }
  | { phase: "running"; stage: "anon" | "azure" }
  | { phase: "done"; result: CheckerResult }
  | { phase: "error"; message: string };

export function BtCheckerForm({
  btName: btNameDefault,
  userId,
}: {
  btName: string;
  userId: string;
}) {
  const draftKey = draftStorageKey(userId);
  const resultKey = resultStorageKey(userId);
  const [input, setInput] = useState<CheckerInput>(EMPTY);
  const [coachName, setCoachName] = useState("");
  const [tnKuerzel, setTnKuerzel] = useState("");
  // Editierbare BT-Signatur — Default ist `session.user.name`, der BT
  // kann den Wert pro Bericht überschreiben (z.B. wenn die Email aus
  // einem Funktions-Postfach versendet wird oder für mehrere Personen
  // im selben User-Account gearbeitet wird).
  const [btName, setBtName] = useState(btNameDefault);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const maybe: unknown = JSON.parse(raw);
        if (isDraftPayload(maybe) && hasAnyContent(maybe.input)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage ist External State, per Design nur client-seitig lesbar; einmaliges Sync beim Mount
          setInput(maybe.input);
          setCoachName(maybe.coachName);
          setTnKuerzel(maybe.tnKuerzel);
          if (typeof maybe.btName === "string" && maybe.btName.length > 0) {
            setBtName(maybe.btName);
          }
        }
      }
    } catch {
      // corrupted — ignore
    }

    // Letztes Check-Ergebnis wiederherstellen, damit nach Reload der
    // Email-Output erhalten bleibt — der BT soll nicht erneut Tokens
    // verbrennen müssen.
    try {
      const raw = localStorage.getItem(resultKey);
      if (raw) {
        const maybe: unknown = JSON.parse(raw);
        if (
          maybe &&
          typeof maybe === "object" &&
          isCheckerResult((maybe as { result?: unknown }).result)
        ) {
          const payload = maybe as { result: CheckerResult };
          setState({ phase: "done", result: payload.result });
        }
      }
    } catch {
      // corrupted — ignore
    }

    setDraftLoaded(true);
  }, [draftKey, resultKey]);

  useEffect(() => {
    if (!draftLoaded) return;
    const handle = setTimeout(() => {
      try {
        // btName-Override nur persistieren, wenn der BT was anderes als
        // den Default gesetzt hat — sonst quillt der Storage mit Defaults.
        const btNameOverride =
          btName.trim().length > 0 && btName !== btNameDefault
            ? btName
            : undefined;
        const hasAnyDraft =
          hasAnyContent(input) ||
          coachName.trim().length > 0 ||
          tnKuerzel.trim().length > 0 ||
          btNameOverride !== undefined;
        if (hasAnyDraft) {
          const payload: DraftPayload = {
            input,
            coachName,
            tnKuerzel,
            ...(btNameOverride ? { btName: btNameOverride } : {}),
          };
          localStorage.setItem(draftKey, JSON.stringify(payload));
          setSavedAt(new Date());
        } else {
          localStorage.removeItem(draftKey);
          setSavedAt(null);
        }
      } catch {
        // quota / blocked — silent fall-back
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [input, coachName, tnKuerzel, btName, btNameDefault, draftLoaded, draftKey]);

  useEffect(() => {
    if (!draftLoaded) return;
    try {
      if (state.phase === "done") {
        localStorage.setItem(
          resultKey,
          JSON.stringify({ result: state.result }),
        );
      } else if (state.phase === "idle") {
        localStorage.removeItem(resultKey);
      }
      // Bei "running"/"error" lassen wir den letzten Stand bewusst stehen —
      // ein fehlgeschlagener Re-Check soll das vorherige Ergebnis nicht
      // aus dem Storage werfen.
    } catch {
      // quota / blocked — silent fall-back
    }
  }, [state, draftLoaded, resultKey]);

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

  function discardDraft() {
    const confirmed = window.confirm(
      "Entwurf wirklich verwerfen? Alle eingegebenen Texte und das Check-Ergebnis gehen verloren.",
    );
    if (!confirmed) return;
    try {
      localStorage.removeItem(draftKey);
      localStorage.removeItem(resultKey);
    } catch {
      /* noop */
    }
    setInput(EMPTY);
    setCoachName("");
    setTnKuerzel("");
    setBtName(btNameDefault);
    setState({ phase: "idle" });
    setSavedAt(null);
  }

  const hasResetableContent =
    hasAnyContent(input) ||
    coachName.trim().length > 0 ||
    tnKuerzel.trim().length > 0 ||
    btName !== btNameDefault ||
    state.phase === "done";

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

        <div className="rounded-xl border border-zinc-300 bg-white p-5">
          <MassnahmetypPicker
            id="bt-checker-massnahmetyp"
            value={resolveMassnahmeTyp(input.massnahmeTyp)}
            onChange={(next: MassnahmeTyp) =>
              setInput((prev) => ({ ...prev, massnahmeTyp: next }))
            }
          />
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

          <label className="block space-y-1.5">
            <span className="flex items-center justify-between text-xs text-zinc-600">
              <span>Unterschrift unter der E-Mail</span>
              {btName !== btNameDefault && (
                <button
                  type="button"
                  onClick={() => setBtName(btNameDefault)}
                  className="text-[11px] text-indigo-600 underline-offset-2 hover:underline"
                >
                  Auf &bdquo;{btNameDefault}&ldquo; zurücksetzen
                </button>
              )}
            </span>
            <input
              type="text"
              value={btName}
              onChange={(e) => setBtName(e.target.value)}
              placeholder={btNameDefault}
              className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
            />
          </label>

          <p className="text-xs text-zinc-500">
            Coach-Name + TN-Kürzel sind optional. Die Unterschrift ist auf
            deinen Account-Namen voreingestellt — überschreib sie z.B. wenn
            die Email aus einem Funktions-Postfach raus geht oder ihr euch
            einen Account zu mehrt teilt.
          </p>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="min-w-0 text-xs text-zinc-500">
            <p>
              Prüfung dauert ca. 6 Sekunden (Anonymisierung +
              Azure-Regelprüfung).
            </p>
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
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasResetableContent && (
              <button
                type="button"
                onClick={discardDraft}
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
        {state.phase === "running" && <CheckerCoolLoader stage={state.stage} />}
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
      {result.massnahmeMismatch?.detected && (
        <div className="rounded-xl border-2 border-orange-400 bg-orange-50 p-4 text-sm text-orange-900">
          <p className="font-semibold">
            ⚠ Maßnahme-Inhalts-Mismatch erkannt
          </p>
          <p className="mt-1.5 text-xs leading-relaxed">
            {result.massnahmeMismatch.hint}
          </p>
        </div>
      )}

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

      {result.konkretheit && result.konkretheit.length > 0 && (
        <KonkretheitBlock probes={result.konkretheit} />
      )}

      {result.positiveAspects && result.positiveAspects.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-900">Was schon gut ist</p>
          <ul className="mt-2 space-y-1 text-xs text-emerald-900">
            {result.positiveAspects.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span aria-hidden className="mt-0.5">
                  ✓
                </span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function KonkretheitBlock({ probes }: { probes: ProbeResult[] }) {
  // Nach Antwort-Typ gruppiert: erst die offenen Lücken (missing) — die
  // landen auch im Email-Body. Dann „passt", dann „nicht relevant".
  const missing = probes.filter((p) => p.answer === "missing");
  const yes = probes.filter((p) => p.answer === "yes");
  const notRelevant = probes.filter((p) => p.answer === "not_relevant");

  return (
    <div className="rounded-xl border border-zinc-300 bg-white text-sm">
      <p className="border-b border-zinc-200 px-4 py-3 font-medium text-zinc-900">
        Konkretheit
      </p>
      <div className="space-y-3 px-4 py-3 text-xs">
        {missing.length > 0 && (
          <div>
            <p className="font-medium text-amber-900">
              Fehlt im Bericht ({missing.length})
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-900">
              {missing.map((p) => (
                <li key={p.topic}>
                  {PROBE_TOPIC_LABELS[p.topic]}
                  {p.hint && <span className="text-amber-700"> — {p.hint}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {yes.length > 0 && (
          <div>
            <p className="font-medium text-emerald-900">
              Substantiell beantwortet ({yes.length})
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
              {yes.map((p) => (
                <li key={p.topic}>{PROBE_TOPIC_LABELS[p.topic]}</li>
              ))}
            </ul>
          </div>
        )}
        {notRelevant.length > 0 && (
          <div>
            <p className="font-medium text-zinc-700">
              In diesem Fall nicht relevant ({notRelevant.length})
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-500">
              {notRelevant.map((p) => (
                <li key={p.topic}>
                  {PROBE_TOPIC_LABELS[p.topic]}
                  {p.hint && <span> — {p.hint}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
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
