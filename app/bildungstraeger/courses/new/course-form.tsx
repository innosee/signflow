"use client";

import { useActionState, useState } from "react";

import { createCourse, type CourseFormState } from "../actions";

type BedarfstraegerOption = {
  id: string;
  name: string;
  type: "JC" | "AA";
};

type CoachOption = {
  id: string;
  name: string;
  signingEnabled: boolean;
};

export function CourseForm({
  bedarfstraeger,
  coaches,
}: {
  bedarfstraeger: BedarfstraegerOption[];
  coaches: CoachOption[];
}) {
  const [state, action, pending] = useActionState<CourseFormState, FormData>(
    createCourse,
    undefined,
  );
  // Controlled halten: React 19 setzt das <form> nach jedem Action-Durchlauf
  // automatisch zurück — über useState überleben die Eingaben bei Fehler.
  const [head, setHead] = useState({
    coachId: "",
    title: "",
    avgsNummer: "",
    durchfuehrungsort: "",
    anzahlBewilligteUe: "",
    bedarfstraegerId: "",
    massnahmeTyp: "EKC",
    startDate: "",
    endDate: "",
    p_name: "",
    p_email: "",
    p_kundennr: "",
  });
  const setField =
    (key: keyof typeof head) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setHead((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <form action={action} className="space-y-8">
      <section className="rounded-xl border border-zinc-300 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold">Maßnahme-Daten</h2>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">
            Coach zuweisen <span className="text-red-600">*</span>
          </span>
          <select
            name="coachId"
            required
            value={head.coachId}
            onChange={setField("coachId")}
            className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
          >
            <option value="" disabled>
              Coach wählen…
            </option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.signingEnabled ? "" : " (Signatur nicht freigeschaltet)"}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="title"
            label="Titel (AVGS-Maßnahme)"
            required
            value={head.title}
            onChange={setField("title")}
          />
          <Field
            name="avgsNummer"
            label="AVGS-Nr."
            required
            value={head.avgsNummer}
            onChange={setField("avgsNummer")}
          />
          <Field
            name="durchfuehrungsort"
            label="Durchführungs-Ort"
            placeholder="Online oder Anschrift"
            required
            value={head.durchfuehrungsort}
            onChange={setField("durchfuehrungsort")}
          />
          <Field
            name="anzahlBewilligteUe"
            label="Bewilligte UE"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
            value={head.anzahlBewilligteUe}
            onChange={setField("anzahlBewilligteUe")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">
              Bedarfsträger <span className="text-red-600">*</span>
            </span>
            <select
              name="bedarfstraegerId"
              required
              value={head.bedarfstraegerId}
              onChange={setField("bedarfstraegerId")}
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
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">
              Maßnahmentyp <span className="text-red-600">*</span>
            </span>
            <select
              name="massnahmeTyp"
              required
              value={head.massnahmeTyp}
              onChange={setField("massnahmeTyp")}
              className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
            >
              <option value="EKC">EKC — Karriere-Coaching</option>
              <option value="ESC">ESC — Standort-Coaching</option>
              <option value="EGC">EGC — Gründungs-Coaching</option>
              <option value="ESCA">ESCA — Ausbildungs-Coaching / Probezeit</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="startDate"
            label="Startdatum"
            type="date"
            required
            value={head.startDate}
            onChange={setField("startDate")}
          />
          <Field
            name="endDate"
            label="Enddatum"
            type="date"
            required
            value={head.endDate}
            onChange={setField("endDate")}
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Kunde</h2>
          <span className="text-xs text-zinc-500">
            Genau ein Kunde pro Maßnahme.
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            name="p_name"
            label="Name, Vorname"
            required
            value={head.p_name}
            onChange={setField("p_name")}
          />
          <Field
            name="p_email"
            label="E-Mail"
            type="email"
            required
            value={head.p_email}
            onChange={setField("p_email")}
          />
          <Field
            name="p_kundennr"
            label="Kunden-Nr. (AfA)"
            required
            value={head.p_kundennr}
            onChange={setField("p_kundennr")}
          />
        </div>
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
          {pending ? "Wird angelegt…" : "Kunde anlegen"}
        </button>
        <a
          href="/bildungstraeger/courses"
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
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      <input
        {...props}
        className={`block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black ${className ?? ""}`}
      />
    </label>
  );
}
