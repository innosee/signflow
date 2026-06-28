"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  updateParticipant,
  type UpdateParticipantState,
} from "../../../actions";

export function EditParticipantForm({
  courseId,
  courseTitle,
  participantId,
  initial,
  smsEnabled,
  enrolledInOtherCourses,
}: {
  courseId: string;
  courseTitle: string;
  participantId: string;
  initial: {
    name: string;
    email: string;
    kundenNr: string;
    phone: string | null;
  };
  smsEnabled: boolean;
  /**
   * Anzahl WEITERER Kurse, in denen dieser TN eingeschrieben ist.
   * Wenn > 0, zeigen wir einen Hinweis, dass Stammdaten-Änderungen
   * auch in den anderen Kursen sichtbar werden.
   */
  enrolledInOtherCourses: number;
}) {
  const [state, action, pending] = useActionState<
    UpdateParticipantState,
    FormData
  >(updateParticipant, undefined);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="participantId" value={participantId} />

      <section className="rounded-xl border border-zinc-300 bg-white p-6 space-y-4">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold">Teilnehmer bearbeiten</h2>
          <p className="text-sm text-zinc-500">
            Für Kurs: <span className="font-medium">{courseTitle}</span>
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="name"
            label="Name, Vorname"
            required
            autoComplete="off"
            defaultValue={initial.name}
          />
          <Field
            name="email"
            label="E-Mail"
            type="email"
            required
            autoComplete="off"
            defaultValue={initial.email}
          />
          <Field
            name="kundenNr"
            label="Kunden-Nr. (AfA)"
            required
            autoComplete="off"
            defaultValue={initial.kundenNr}
          />
          {smsEnabled && (
            <Field
              name="phone"
              label="Mobilnummer (optional)"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="+4915712345678 oder 0157 1234567"
              defaultValue={initial.phone ?? ""}
            />
          )}
        </div>

        {enrolledInOtherCourses > 0 && (
          <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            Hinweis: Dieser Teilnehmer ist in {enrolledInOtherCourses}{" "}
            {enrolledInOtherCourses === 1 ? "weiteren Kurs" : "weiteren Kursen"}{" "}
            eingeschrieben. Änderungen an den Stammdaten wirken auch dort.
          </p>
        )}
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
          {pending ? "Wird gespeichert…" : "Änderungen speichern"}
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
