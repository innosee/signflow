"use client";

import { useActionState } from "react";

import { reopenSession, type ReopenSessionState } from "./actions";

/**
 * Öffnet eine bereits signierte Session zum Bearbeiten der Termin-Daten
 * (Datum/UE/Modus/Erstgespräch). Scope bewusst eng: NUR die Signaturen
 * GENAU DIESES Termins werden zurückgesetzt — alle anderen Termine bleiben
 * signiert. Maßnahmenweit fällt nur die finale TN-Freigabe weg, weil sich
 * das Gesamtdokument ändert (siehe reopenSession-Action).
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
            "Termin-Daten bearbeiten (Datum / UE / Erstgespräch)?\n\nNur die Signaturen DIESES Termins werden zurückgesetzt — Coach und Teilnehmer unterschreiben danach nur diesen einen Termin neu. Alle anderen Termine bleiben signiert.\n\nFalls der Teilnehmer den Nachweis schon final freigegeben hat, wird diese Freigabe verworfen (das Gesamtdokument ändert sich).",
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
        title="Datum / UE / Modus / Erstgespräch dieses Termins ändern — nur die Signaturen DIESES Termins werden dabei zurückgesetzt, alle anderen Termine bleiben signiert"
      >
        <span aria-hidden="true">✎</span>
        {pending ? "Wird geöffnet…" : "Termin-Daten bearbeiten"}
      </button>
      {state?.error && (
        <span role="alert" className="text-[10px] text-red-700">
          {state.error}
        </span>
      )}
    </form>
  );
}
