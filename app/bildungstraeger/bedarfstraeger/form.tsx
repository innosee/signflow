"use client";

import { useActionState } from "react";

import type { BedarfstraegerFormState } from "./actions";

type BedarfstraegerType = "JC" | "AA";

export type BedarfstraegerInitial = {
  name: string;
  type: BedarfstraegerType;
  adresse: string | null;
  kontaktPerson: string | null;
  email: string | null;
};

/**
 * Gemeinsames Formular für Anlegen und Bearbeiten. Beide Server-Actions teilen
 * die Signatur `(prev, formData) => state`; beim Bearbeiten trägt ein verstecktes
 * `id`-Feld den Datensatz (die Action scoped zusätzlich auf den Tenant).
 */
export function BedarfstraegerForm({
  action,
  initial,
  bedarfstraegerId,
  submitLabel,
  pendingLabel,
}: {
  action: (
    prev: BedarfstraegerFormState,
    formData: FormData,
  ) => Promise<BedarfstraegerFormState>;
  initial?: BedarfstraegerInitial;
  bedarfstraegerId?: string;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState<
    BedarfstraegerFormState,
    FormData
  >(action, undefined);

  return (
    <form action={formAction} className="space-y-6">
      {bedarfstraegerId && (
        <input type="hidden" name="id" value={bedarfstraegerId} />
      )}
      <section className="rounded-xl border border-zinc-300 bg-white p-6 space-y-4">
        <Field
          name="name"
          label="Name"
          placeholder="z.B. Jobcenter Singen"
          defaultValue={initial?.name}
          required
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-800">
            Typ <span className="text-red-600">*</span>
          </legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="type"
                value="JC"
                defaultChecked={initial?.type === "JC"}
                required
              />
              Jobcenter (JC)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="type"
                value="AA"
                defaultChecked={initial?.type === "AA"}
              />
              Arbeitsagentur (AA)
            </label>
          </div>
        </fieldset>

        <Field
          name="adresse"
          label="Adresse"
          placeholder="Straße, PLZ, Ort (optional)"
          defaultValue={initial?.adresse ?? undefined}
        />
        <Field
          name="kontaktPerson"
          label="Ansprechperson"
          placeholder="Name (optional)"
          defaultValue={initial?.kontaktPerson ?? undefined}
        />
        <Field
          name="email"
          label="E-Mail"
          type="email"
          placeholder="kontakt@jobcenter.de (optional)"
          defaultValue={initial?.email ?? undefined}
        />
      </section>

      {state?.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? pendingLabel : submitLabel}
        </button>
        <a
          href="/bildungstraeger/bedarfstraeger"
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          Abbrechen
        </a>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-800">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input
        {...props}
        required={required}
        className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
      />
    </label>
  );
}
