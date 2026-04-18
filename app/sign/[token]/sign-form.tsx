"use client";

import { useActionState } from "react";

import { submitParticipantSignature, type SignState } from "./actions";

export function SignForm({
  token,
  sessionId,
}: {
  token: string;
  sessionId: string;
}) {
  const [state, action, pending] = useActionState<SignState, FormData>(
    submitParticipantSignature,
    undefined,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <label className="flex items-start gap-2 text-sm">
        <input name="confirm" type="checkbox" required className="mt-0.5" />
        <span>Ich bestätige meine Teilnahme an dieser Einheit.</span>
      </label>
      {state?.error && (
        <p className="text-xs text-red-700" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Wird bestätigt…" : "Bestätigen"}
      </button>
    </form>
  );
}
