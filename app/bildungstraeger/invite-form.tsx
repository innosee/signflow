"use client";

import { useActionState, useEffect, useRef } from "react";

import { inviteCoach, type InviteFormState } from "./actions";

export function InviteCoachForm() {
  const [state, action, pending] = useActionState<InviteFormState, FormData>(
    inviteCoach,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="name"
          type="text"
          placeholder="Name"
          required
          className="rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
        <input
          name="email"
          type="email"
          placeholder="coach@example.de"
          required
          className="rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Wird versendet…" : "Einladung versenden"}
      </button>
      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-green-700">{state.success}</p>
      )}
    </form>
  );
}
