"use client";

import { useActionState } from "react";

import { resetPasswordAction, type ResetPasswordState } from "./actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<
    ResetPasswordState,
    FormData
  >(resetPasswordAction, undefined);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">
          Neues Passwort
        </span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Bestätigen</span>
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
      </label>
      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Wird gespeichert…" : "Passwort festlegen"}
      </button>
    </form>
  );
}
