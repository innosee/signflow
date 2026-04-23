"use client";

import { useActionState } from "react";

import {
  createBedarfstraeger,
  type BedarfstraegerFormState,
} from "../actions";

export function BedarfstraegerForm() {
  const [state, action, pending] = useActionState<
    BedarfstraegerFormState,
    FormData
  >(createBedarfstraeger, undefined);

  return (
    <form action={action} className="space-y-6">
      <section className="rounded-xl border border-zinc-300 bg-white p-6 space-y-4">
        <Field
          name="name"
          label="Name"
          placeholder="z.B. Jobcenter Singen"
          required
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-800">
            Typ <span className="text-red-600">*</span>
          </legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="type" value="JC" required />
              Jobcenter (JC)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="type" value="AA" />
              Arbeitsagentur (AA)
            </label>
          </div>
        </fieldset>

        <Field
          name="adresse"
          label="Adresse"
          placeholder="Straße, PLZ, Ort (optional)"
        />
        <Field
          name="kontaktPerson"
          label="Ansprechperson"
          placeholder="Name (optional)"
        />
        <Field
          name="email"
          label="E-Mail"
          type="email"
          placeholder="kontakt@jobcenter.de (optional)"
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
          className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Wird angelegt…" : "Anlegen"}
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
