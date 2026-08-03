"use client";

import { useActionState } from "react";

export type NotifyDocState =
  | { error?: string; success?: boolean }
  | undefined;

/**
 * „Teilnehmer erneut benachrichtigen" auf der Dokument-Detailseite (BT & Coach).
 * Schickt die Signatur-Mail (kurs-weiter Magic-Link, 7 Tage gültig) erneut —
 * OHNE das Dokument zurückzuholen, also ohne die erango-Signatur zu verlieren.
 * Nur sinnvoll, solange auf die Teilnehmer-Unterschrift gewartet wird (Status
 * `active`); der Aufrufer blendet den Button sonst aus. `action` ist die
 * rollen-spezifische Server-Action (Coach- bzw. BT-Route).
 */
export function NotifyDocParticipantButton({
  action,
  documentId,
}: {
  action: (prev: NotifyDocState, formData: FormData) => Promise<NotifyDocState>;
  documentId: string;
}) {
  const [state, formAction, pending] = useActionState<NotifyDocState, FormData>(
    (prev, fd) => action(prev, fd),
    undefined,
  );

  const label = pending
    ? "Sende …"
    : state?.success
      ? "✓ Mail gesendet"
      : "Teilnehmer erneut benachrichtigen";

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="documentId" value={documentId} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        title="Dem Teilnehmer die Signatur-Mail (Magic-Link, 7 Tage gültig) erneut schicken — ohne das Dokument zurückzuholen."
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 enabled:hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>
      {state?.error ? (
        <span className="text-xs text-rose-600">{state.error}</span>
      ) : null}
    </form>
  );
}
