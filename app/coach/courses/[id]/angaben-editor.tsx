"use client";

import { useActionState, useState } from "react";

import { updateCourseAngaben, type UpdateAngabenState } from "./actions";

/**
 * Freies „Angaben / Begründungen (nur bei Bedarf)"-Feld der Maßnahme. Der Coach
 * kann es jederzeit füllen (z. B. genehmigter Urlaubszeitraum des Kunden oder
 * eine Anmerkung, warum in einer Woche nicht zwei Termine möglich waren). Der
 * Text erscheint auf dem Anwesenheitsnachweis unter „Ergänzende Angaben" und im
 * PDF. Speichert per Server-Action; nach Einreichung/Abschluss gesperrt.
 */
export function AngabenEditor({
  courseId,
  angabenText,
  disabled = false,
}: {
  courseId: string;
  angabenText: string | null;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<UpdateAngabenState, FormData>(
    updateCourseAngaben,
    undefined,
  );
  const [value, setValue] = useState(angabenText ?? "");

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="courseId" value={courseId} />
      <label
        htmlFor="angaben"
        className="block text-sm font-medium text-zinc-800"
      >
        Angaben / Begründungen{" "}
        <span className="font-normal text-zinc-500">(nur bei Bedarf)</span>
      </label>
      <p className="text-xs text-zinc-500">
        Z. B. genehmigter Urlaubszeitraum des Kunden während des Coachings oder
        eine Begründung, wenn nicht zwei Termine pro Woche möglich waren.
        Erscheint auf dem Anwesenheitsnachweis und im PDF.
      </p>
      <textarea
        id="angaben"
        name="angaben"
        rows={3}
        maxLength={2000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled || pending}
        placeholder="Optionale Angaben oder Begründungen …"
        className="block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black disabled:bg-zinc-100 disabled:text-zinc-500"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={disabled || pending || value === (angabenText ?? "")}
          className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40"
        >
          {pending ? "Speichern …" : "Speichern"}
        </button>
        {state?.ok && !pending && (
          <span className="text-xs text-emerald-700">Gespeichert.</span>
        )}
        {state?.error && (
          <span className="text-xs text-red-600">{state.error}</span>
        )}
        {disabled && (
          <span className="text-xs text-zinc-500">
            Nach Abschluss nicht mehr änderbar.
          </span>
        )}
      </div>
    </form>
  );
}
