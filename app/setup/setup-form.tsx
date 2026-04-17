"use client";

import { useActionState } from "react";

import { bootstrapAgency, type SetupFormState } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState<SetupFormState, FormData>(
    bootstrapAgency,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <Field label="Name" name="name" type="text" required />
      <Field label="E-Mail" name="email" type="email" required />
      <Field
        label="Passwort"
        name="password"
        type="password"
        required
        minLength={8}
        hint="Mindestens 8 Zeichen."
      />
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
        {pending ? "Wird angelegt…" : "Agency-Account anlegen"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      <input
        {...props}
        className="block w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black"
      />
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}
