"use client";

import { useActionState } from "react";

import { submitParticipantSignature, type SignState } from "./actions";

export function SignForm({ token, name }: { token: string; name: string }) {
  const [state, action, pending] = useActionState<SignState, FormData>(
    submitParticipantSignature,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="flex items-start gap-3 rounded-lg border border-zinc-500 bg-white p-4">
        <input
          name="confirm"
          type="checkbox"
          required
          className="mt-0.5 h-4 w-4"
        />
        <span className="text-sm">
          Ich, <strong>{name}</strong>, bestätige meine Anwesenheit an dieser
          Einheit.
        </span>
      </label>
      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Wird bestätigt…" : "Anwesenheit bestätigen"}
      </button>
    </form>
  );
}
