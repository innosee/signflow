"use client";

import { useActionState } from "react";

import { notifyParticipants, type NotifyState } from "./actions";

/**
 * Bulk-Benachrichtigung aller TN per E-Mail. SMS ist bewusst KEIN Bulk-
 * Channel — der Coach soll SMS nur als gezielte Reaktion auf einen
 * stillen TN auslösen (siehe `SmsResendButton`). Das hält die Kosten
 * unter Kontrolle und gibt dem Coach pro-TN-Entscheidung statt
 * Massen-Versand auf seine eigene Rechnung.
 */
export function NotifyParticipantsButton({
  courseId,
  participantCount,
}: {
  courseId: string;
  participantCount: number;
}) {
  const [state, action, pending] = useActionState<NotifyState, FormData>(
    notifyParticipants,
    undefined,
  );

  const disabled = pending || participantCount === 0;

  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="courseId" value={courseId} />
      <button
        type="submit"
        disabled={disabled}
        title={
          participantCount === 0
            ? "Erst Teilnehmer zum Kurs hinzufügen"
            : undefined
        }
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
      >
        {pending ? "Wird gesendet…" : "Teilnehmer per E-Mail benachrichtigen"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
      {state?.success != null && (
        <p className="text-xs text-green-700">
          {state.success}{" "}
          {state.success === 1 ? "Magic-Link verschickt" : "Magic-Links verschickt"}
          {state.failedEmails?.length
            ? ` · Fehler bei: ${state.failedEmails.join(", ")}`
            : ""}
        </p>
      )}
    </form>
  );
}
