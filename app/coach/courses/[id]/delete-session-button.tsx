"use client";

import { useActionState } from "react";

import { deleteSession, type DeleteSessionState } from "./actions";

/**
 * Löscht einen angelegten Termin (Soft-Delete). Für versehentlich oder doppelt
 * angelegte Termine. Bei bereits signierten Terminen warnt das Confirm härter,
 * weil dabei Signaturen und ggf. die Teilnehmer-Freigabe des Kurses wegfallen
 * (siehe deleteSession-Action).
 *
 * Confirm bewusst per native window.confirm — explizit, kein Modal-Theater.
 */
export function DeleteSessionButton({
  courseId,
  sessionId,
  sessionDate,
  hasSignatures,
}: {
  courseId: string;
  sessionId: string;
  sessionDate: string;
  hasSignatures: boolean;
}) {
  const [state, action, pending] = useActionState<DeleteSessionState, FormData>(
    deleteSession,
    undefined,
  );

  const confirmMessage = hasSignatures
    ? `Termin vom ${sessionDate} endgültig löschen?\n\nDieser Termin ist bereits signiert — seine Signaturen werden mit gelöscht. Falls der Teilnehmer den Nachweis schon final freigegeben hat, wird diese Freigabe verworfen (das Gesamtdokument ändert sich). Alle anderen Termine bleiben erhalten.`
    : `Termin vom ${sessionDate} löschen?\n\nDer Termin wird aus der Maßnahme entfernt. Alle anderen Termine bleiben erhalten.`;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) {
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
        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800 transition enabled:hover:bg-red-100 disabled:opacity-40"
        title="Diesen Termin löschen (Soft-Delete). Signierte Termine verlieren dabei ihre Signaturen."
      >
        <span aria-hidden="true">🗑</span>
        {pending ? "Wird gelöscht…" : "Löschen"}
      </button>
      {state?.error && (
        <span role="alert" className="text-[10px] text-red-700">
          {state.error}
        </span>
      )}
    </form>
  );
}
