"use client";

import { useActionState } from "react";

import {
  forgotPasswordAction,
  type ForgotPasswordState,
} from "./actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ForgotPasswordState, FormData>(
    forgotPasswordAction,
    undefined,
  );

  if (state?.sent) {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
        Falls ein Konto zu dieser E-Mail existiert, haben wir dir einen Link zum
        Zurücksetzen geschickt. Prüfe bitte auch den Spam-Ordner.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">E-Mail</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
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
        {pending ? "Wird versendet…" : "Link zum Zurücksetzen senden"}
      </button>
    </form>
  );
}
