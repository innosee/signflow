"use client";

import { useActionState } from "react";
import Link from "next/link";

import { loginAction, type LoginFormState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(
    loginAction,
    undefined,
  );

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
      <label className="block space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-800">Passwort</span>
          <Link
            href="/forgot-password"
            className="text-xs text-zinc-600 underline underline-offset-2 hover:text-black"
          >
            Passwort vergessen?
          </Link>
        </div>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
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
        {pending ? "Wird angemeldet…" : "Anmelden"}
      </button>
    </form>
  );
}
