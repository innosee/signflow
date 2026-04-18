"use client";

import { useActionState, useState } from "react";

import { createCourse, type CourseFormState } from "../actions";

type ParticipantRow = {
  key: string;
  name: string;
  email: string;
  kundenNr: string;
};

type BedarfstraegerOption = {
  id: string;
  name: string;
  type: "JC" | "AA";
};

function blankRow(): ParticipantRow {
  return {
    key: crypto.randomUUID(),
    name: "",
    email: "",
    kundenNr: "",
  };
}

export function CourseForm({
  bedarfstraeger,
}: {
  bedarfstraeger: BedarfstraegerOption[];
}) {
  const [state, action, pending] = useActionState<CourseFormState, FormData>(
    createCourse,
    undefined,
  );
  const [rows, setRows] = useState<ParticipantRow[]>([blankRow()]);

  const update = (key: string, patch: Partial<ParticipantRow>) =>
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  const add = () => setRows((prev) => [...prev, blankRow()]);
  const remove = (key: string) =>
    setRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r.key !== key) : prev,
    );

  return (
    <form action={action} className="space-y-8">
      <section className="rounded-xl border border-zinc-300 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold">Kursdaten</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="title" label="Titel (AVGS-Maßnahme)" required />
          <Field name="avgsNummer" label="AVGS-Nr." required />
          <Field
            name="durchfuehrungsort"
            label="Durchführungs-Ort"
            placeholder="Online oder Anschrift"
            required
          />
          <Field
            name="anzahlBewilligteUe"
            label="Bewilligte UE"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
          />
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">
            Bedarfsträger <span className="text-red-600">*</span>
          </span>
          <select
            name="bedarfstraegerId"
            required
            defaultValue=""
            className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
          >
            <option value="" disabled>
              Bitte wählen…
            </option>
            {bedarfstraeger.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.type})
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="startDate" label="Startdatum" type="date" required />
          <Field name="endDate" label="Enddatum" type="date" required />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Teilnehmer</h2>
          <span className="text-xs text-zinc-500">
            Mindestens ein Teilnehmer.
          </span>
        </div>

        <div className="space-y-3">
          {rows.map((r, idx) => (
            <div
              key={r.key}
              className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <input
                name="p_name"
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value })}
                placeholder="Name, Vorname"
                required
                className="rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              />
              <input
                name="p_email"
                type="email"
                value={r.email}
                onChange={(e) => update(r.key, { email: e.target.value })}
                placeholder="E-Mail"
                required
                className="rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              />
              <input
                name="p_kundennr"
                value={r.kundenNr}
                onChange={(e) => update(r.key, { kundenNr: e.target.value })}
                placeholder="Kunden-Nr. (AfA)"
                required
                className="rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              />
              <button
                type="button"
                onClick={() => remove(r.key)}
                disabled={rows.length <= 1}
                aria-label={`Zeile ${idx + 1} entfernen`}
                className="rounded-lg border border-zinc-500 px-3 text-sm hover:bg-zinc-50 disabled:opacity-40"
              >
                −
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
        >
          + Teilnehmer hinzufügen
        </button>
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
          {pending ? "Wird angelegt…" : "Kurs anlegen"}
        </button>
        <a
          href="/coach"
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
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      <input
        {...props}
        className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
      />
    </label>
  );
}
