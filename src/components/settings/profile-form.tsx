"use client";

import { useActionState } from "react";

import {
  updateProfileAction,
  type SettingsFormState,
} from "@/lib/settings-actions";

export function ProfileForm({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    updateProfileAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">Name</span>
        <input
          name="name"
          type="text"
          defaultValue={initialName}
          required
          minLength={2}
          maxLength={120}
          className="block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-zinc-800">E-Mail</span>
        <input
          type="email"
          value={email}
          readOnly
          className="block w-full cursor-not-allowed rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 outline-none"
        />
        <span className="block text-xs text-zinc-500">
          E-Mail-Änderung folgt mit Bestätigungs-Flow im nächsten Release.
          Bis dahin bitte beim Bildungsträger anfragen.
        </span>
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
        {pending ? "Wird gespeichert…" : "Speichern"}
      </button>
    </form>
  );
}
