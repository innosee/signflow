"use client";

import { useState } from "react";

import { HARD_BLOCK_REASON_MIN, isHardBlockDismissed } from "@/lib/checker/gate";
import {
  MUST_HAVE_LABELS,
  PROBE_TOPIC_LABELS,
  VIOLATION_CATEGORY_LABELS,
  type CheckerResult,
  type CheckerSection,
  type ProbeResult,
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
  /**
   * Pro Sensibel-Stelle (hard_block, per `violation.id`) die Fehlalarm-
   * Begründung des Coaches. Ein Hard-Block gilt erst ab ≥10 Zeichen als
   * weggeklickt — Wegklicken ohne Begründung ist nicht möglich.
   */
  dismissReasons: Readonly<Record<string, string>>;
  onDismissReasonChange: (id: string, reason: string) => void;
  /** Violation-IDs, die seit dem letzten Check neu hinzukamen → „Neu"-Badge. */
  newViolationIds?: ReadonlySet<string>;
};

export function ReviewSidebar({
  result,
  acceptedIds,
  onToggleAccepted,
  onApply,
  onLocate,
  dismissReasons,
  onDismissReasonChange,
  newViolationIds,
}: ReviewSidebarProps) {
  // „erledigt" = soft abgehakt/übernommen ODER hard übernommen (acceptedIds)
  // bzw. mit Begründung weggeklickt. Erledigte wandern in den Klappblock unten.
  const isResolved = (v: Violation) =>
    // KI hat ihre eigene schon übernommene Umformulierung erneut markiert →
    // gilt als erledigt (kein Handlungsbedarf, blockiert nicht).
    v.previouslyAddressed ||
    (v.severity === "soft_flag"
      ? acceptedIds.has(v.id)
      : acceptedIds.has(v.id) || isHardBlockDismissed(v.id, dismissReasons));
  const isNew = (v: Violation) => !!newViolationIds?.has(v.id);

  const openHard = result.violations.filter(
    (v) => v.severity === "hard_block" && !isResolved(v),
  );
  const openSoft = result.violations.filter(
    (v) => v.severity === "soft_flag" && !isResolved(v),
  );
  const resolved = result.violations.filter(isResolved);

  const missingMustHaves = result.mustHaves.filter((m) => !m.covered);
  // Einzige echte Hürde: ein offener (nicht aufgelöster) Hard-Block.
  const blocked = openHard.length > 0;
  const hintCount = openSoft.length + missingMustHaves.length;
  const total = result.violations.length;

  return (
    <aside aria-label="Prüfungsergebnis" className="sticky top-4 space-y-4">
      {result.massnahmeMismatch?.detected && (
        <section className="rounded-xl border-2 border-orange-400 bg-orange-50 p-4">
          <h3 className="text-sm font-semibold text-orange-900">
            ⚠ Maßnahme-Inhalts-Mismatch
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-orange-900">
            {result.massnahmeMismatch.hint}
          </p>
        </section>
      )}

      <StatusPill blocked={blocked} hintCount={hintCount} />

      {total > 0 && (
        <ProgressLine
          done={resolved.length}
          total={total}
          newCount={[...openHard, ...openSoft].filter(isNew).length}
        />
      )}

      {openHard.length > 0 && (
        <section className="rounded-xl border-2 border-rose-300 bg-white">
          <header className="flex items-center justify-between border-b border-rose-200 bg-rose-50/60 px-4 py-3">
            <h3 className="text-sm font-semibold text-rose-900">
              Sensibel · bitte prüfen
            </h3>
            <span className="text-xs text-rose-700">{openHard.length} offen</span>
          </header>
          <p className="border-b border-rose-100 px-4 py-2 text-[11px] leading-relaxed text-rose-800">
            Mögliche Gesundheits-/Art-9-Angabe oder harte Ablehnungs-Prognose —
            das Einzige, was das Einreichen blockiert. Übernimm den Vorschlag,
            um die Stelle zu entschärfen — oder klick sie per{" "}
            <strong>Fehlalarm</strong> weg (mit kurzer Begründung, die der
            Bildungsträger sieht).
          </p>
          <ul className="divide-y divide-zinc-100">
            {openHard.map((v) => (
              <ViolationCard
                key={v.id}
                violation={v}
                isNew={isNew(v)}
                accepted={acceptedIds.has(v.id)}
                onToggleAccepted={() => onToggleAccepted(v.id)}
                onApply={() => onApply(v)}
                onLocate={() => onLocate(v)}
                dismissReason={dismissReasons[v.id] ?? ""}
                onDismissReasonChange={(reason) =>
                  onDismissReasonChange(v.id, reason)
                }
              />
            ))}
          </ul>
        </section>
      )}

      <MustHaveCard mustHaves={result.mustHaves} />

      {openSoft.length > 0 && (
        <section className="rounded-xl border-2 border-amber-200 bg-white">
          <header className="flex items-center justify-between border-b border-amber-200 bg-amber-50/60 px-4 py-3">
            <h3 className="text-sm font-semibold text-amber-900">Hinweise</h3>
            <span className="text-xs text-amber-700">{openSoft.length} offen</span>
          </header>
          <p className="border-b border-amber-100 px-4 py-2 text-[11px] leading-relaxed text-amber-800">
            Rein beratend — blockiert das Einreichen nicht. Übernimm den
            Vorschlag, wenn er passt, oder markiere die Stelle mit{" "}
            <strong>„Passt schon“</strong> als erledigt.
          </p>
          <ul className="divide-y divide-zinc-100">
            {openSoft.map((v) => (
              <ViolationCard
                key={v.id}
                violation={v}
                isNew={isNew(v)}
                accepted={acceptedIds.has(v.id)}
                onToggleAccepted={() => onToggleAccepted(v.id)}
                onApply={() => onApply(v)}
                onLocate={() => onLocate(v)}
              />
            ))}
          </ul>
        </section>
      )}

      {resolved.length > 0 && (
        <ResolvedSection
          resolved={resolved}
          acceptedIds={acceptedIds}
          dismissReasons={dismissReasons}
          onUndoAccepted={onToggleAccepted}
          onUndoDismiss={(id) => onDismissReasonChange(id, "")}
        />
      )}

      {result.konkretheit && result.konkretheit.length > 0 && (
        <KonkretheitCard probes={result.konkretheit} />
      )}

      {result.positiveAspects && result.positiveAspects.length > 0 && (
        <PositiveAspectsCard aspects={result.positiveAspects} />
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

function ProgressLine({
  done,
  total,
  newCount,
}: {
  done: number;
  total: number;
  newCount: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-800">
          {done} von {total} bearbeitet
        </span>
        {newCount > 0 && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
            {newCount} neu seit letzter Prüfung
          </span>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ResolvedSection({
  resolved,
  acceptedIds,
  dismissReasons,
  onUndoAccepted,
  onUndoDismiss,
}: {
  resolved: Violation[];
  acceptedIds: ReadonlySet<string>;
  dismissReasons: Readonly<Record<string, string>>;
  onUndoAccepted: (id: string) => void;
  onUndoDismiss: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-zinc-700">
          Erledigt ({resolved.length})
        </span>
        <span className="text-xs text-zinc-500">
          {open ? "ausblenden ▾" : "anzeigen ▸"}
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-zinc-100 border-t border-zinc-200">
          {resolved.map((v) => {
            // applied (acceptedIds) = Vorschlag übernommen / Soft abgehakt;
            // dismissed = Fehlalarm mit Begründung; previouslyAddressed-only =
            // KI-Wiederholung der eigenen Umformulierung (auto-erledigt).
            const applied = acceptedIds.has(v.id);
            const dismissed =
              !applied && (dismissReasons[v.id] ?? "").trim().length >= 10;
            const how = applied
              ? "Vorschlag übernommen / abgehakt"
              : dismissed
                ? `Fehlalarm: ${(dismissReasons[v.id] ?? "").trim()}`
                : "Schon übernommen — KI hat die eigene Umformulierung erneut markiert";
            // Strukturelle Hinweise haben kein Zitat → Regel-Text als Titel.
            const title = v.structural ? v.rule : `„${v.quote}“`;
            return (
              <li key={v.id} className="px-4 py-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate italic text-zinc-500">{title}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-600">{how}</p>
                  </div>
                  {(applied || dismissed) && (
                    <button
                      type="button"
                      onClick={() =>
                        applied ? onUndoAccepted(v.id) : onUndoDismiss(v.id)
                      }
                      className="shrink-0 text-[11px] text-zinc-500 underline-offset-2 hover:underline"
                    >
                      rückgängig
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function KonkretheitCard({ probes }: { probes: ProbeResult[] }) {
  // Zähler oben: nur die echt offenen Probes hervorheben — `not_relevant`
  // und `yes` sind keine Aktionspunkte für den Coach.
  const missing = probes.filter((p) => p.answer === "missing");
  return (
    <section className="rounded-xl border border-zinc-300 bg-white">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-zinc-900">Konkretheit</h3>
        <span className="text-xs text-zinc-500">
          {missing.length} offen
        </span>
      </header>
      <ul className="divide-y divide-zinc-100 text-xs">
        {probes.map((p) => (
          <li key={p.topic} className="flex items-start gap-2 px-4 py-2.5">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                p.answer === "yes"
                  ? "bg-emerald-500 text-white"
                  : p.answer === "missing"
                    ? "border border-amber-400 bg-amber-50"
                    : "border border-dashed border-zinc-300"
              }`}
            >
              {p.answer === "yes" && <CheckIcon size={10} />}
            </span>
            <span
              className={
                p.answer === "missing"
                  ? "text-amber-900"
                  : p.answer === "yes"
                    ? "text-zinc-700"
                    : "text-zinc-500"
              }
            >
              {PROBE_TOPIC_LABELS[p.topic]}
              {p.hint && (
                <span className="block text-[11px] text-zinc-500">
                  — {p.hint}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PositiveAspectsCard({ aspects }: { aspects: string[] }) {
  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <h3 className="text-sm font-semibold text-emerald-900">
        Was schon gut ist
      </h3>
      <ul className="mt-2 space-y-1 text-xs text-emerald-900">
        {aspects.map((a, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span aria-hidden className="mt-0.5">✓</span>
            <span>{a}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusPill({
  blocked,
  hintCount,
}: {
  blocked: boolean;
  hintCount: number;
}) {
  if (blocked) {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 p-4">
        <div className="text-sm font-semibold text-rose-900">
          Sensible Stelle — bitte prüfen
        </div>
        <p className="mt-1 text-xs leading-relaxed text-rose-800">
          Eine als sensibel markierte Stelle muss entfernt oder als Fehlalarm
          begründet werden, bevor du einreichen kannst. Alle anderen Punkte
          sind reine Hinweise.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
      <div className="text-sm font-semibold text-emerald-900">
        Einreichen möglich
      </div>
      <p className="mt-1 text-xs leading-relaxed text-emerald-900">
        {hintCount > 0
          ? `${hintCount} ${hintCount === 1 ? "Hinweis" : "Hinweise"} offen — beratend, kein Muss.`
          : "Keine offenen Hinweise."}
      </p>
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
      {coveredCount < mustHaves.length && (
        <p className="border-t border-zinc-100 px-4 py-2 text-[11px] leading-relaxed text-zinc-500">
          Offene Bausteine sind ein Hinweis, kein Blocker — bei kurzen AVGS
          passt nicht jeder Baustein. Du kannst trotzdem einreichen.
        </p>
      )}
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
  dismissReason = "",
  onDismissReasonChange,
  isNew = false,
}: {
  violation: Violation;
  accepted: boolean;
  onToggleAccepted: () => void;
  onApply: () => ApplyOutcome;
  onLocate: () => LocateOutcome;
  /** Nur hard_block: Fehlalarm-Begründung des Coaches (≥10 Zeichen = weggeklickt). */
  dismissReason?: string;
  onDismissReasonChange?: (reason: string) => void;
  /** Seit dem letzten Re-Check neu aufgetaucht → „Neu"-Badge. */
  isNew?: boolean;
}) {
  const [status, setStatus] = useState<CardStatus>("idle");
  const isSoft = violation.severity === "soft_flag";
  // Deterministischer inhaltlicher Hinweis (zu dünn/floskelhaft/Baustein fehlt):
  // kein Zitat, keine Auto-Übernahme — nur Empfehlung + „Passt schon".
  const isStructural = !!violation.structural;
  const dismissed =
    !isSoft && dismissReason.trim().length >= HARD_BLOCK_REASON_MIN;
  const [showReason, setShowReason] = useState(dismissReason.length > 0);
  // „erledigt" = soft abgehakt ODER hard mit ausreichender Begründung.
  const resolved = isSoft ? accepted : dismissed;

  function handleApplyClick() {
    const outcome = onApply();
    setStatus(outcome === "applied" ? "applied" : "not_found");
  }

  function handleLocateClick() {
    const outcome = onLocate();
    setStatus(outcome === "found" ? "located" : "not_found");
  }

  return (
    <li className={`p-4 transition-opacity ${resolved ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide">
            <span
              className={`rounded-full px-1.5 py-0.5 ${
                isStructural || isSoft
                  ? "bg-amber-100 text-amber-900"
                  : "bg-rose-100 text-rose-900"
              }`}
            >
              {isStructural
                ? violation.rule
                : VIOLATION_CATEGORY_LABELS[violation.category]}
            </span>
            {!isStructural && (
              <span className="text-zinc-500">
                {SECTION_LABELS[violation.section]}
              </span>
            )}
            {isNew && (
              <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-sky-800">
                Neu
              </span>
            )}
            {!isStructural && violation.previouslyAddressed && (
              <span
                className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-zinc-700"
                title="Sitzt auf einer bereits übernommenen Umformulierung — kann meist ignoriert werden."
              >
                schon übernommen
              </span>
            )}
          </div>

          {!isStructural && (
            <blockquote
              className={`mt-2 rounded-md border-l-4 px-3 py-2 text-xs italic ${
                isSoft
                  ? "border-amber-300 bg-amber-50/60 text-zinc-800"
                  : "border-rose-300 bg-rose-50/60 text-zinc-800"
              }`}
            >
              &bdquo;{violation.quote}&ldquo;
            </blockquote>
          )}

          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-900">
              {isStructural ? "Empfehlung" : "Vorschlag"}
            </div>
            <p className="mt-0.5 text-xs text-zinc-800">
              {violation.suggestion}
            </p>
          </div>

          {!isStructural && (
            <p className="mt-1.5 text-[11px] text-zinc-500">
              Regel: {violation.rule}
            </p>
          )}

          {!resolved && isStructural && (
            <div className="mt-3">
              <button
                type="button"
                onClick={onToggleAccepted}
                className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-50"
                title="Hinweis erledigt — ergänzt, anders gelöst oder bewusst so gelassen."
              >
                Passt schon
              </button>
            </div>
          )}

          {!resolved && !isStructural && (
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
              {isSoft && (
                <button
                  type="button"
                  onClick={onToggleAccepted}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-50"
                  title="Hinweis erledigt — z.B. manuell anders gelöst oder bewusst so gelassen."
                >
                  Passt schon
                </button>
              )}
              {!isSoft && !showReason && (
                <button
                  type="button"
                  onClick={() => setShowReason(true)}
                  className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-800 transition hover:bg-rose-50"
                  title="Die KI lag daneben — Stelle ist unbedenklich. Mit kurzer Begründung wegklickbar (Bildungsträger sieht sie)."
                >
                  Fehlalarm — wegklicken
                </button>
              )}
            </div>
          )}

          {!isSoft && showReason && !dismissed && (
            <div className="mt-3 space-y-1.5">
              <textarea
                rows={2}
                value={dismissReason}
                onChange={(e) => onDismissReasonChange?.(e.target.value)}
                maxLength={500}
                autoFocus
                placeholder="Warum ist das ein Fehlalarm? (z.B. Satz ist positiv formuliert, keine Diagnose)"
                spellCheck
                lang="de"
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
                className="block w-full resize-y rounded-md border border-rose-300 bg-white px-2.5 py-2 text-xs leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
              <div className="flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    onDismissReasonChange?.("");
                    setShowReason(false);
                  }}
                  className="text-zinc-500 underline-offset-2 hover:underline"
                >
                  Abbrechen
                </button>
                <span className="text-rose-700">
                  Noch{" "}
                  {Math.max(
                    0,
                    HARD_BLOCK_REASON_MIN - dismissReason.trim().length,
                  )}{" "}
                  Zeichen Begründung
                </span>
              </div>
            </div>
          )}

          {dismissed && (
            <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
              <span className="font-medium text-zinc-700">
                Als Fehlalarm weggeklickt:
              </span>{" "}
              &bdquo;{dismissReason.trim()}&ldquo;
              <button
                type="button"
                onClick={() => {
                  onDismissReasonChange?.("");
                  setShowReason(false);
                }}
                className="ml-2 text-zinc-500 underline-offset-2 hover:underline"
              >
                rückgängig
              </button>
            </div>
          )}

          {status === "not_found" && (
            <p className="mt-2 text-[11px] text-amber-800">
              Stelle nicht mehr im Text gefunden — bitte manuell suchen oder
              die Karte abhaken, falls schon angepasst.
            </p>
          )}
          {status === "located" && !resolved && (
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
