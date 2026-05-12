"use client";

import { useActionState, useState } from "react";

import { notifyParticipants, type NotifyState } from "./actions";

export function NotifyParticipantsButton({
  courseId,
  participantCount,
  participantsWithPhone,
  smsEnabled,
}: {
  courseId: string;
  participantCount: number;
  /**
   * Anzahl TN mit hinterlegter Mobilnummer. Wird nur fürs UI-Hinweis-Label
   * gebraucht — die Auto-Fallback-Logik im Server-Action behandelt fehlende
   * Nummern stillschweigend (E-Mail statt Fehler).
   */
  participantsWithPhone: number;
  /**
   * Globaler SMS-Feature-Gate. Solange `false`, ist der Channel-Selector
   * komplett unsichtbar und die Action sendet implizit per E-Mail.
   */
  smsEnabled: boolean;
}) {
  const [state, action, pending] = useActionState<NotifyState, FormData>(
    notifyParticipants,
    undefined,
  );
  const [channel, setChannel] = useState<"email" | "sms">("email");

  const disabled = pending || participantCount === 0;
  const smsHint =
    participantsWithPhone === 0
      ? "kein TN hat eine Mobilnummer hinterlegt"
      : participantsWithPhone < participantCount
        ? `${participantsWithPhone} von ${participantCount} TN per SMS, Rest per E-Mail`
        : "alle TN per SMS";

  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="courseId" value={courseId} />
      <input
        type="hidden"
        name="channel"
        value={smsEnabled ? channel : "email"}
      />
      <div className="flex items-center gap-2">
        {smsEnabled && (
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as "email" | "sms")}
            disabled={disabled}
            aria-label="Versandkanal"
            className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm disabled:opacity-40"
          >
            <option value="email">Per E-Mail</option>
            <option value="sms">Per SMS (mit Fallback)</option>
          </select>
        )}
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
          {pending ? "Wird gesendet…" : "Teilnehmer benachrichtigen"}
        </button>
      </div>
      {smsEnabled && channel === "sms" && (
        <p className="text-xs text-zinc-500">{smsHint}</p>
      )}
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
