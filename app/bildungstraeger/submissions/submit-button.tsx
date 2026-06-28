"use client";

import { useState } from "react";
import { useActionState } from "react";

import { submitCourseToAfa, type SubmitAfaState } from "../actions";

/**
 * Manueller „als an die AfA übermittelt markieren"-Haken. Bewusst ein zwei-
 * stufiger Confirm (Klick → Bestätigen), damit die Markierung nicht versehent-
 * lich mit einem Klick passiert — sie ist nur ein visueller Status, kein echter
 * Versand (der kommt später mit dem Rechnungs-Feature).
 */
export function SubmitAfaButton({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState<SubmitAfaState, FormData>(
    submitCourseToAfa,
    undefined,
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="courseId" value={courseId} />
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600">Sicher?</span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white enabled:hover:bg-zinc-800 disabled:opacity-40"
          >
            {pending ? "Wird markiert…" : "Ja, als übermittelt markieren"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            Abbrechen
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-zinc-400 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Als übermittelt markieren
        </button>
      )}
      {state?.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
