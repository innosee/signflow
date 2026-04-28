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
  teilnahme: "Teilnahme",
  ablauf: "Ablauf",
  fazit: "Fazit",
};

type ApplyOutcome = "applied" | "not_found";
type LocateOutcome = "found" | "not_found";

type ReviewSidebarProps = {
  result: CheckerResult;
  acceptedIds: ReadonlySet<string>;
  onToggleAccepted: (id: string) => void;
  onApply: (v: Violation) => ApplyOutcome;
  onLocate: (v: Violation) => LocateOutcome;
};

export function ReviewSidebar({
  result,
  acceptedIds,
  onToggleAccepted,
  onApply,
  onLocate,
}: ReviewSidebarProps) {
  // Sortierung: offen vor erledigt, hard_block vor soft_flag, sonst stabil
  const sorted = [...result.violations].sort((a, b) => {
    const aDone = acceptedIds.has(a.id) ? 1 : 0;
    const bDone = acceptedIds.has(b.id) ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const aSev = a.severity === "hard_block" ? 0 : 1;
    const bSev = b.severity === "hard_block" ? 0 : 1;
    return aSev - bSev;
  });

  const openCount = result.violations.filter(
    (v) => !acceptedIds.has(v.id),
  ).length;
  const doneCount = result.violations.length - openCount;

  return (
    <aside aria-label="Prüfungsergebnis" className="sticky top-4 space-y-4">
      <StatusPill openCount={openCount} status={result.status} />
      <MustHaveCard mustHaves={result.mustHaves} />

      {result.violations.length > 0 && (
        <section className="rounded-xl border border-zinc-300 bg-white">
          <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-zinc-900">Verstöße</h3>
            <span className="text-xs text-zinc-500">
              {openCount} offen
              {doneCount > 0 && `, ${doneCount} erledigt`}
            </span>
          </header>
          <ul className="divide-y divide-zinc-100">
            {sorted.map((v) => (
              <ViolationCard
                key={v.id}
                violation={v}
                accepted={acceptedIds.has(v.id)}
                onToggleAccepted={() => onToggleAccepted(v.id)}
                onApply={() => onApply(v)}
                onLocate={() => onLocate(v)}
              />
            ))}
          </ul>
        </section>
      )}

      {result.tonalityFeedback && (
        <section className="rounded-xl border border-zinc-300 bg-zinc-50 p-4">
          <h3 className="text-sm font-semibold text-zinc-900">Tonalität</h3>
          <p className="mt-1 text-xs text-zinc-700">
            {result.tonalityFeedback}
          </p>
        </section>
      )}
    </aside>
  );
}

function StatusPill({
  status,
  openCount,
}: {
  status: CheckerResult["status"];
  openCount: number;
}) {
  // `acceptedIds`-Status wird hier bewusst nicht eingerechnet: ob der Bericht
  // wirklich pass-fähig ist, weiß nur der Re-Check. Die Häkchen sind ein
  // lokaler Coach-Marker, keine Azure-Bestätigung.
  const isPass = status === "pass";
  return (
    <div
      className={`rounded-xl border p-4 ${
        isPass
          ? "border-emerald-300 bg-emerald-50"
          : "border-rose-300 bg-rose-50"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        {isPass ? (
          <span className="text-emerald-900">Bereit zum Export</span>
        ) : (
          <span className="text-rose-900">Überarbeitung nötig</span>
        )}
      </div>
      {!isPass && (
        <p className="mt-1 text-xs text-rose-800">
          {openCount === 0
            ? "Alle abgehakt — bitte zur finalen Bestätigung erneut prüfen."
            : `${openCount} ${openCount === 1 ? "Stelle" : "Stellen"} noch offen.`}
        </p>
      )}
    </div>
  );
}

function MustHaveCard({
  mustHaves,
}: {
  mustHaves: CheckerResult["mustHaves"];
}) {
  const coveredCount = mustHaves.filter((m) => m.covered).length;
  return (
    <section className="rounded-xl border border-zinc-300 bg-white">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-zinc-900">Pflichtbausteine</h3>
        <span className="text-xs text-zinc-500">
          {coveredCount} / {mustHaves.length}
        </span>
      </header>
      <ul className="divide-y divide-zinc-100 text-xs">
        {mustHaves.map((m) => (
          <li key={m.topic} className="flex items-start gap-2 px-4 py-2.5">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                m.covered
                  ? "bg-emerald-500 text-white"
                  : "border border-dashed border-zinc-300"
              }`}
            >
              {m.covered && <CheckIcon size={10} />}
            </span>
            <span className={m.covered ? "text-zinc-700" : "text-zinc-500"}>
              {MUST_HAVE_LABELS[m.topic]}
              {!m.covered && m.hint && (
                <span className="block text-[11px] text-zinc-500">
                  — {m.hint}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type CardStatus = "idle" | "applied" | "not_found" | "located";

function ViolationCard({
  violation,
  accepted,
  onToggleAccepted,
  onApply,
  onLocate,
}: {
  violation: Violation;
  accepted: boolean;
  onToggleAccepted: () => void;
  onApply: () => ApplyOutcome;
  onLocate: () => LocateOutcome;
}) {
  const [status, setStatus] = useState<CardStatus>("idle");
  const isSoft = violation.severity === "soft_flag";

  function handleApplyClick() {
    const outcome = onApply();
    setStatus(outcome === "applied" ? "applied" : "not_found");
  }

  function handleLocateClick() {
    const outcome = onLocate();
    setStatus(outcome === "found" ? "located" : "not_found");
  }

  return (
    <li className={`p-4 transition-opacity ${accepted ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={accepted}
          onChange={onToggleAccepted}
          aria-label="Als erledigt markieren"
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-400 text-emerald-600 focus:ring-emerald-500"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide">
            <span
              className={`rounded-full px-1.5 py-0.5 ${
                isSoft
                  ? "bg-amber-100 text-amber-900"
                  : "bg-rose-100 text-rose-900"
              }`}
            >
              {VIOLATION_CATEGORY_LABELS[violation.category]}
            </span>
            <span className="text-zinc-500">
              {SECTION_LABELS[violation.section]}
            </span>
            {violation.previouslyAddressed && (
              <span
                className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-zinc-700"
                title="Sitzt auf einer bereits übernommenen Umformulierung — kann meist ignoriert werden."
              >
                schon übernommen
              </span>
            )}
          </div>

          <blockquote
            className={`mt-2 rounded-md border-l-4 px-3 py-2 text-xs italic ${
              isSoft
                ? "border-amber-300 bg-amber-50/60 text-zinc-700"
                : "border-rose-300 bg-rose-50/60 text-zinc-800"
            }`}
          >
            &bdquo;{violation.quote}&ldquo;
          </blockquote>

          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-900">
              Vorschlag
            </div>
            <p className="mt-0.5 text-xs text-zinc-800">
              {violation.suggestion}
            </p>
          </div>

          <p className="mt-1.5 text-[11px] text-zinc-500">
            Regel: {violation.rule}
          </p>

          {!accepted && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleApplyClick}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800"
              >
                Im Text übernehmen
              </button>
              <button
                type="button"
                onClick={handleLocateClick}
                className="rounded-md border border-zinc-400 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50"
              >
                Im Text markieren
              </button>
            </div>
          )}

          {status === "not_found" && (
            <p className="mt-2 text-[11px] text-amber-800">
              Stelle nicht mehr im Text gefunden — bitte manuell suchen oder
              die Karte abhaken, falls schon angepasst.
            </p>
          )}
          {status === "located" && !accepted && (
            <p className="mt-2 text-[11px] text-emerald-700">
              Stelle markiert — Vorschlag liegt in der Zwischenablage.
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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
  );
}
