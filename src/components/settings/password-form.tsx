"use client";

import { useActionState } from "react";

import {
  changePasswordAction,
  type SettingsFormState,
} from "@/lib/settings-actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    changePasswordAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">
          Aktuelles Passwort
        </span>
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">
          Neues Passwort
        </span>
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
        <span className="block text-xs text-zinc-500">
          Mindestens 8 Zeichen.
        </span>
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">
          Neues Passwort bestätigen
        </span>
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
      </label>

      {state?.ok ? (
        <p className="text-sm text-emerald-700" role="status">
          ✓ {state.message}
        </p>
      ) : state?.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Wird gespeichert…" : "Passwort ändern"}
      </button>
    </form>
  );
}
