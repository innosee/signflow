"use client";

import { useActionState } from "react";

import { approveFinalDocument, type ApproveState } from "./actions";

export function ApproveForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ApproveState, FormData>(
    approveFinalDocument,
    undefined,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <label className="flex items-start gap-2 text-sm">
        <input name="confirm" type="checkbox" required className="mt-0.5" />
        <span>
          Ich habe den Stundennachweis geprüft und gebe ihn hiermit für die
          Übermittlung an die Agentur für Arbeit frei.
        </span>
      </label>
      {state?.error && (
        <p className="text-xs text-red-700" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Wird freigegeben…" : "Nachweis freigeben"}
      </button>
    </form>
  );
}
