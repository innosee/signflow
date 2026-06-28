"use client";

import { useActionState, useState } from "react";

import {
  requestBildungstraegerReview,
  type RequestReviewState,
} from "./actions";

/**
 * Coach reicht die fertige, vom Kunden freigegebene Anwesenheitsliste beim
 * Bildungsträger zur Prüfung ein (FES-Gate 3/3). Optionale Notiz an den BT.
 * Bei `resubmit` (nach Nachbesserung) ändert sich nur das Wording.
 *
 * Disabled-Wahrheit liegt serverseitig (`requestBildungstraegerReview`);
 * der `disabled`-Prop graut den Button nur vorab, mit Tooltip-Grund.
 */
export function ReviewSubmitButton({
  courseId,
  resubmit,
  disabled,
  disabledReason,
}: {
  courseId: string;
  resubmit?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState<RequestReviewState, FormData>(
    requestBildungstraegerReview,
    undefined,
  );
  // Nach einer Nachbesserung das Antwortfeld direkt offen zeigen — der Coach
  // soll auf die Rückmeldung des BT antworten können, ohne es erst suchen zu
  // müssen. Bei der Erst-Einreichung bleibt die Notiz optional/eingeklappt.
  const [showNote, setShowNote] = useState(!!resubmit);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="courseId" value={courseId} />
      {showNote ? (
        <div className="space-y-1">
          {resubmit && (
            <label className="block text-xs font-medium text-zinc-700">
              Deine Antwort an den Bildungsträger
            </label>
          )}
          <textarea
            name="note"
            rows={3}
            placeholder={
              resubmit
                ? "z.B. weil der letzte Termin einzeln in eine Woche fiel …"
                : "Optionale Notiz an den Bildungsträger…"
            }
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>
      ) : (
        !disabled && (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="text-xs text-zinc-500 underline-offset-2 hover:underline"
          >
            + Notiz an den Bildungsträger hinzufügen
          </button>
        )
      )}
      <div>
        <button
          type="submit"
          disabled={pending || disabled}
          title={disabled ? disabledReason : undefined}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-40"
        >
          {pending
            ? "Wird eingereicht…"
            : resubmit
              ? "Antwort senden & erneut einreichen"
              : "Zur Prüfung einreichen"}
        </button>
      </div>
      {state?.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
