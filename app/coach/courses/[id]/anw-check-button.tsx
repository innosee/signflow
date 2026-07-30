"use client";

import { useActionState } from "react";

import {
  acknowledgeAnwCheckAction,
  applyAnwSuggestion,
  runAnwCheckAction,
  type AnwAcknowledgeState,
  type AnwCheckState,
  type ApplyAnwSuggestionState,
} from "./actions";

type SessionRef = { id: string; topic: string };

/**
 * Empfohlener KI-gestützter Pre-Step vor „Zur Prüfung einreichen":
 * checkt die Stichwort-Einträge aller Sessions gegen AZAV-Compliance
 * (No-Go-Wortschatz, Defizitorientierung, Roter Faden zur Maßnahme).
 *
 * Bewusst rudimentäre UI — kein Drawer, kein Modal, kein streamender
 * Loader wie beim BER-Checker. Single Button, Result-Box inline, jeder
 * Klick frischer Azure-Call. Persistenz haben wir bewusst weggelassen
 * (User-Entscheidung 2026-06-05): wer den Stundennachweis korrigiert,
 * soll auch neu prüfen — ohne stale-Anzeigen.
 */
export function AnwCheckButton({
  courseId,
  sessions,
  disabled,
  disabledReason,
}: {
  courseId: string;
  /** Termine (id + Thema) für die Zitat→Termin-Zuordnung beim Übernehmen. */
  sessions: SessionRef[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState<AnwCheckState, FormData>(
    runAnwCheckAction,
    undefined,
  );
  const [ackState, ackAction, ackPending] = useActionState<
    AnwAcknowledgeState,
    FormData
  >(acknowledgeAnwCheckAction, undefined);

  const result = state?.result;
  // Acknowledge-Override nur anbieten, wenn der Check „nacharbeit" lieferte
  // und noch nicht quittiert wurde. Bei „freigabe" ist eh alles offen.
  const showAcknowledge =
    !!result && result.status !== "freigabe" && !ackState?.acknowledged;

  return (
    <div className="space-y-3">
      <form action={action}>
        <input type="hidden" name="courseId" value={courseId} />
        <button
          type="submit"
          disabled={pending || disabled}
          title={disabled ? disabledReason : "Inhalte der Einträge KI-gestützt prüfen"}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition enabled:hover:bg-zinc-50 disabled:opacity-40"
        >
          <span aria-hidden="true">🔍</span>
          {pending ? "Prüfe ANW-Einträge…" : "ANW-Compliance prüfen (KI)"}
        </button>
      </form>

      {state?.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      {result && (
        <AnwCheckResultCard
          result={result}
          courseId={courseId}
          sessions={sessions}
        />
      )}

      {showAcknowledge && (
        <form
          action={ackAction}
          onSubmit={(e) => {
            if (
              !window.confirm(
                "Die KI-Hinweise sind eine unverbindliche Hilfestellung. Du bestätigst, dass du sie gesehen hast und die Liste trotzdem zur Prüfung freigeben möchtest. Der Bildungsträger prüft sie anschließend.",
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="courseId" value={courseId} />
          <input
            type="hidden"
            name="warningsCount"
            value={result?.warnings.length ?? 0}
          />
          <button
            type="submit"
            disabled={ackPending}
            className="rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition enabled:hover:bg-amber-50 disabled:opacity-40"
          >
            {ackPending
              ? "Wird freigegeben…"
              : "Hinweise gesehen — trotzdem freigeben"}
          </button>
        </form>
      )}

      {ackState?.acknowledged && (
        <p className="text-sm text-emerald-700">
          Freigegeben — du kannst fortfahren. (Lade die Seite ggf. neu, falls der
          Schritt oben noch nicht grün ist.)
        </p>
      )}
      {ackState?.error && (
        <p role="alert" className="text-sm text-red-700">
          {ackState.error}
        </p>
      )}
    </div>
  );
}

function AnwCheckResultCard({
  result,
  courseId,
  sessions,
}: {
  result: NonNullable<AnwCheckState>["result"];
  courseId: string;
  sessions: SessionRef[];
}) {
  if (!result) return null;
  const isFreigabe = result.status === "freigabe";
  return (
    <div
      className={`space-y-3 rounded-lg border p-4 text-sm ${
        isFreigabe
          ? "border-emerald-200 bg-emerald-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <header className="flex items-center gap-2">
        <span aria-hidden="true">{isFreigabe ? "🟢" : "⚠️"}</span>
        <span className="font-semibold">
          {isFreigabe
            ? "Freigabe — Nachweis kann übermittelt werden"
            : "Nacharbeit empfohlen vor Übermittlung"}
        </span>
      </header>

      {result.warnings.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Compliance- & No-Go-Warnungen
          </h3>
          <ul className="space-y-2">
            {result.warnings.map((w, i) => (
              <li
                key={i}
                className="rounded-md border border-zinc-200 bg-white p-3 text-xs"
              >
                <div className="font-medium text-zinc-800">{w.fundstelle}</div>
                {w.zitat && (
                  <blockquote className="mt-1 border-l-2 border-zinc-300 pl-2 italic text-zinc-600">
                    &bdquo;{w.zitat}&ldquo;
                  </blockquote>
                )}
                <div className="mt-1.5 text-zinc-700">
                  <span className="font-medium">Problem:</span> {w.problem}
                </div>
                <div className="mt-1 text-emerald-800">
                  <span className="font-medium">Vorschlag:</span> {w.vorschlag}
                </div>
                <ApplyWarningButton
                  courseId={courseId}
                  sessions={sessions}
                  zitat={w.zitat}
                  vorschlag={w.vorschlag}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Roter Faden zur Maßnahme
        </h3>
        <p className="whitespace-pre-wrap text-xs text-zinc-700">
          {result.roterFadenFeedback}
        </p>
      </section>

      <footer className="text-[10px] text-zinc-500">
        Hinweis: KI-Auswertung — bitte als Hilfestellung verstehen, nicht als
        rechtsverbindliche Prüfung. Korrigiere Einträge ggf. unter
        &bdquo;Bearbeiten&ldquo; an der betroffenen Session.
      </footer>
    </div>
  );
}

/**
 * „Im Text übernehmen" pro Warnung (analog BER-Checker). Ordnet die Warnung
 * über das exakte `zitat` genau EINEM Termin zu (chirurgisch); nur dann gibt es
 * den Button. Der Server ersetzt das Zitat signatur-erhaltend. Danach markiert
 * die UI die Warnung als übernommen — der Coach prüft den ANW-Check manuell neu
 * (bewusst kein Auto-Re-Run, spart Azure-Kosten).
 */
function ApplyWarningButton({
  courseId,
  sessions,
  zitat,
  vorschlag,
}: {
  courseId: string;
  sessions: SessionRef[];
  zitat: string;
  vorschlag: string;
}) {
  const [state, action, pending] = useActionState<
    ApplyAnwSuggestionState,
    FormData
  >(applyAnwSuggestion, undefined);

  if (state?.ok) {
    return (
      <p className="mt-1.5 text-xs font-medium text-emerald-700">
        ✓ übernommen — bitte den ANW-Check erneut ausführen.
      </p>
    );
  }

  // Nur bei genau EINEM Termin, dessen Thema das Zitat exakt enthält,
  // automatisch übernehmbar; sonst manueller Fallback (kein stiller Fehltreffer).
  const matches = zitat.trim()
    ? sessions.filter((s) => s.topic.includes(zitat))
    : [];
  const match = matches.length === 1 ? matches[0] : null;

  if (!match) {
    return (
      <p className="mt-1.5 text-xs text-zinc-500">
        {matches.length > 1
          ? "Mehrere Termine enthalten diese Stelle — bitte manuell über „Inhalt korrigieren“ übernehmen."
          : "Nicht automatisch zuordenbar — bitte manuell über „Inhalt korrigieren“ übernehmen."}
      </p>
    );
  }

  return (
    <form action={action} className="mt-1.5">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="sessionId" value={match.id} />
      <input type="hidden" name="zitat" value={zitat} />
      <input type="hidden" name="vorschlag" value={vorschlag} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-emerald-400 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 transition enabled:hover:bg-emerald-50 disabled:opacity-40"
      >
        {pending ? "Wird übernommen…" : "✎ Vorschlag im Text übernehmen"}
      </button>
      {state?.error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
