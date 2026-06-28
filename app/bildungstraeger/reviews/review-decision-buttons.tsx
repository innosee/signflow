"use client";

import { useActionState, useState } from "react";

import {
  approveCourseReview,
  requestCourseChanges,
  type ReviewDecisionState,
} from "./actions";

/**
 * Entscheidungs-Panel des Bildungsträgers für eine zur Prüfung eingereichte
 * Anwesenheitsliste. Ein gemeinsames Notizfeld speist beide Aktionen:
 *   - „Freigeben"               → Notiz optional, schaltet den FES-Button frei
 *   - „Nachbesserung anfordern" → Notiz Pflicht, Coach kann dann korrigieren
 */
export function ReviewDecisionButtons({ courseId }: { courseId: string }) {
  const [note, setNote] = useState("");

  const [approveState, approveAction, approvePending] = useActionState<
    ReviewDecisionState,
    FormData
  >(approveCourseReview, undefined);
  const [changesState, changesAction, changesPending] = useActionState<
    ReviewDecisionState,
    FormData
  >(requestCourseChanges, undefined);

  const pending = approvePending || changesPending;
  const error = approveState?.error ?? changesState?.error;

  return (
    <div className="space-y-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Notiz an den Coach (bei Nachbesserung Pflicht, bei Freigabe optional)…"
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <div className="flex flex-wrap gap-3">
        <form action={approveAction}>
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="note" value={note} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition enabled:hover:bg-emerald-700 disabled:opacity-40"
          >
            {approvePending ? "Wird freigegeben…" : "Freigeben"}
          </button>
        </form>
        <form
          action={changesAction}
          onSubmit={(e) => {
            if (note.trim().length === 0) {
              e.preventDefault();
              window.alert(
                "Bitte beschreibe im Notizfeld, was nachgebessert werden soll.",
              );
            }
          }}
        >
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="note" value={note} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition enabled:hover:bg-amber-50 disabled:opacity-40"
          >
            {changesPending ? "Wird gesendet…" : "Nachbesserung anfordern"}
          </button>
        </form>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
