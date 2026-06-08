"use client";

import { useActionState } from "react";

import { reopenSession, type ReopenSessionState } from "./actions";

/**
 * Setzt eine bereits signierte Session in den Bearbeiten-Modus zurück.
 * Hart: alle Signaturen dieser Session UND alle TN-Approvals des Kurses
 * werden gelöscht. Coach + TN müssen danach neu signieren.
 *
 * Confirm bewusst per native window.confirm — rudimentär aber explizit.
 * Kein Modal-Theater, der Coach weiß was er tut.
 */
export function ReopenSessionButton({
  courseId,
  sessionId,
}: {
  courseId: string;
  sessionId: string;
}) {
  const [state, action, pending] = useActionState<ReopenSessionState, FormData>(
    reopenSession,
    undefined,
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Diese Session wieder öffnen?\n\nAlle Signaturen dieser Session UND alle TN-Freigaben dieses Kurses werden gelöscht. Coach und Teilnehmer müssen danach neu unterschreiben.",
          )
        ) {
          e.preventDefault();
        }
      }}
      className="inline-flex flex-col items-start gap-0.5"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 transition hover:bg-amber-100 disabled:opacity-40"
        title="Session bearbeiten — bestehende Signaturen + TN-Freigaben werden dabei zurückgesetzt"
      >
        <span aria-hidden="true">↻</span>
        {pending
          ? "Wird zurückgesetzt…"
          : "Bearbeiten (Signaturen zurücksetzen)"}
      </button>
      {state?.error && (
        <span role="alert" className="text-[10px] text-red-700">
          {state.error}
        </span>
      )}
    </form>
  );
}
