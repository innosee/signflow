"use client";

import { useActionState } from "react";

import {
  sendPreviewToParticipants,
  type NotifyState,
} from "./actions";

export function SendPreviewButton({
  courseId,
  disabled,
  disabledReason,
  alreadySent,
}: {
  courseId: string;
  disabled: boolean;
  disabledReason?: string;
  alreadySent: boolean;
}) {
  const [state, action, pending] = useActionState<NotifyState, FormData>(
    sendPreviewToParticipants,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col items-start gap-1.5">
      <input type="hidden" name="courseId" value={courseId} />
      <button
        type="submit"
        disabled={disabled || pending}
        title={disabled ? disabledReason : undefined}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
      >
        {pending
          ? "Wird gesendet…"
          : alreadySent
            ? "Preview erneut senden"
            : "Preview an Teilnehmer senden"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-700">
          {state.error}
        </p>
      )}
      {state?.success != null && (
        <p className="text-xs text-green-700">
          {state.success}{" "}
          {state.success === 1
            ? "Preview-Link verschickt"
            : "Preview-Links verschickt"}
          {state.failedEmails?.length
            ? ` · Fehler bei: ${state.failedEmails.join(", ")}`
            : ""}
        </p>
      )}
    </form>
  );
}
