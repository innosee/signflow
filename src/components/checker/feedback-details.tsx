"use client";

import { useState } from "react";

import {
  MUST_HAVE_LABELS,
  VIOLATION_CATEGORY_LABELS,
  type CheckerResult,
  type CheckerSection,
  type Violation,
} from "@/lib/checker/types";

const SECTION_LABELS: Record<CheckerSection, string> = {
  teilnahme: "Teilnahme und Mitarbeit",
  ablauf: "Ablauf und Inhalte",
  fazit: "Fazit und Empfehlungen",
};

type FeedbackDetailsProps = {
  result: CheckerResult;
  /**
   * Wird aufgerufen, wenn der Coach auf „Im Text markieren" klickt. Der
   * Parent wechselt zurück in den Edit-Modus, fokussiert die textarea
   * und selektiert den gefundenen Bereich (oder gibt Feedback, dass das
   * Zitat nicht auffindbar ist).
   */
  onLocateViolation?: (violation: Violation) => "found" | "not_found";
};

export function FeedbackDetails({
  result,
  onLocateViolation,
}: FeedbackDetailsProps) {
  const hardBlocks = result.violations.filter((v) => v.severity === "hard_block");
  const softFlags = result.violations.filter((v) => v.severity === "soft_flag");
  const openMustHaves = result.mustHaves.filter((m) => !m.covered);

  return (
    <div className="space-y-6">
      <MustHaveChecklist mustHaves={result.mustHaves} />

      {hardBlocks.length > 0 && (
        <section className="rounded-xl border border-rose-300 bg-white">
          <header className="border-b border-rose-200 bg-rose-50/60 px-5 py-4">
            <h3 className="text-sm font-semibold text-rose-900">
              Muss korrigiert werden ({hardBlocks.length})
            </h3>
            <p className="mt-0.5 text-xs text-rose-800/80">
              Diese Formulierungen sind Ablehnungsgründe. Bitte vor dem
              Einreichen ersetzen.
            </p>
          </header>
          <ul className="divide-y divide-zinc-200">
            {hardBlocks.map((v) => (
              <ViolationCard
                key={v.id}
                violation={v}
                onLocate={onLocateViolation}
              />
            ))}
          </ul>
        </section>
      )}

      {softFlags.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-white">
          <header className="border-b border-amber-200 bg-amber-50/60 px-5 py-4">
            <h3 className="text-sm font-semibold text-amber-900">
              Hinweise zur Formulierung ({softFlags.length})
            </h3>
            <p className="mt-0.5 text-xs text-amber-800/80">
              Kein Blocker — der Bildungsträger sieht diese Hinweise und kann
              entscheiden, ob eine Umformulierung nötig ist.
            </p>
          </header>
          <ul className="divide-y divide-zinc-200">
            {softFlags.map((v) => (
              <ViolationCard
                key={v.id}
                violation={v}
                onLocate={onLocateViolation}
              />
            ))}
          </ul>
        </section>
      )}

      {openMustHaves.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-5">
          <h3 className="text-sm font-semibold text-amber-900">
            Fehlende Pflichtbausteine ({openMustHaves.length})
          </h3>
          <p className="mt-0.5 text-xs text-amber-800">
            Der Bericht muss folgende Inhalte sinngemäß abbilden — bitte
            ergänzen:
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-amber-900">
            {openMustHaves.map((m) => (
              <li key={m.topic} className="flex items-start gap-2">
                <span aria-hidden className="mt-0.5">•</span>
                <span>
                  <span className="font-medium">
                    {MUST_HAVE_LABELS[m.topic]}
                  </span>
                  {m.hint && <span className="ml-1 text-amber-800">— {m.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.tonalityFeedback && (
        <section className="rounded-xl border border-zinc-300 bg-zinc-50 p-5">
          <h3 className="text-sm font-semibold text-zinc-900">
            Hinweis zur Tonalität
          </h3>
          <p className="mt-1 text-sm text-zinc-700">
            {result.tonalityFeedback}
          </p>
        </section>
      )}
    </div>
  );
}

type CardStatus = "idle" | "copied" | "located" | "not_found";

function ViolationCard({
  violation,
  onLocate,
}: {
  violation: Violation;
  onLocate?: (v: Violation) => "found" | "not_found";
}) {
  const [status, setStatus] = useState<CardStatus>("idle");
  const isSoft = violation.severity === "soft_flag";
  const badgeClass = isSoft
    ? "rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900"
    : "rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-800";
  const quoteClass = isSoft
    ? "mt-3 rounded-lg border-l-4 border-amber-300 bg-amber-50/60 px-4 py-3"
    : "mt-3 rounded-lg border-l-4 border-rose-300 bg-rose-50/60 px-4 py-3";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(violation.suggestion);
      setStatus("copied");
    } catch {
      // Clipboard-API kann blockiert sein (z.B. HTTP statt HTTPS, Permission
      // verweigert). Nutzer hat die Umformulierung vor der Nase — im Zweifel
      // per Hand markieren und kopieren. Keine Fehlermeldung nötig.
      setStatus("idle");
    }
  }

  function handleLocate() {
    if (!onLocate) return;
    // Vor dem Springen Umformulierung in die Zwischenablage legen, damit der
    // Coach im Edit-Modus direkt paste machen kann.
    void navigator.clipboard.writeText(violation.suggestion).catch(() => {
      /* ignore — Coach kann immer noch manuell kopieren */
    });
    const outcome = onLocate(violation);
    setStatus(outcome === "found" ? "located" : "not_found");
  }

  return (
    <li className="p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={badgeClass}>
          {VIOLATION_CATEGORY_LABELS[violation.category]}
        </span>
        {isSoft && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
            Hinweis
          </span>
        )}
        <span className="text-zinc-500">
          Abschnitt: {SECTION_LABELS[violation.section]}
        </span>
        <span className="text-zinc-500">· {violation.rule}</span>
      </div>

      <figure className={quoteClass}>
        <blockquote className="text-sm italic text-zinc-800">
          &bdquo;{violation.quote}&ldquo;
        </blockquote>
      </figure>

      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-emerald-900">
              Umformulierung nach erango-Standard:
            </div>
            <p className="mt-1 text-sm text-zinc-800">{violation.suggestion}</p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-600/40 bg-white px-2 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-50"
            title="Umformulierung in die Zwischenablage kopieren"
            aria-label="Umformulierung kopieren"
          >
            <CopyIcon />
            {status === "copied" ? "Kopiert" : "Kopieren"}
          </button>
        </div>
      </div>

      {onLocate && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleLocate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-400 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50"
          >
            <LocateIcon />
            Im Text markieren & kopieren
          </button>
          {status === "located" && (
            <span className="text-xs text-emerald-700">
              Stelle markiert — jetzt Cmd+V (Mac) oder Ctrl+V (Windows) zum
              Einfügen.
            </span>
          )}
          {status === "not_found" && (
            <span className="text-xs text-amber-800">
              Stelle nicht gefunden — bitte manuell suchen. Die Umformulierung
              liegt in der Zwischenablage.
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function LocateIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function MustHaveChecklist({
  mustHaves,
}: {
  mustHaves: CheckerResult["mustHaves"];
}) {
  const coveredCount = mustHaves.filter((m) => m.covered).length;
  return (
    <section className="rounded-xl border border-zinc-300 bg-white">
      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-zinc-900">
          Pflichtbausteine
        </h3>
        <span className="text-xs text-zinc-500">
          {coveredCount} von {mustHaves.length} abgedeckt
        </span>
      </header>
      <ul className="divide-y divide-zinc-100">
        {mustHaves.map((m) => (
          <li
            key={m.topic}
            className="flex items-center gap-3 px-5 py-3 text-sm"
          >
            {m.covered ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            ) : (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-zinc-300" />
            )}
            <span className={m.covered ? "text-zinc-900" : "text-zinc-500"}>
              {MUST_HAVE_LABELS[m.topic]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
