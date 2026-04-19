"use client";

import Link from "next/link";
import { useActionState } from "react";

import { addParticipant, type AddParticipantState } from "../../actions";

export function ParticipantForm({
  courseId,
  courseTitle,
}: {
  courseId: string;
  courseTitle: string;
}) {
  const [state, action, pending] = useActionState<
    AddParticipantState,
    FormData
  >(addParticipant, undefined);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="courseId" value={courseId} />

      <section className="rounded-xl border border-zinc-300 bg-white p-6 space-y-4">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold">Neuer Teilnehmer</h2>
          <p className="text-sm text-zinc-500">
            Für Kurs: <span className="font-medium">{courseTitle}</span>
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Name, Vorname" required autoComplete="off" />
          <Field name="email" label="E-Mail" type="email" required autoComplete="off" />
          <Field
            name="kundenNr"
            label="Kunden-Nr. (AfA)"
            required
            autoComplete="off"
          />
        </div>

        <p className="text-xs text-zinc-500">
          Wenn die E-Mail schon in Signflow existiert, verwenden wir den
          bestehenden Teilnehmer-Datensatz weiter (Name + Kunden-Nr. bleiben
          unverändert).
        </p>
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
          {pending ? "Wird hinzugefügt…" : "Teilnehmer hinzufügen"}
        </button>
        <Link
          href={`/coach/courses/${courseId}`}
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          Abbrechen
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-800">
        {label} {props.required && <span className="text-red-600">*</span>}
      </span>
      <input
        {...props}
        className={`block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black ${className ?? ""}`}
      />
    </label>
  );
}
