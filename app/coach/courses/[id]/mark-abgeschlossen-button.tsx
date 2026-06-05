"use client";

import { useActionState } from "react";

import {
  markCourseAbgeschlossen,
  type MarkAbgeschlossenState,
} from "./actions";

/**
 * Coach-Klick „Maßnahme als abgeschlossen markieren". Letzter manueller
 * Schritt vor dem FES-Siegel. Der Coach bestätigt damit aktiv, dass keine
 * weiteren Sessions mehr kommen. Bei jeder Session-Änderung wird der
 * Status zurückgesetzt — der Coach muss neu bestätigen.
 *
 * Server-Action prüft selbst die 80%-UE-Quote oder die `flagVorzeitigesEnde`-
 * Begründung. Wir geben deshalb hier keinen disabled-Hinweis basierend auf
 * lokal berechnetem Quotient — die Wahrheit liegt im Server.
 */
export function MarkAbgeschlossenButton({
  courseId,
  disabled,
  disabledReason,
}: {
  courseId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState<MarkAbgeschlossenState, FormData>(
    markCourseAbgeschlossen,
    undefined,
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Maßnahme jetzt als abgeschlossen markieren?\n\nDanach kann sie versiegelt werden. Falls du noch Sessions ergänzt oder eine zurücksetzt, musst du diese Bestätigung erneut geben.",
          )
        ) {
          e.preventDefault();
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <button
        type="submit"
        disabled={pending || disabled}
        title={disabled ? disabledReason : undefined}
        className="rounded-lg border border-zinc-800 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-40"
      >
        {pending ? "Wird bestätigt…" : "Maßnahme als abgeschlossen markieren"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
