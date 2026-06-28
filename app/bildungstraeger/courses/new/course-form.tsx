"use client";

import { useActionState, useState } from "react";

import { BUNDESLAENDER } from "@/lib/feiertage";
import { MASSNAHME_TYPEN, MASSNAHME_TYP_LABEL } from "@/lib/massnahme-typ";

import { createCourse, type CourseFormState } from "../actions";
import { CoachMultiSelect, type CoachOption } from "../coach-multiselect";

type BedarfstraegerOption = {
  id: string;
  name: string;
  type: "JC" | "AA";
};

type CourseFormValues = {
  coachIds: string[];
  avgsNummer: string;
  durchfuehrungsort: string;
  anzahlBewilligteUe: string;
  bedarfstraegerId: string;
  massnahmeTyp: string;
  bundesland: string;
  avgsGueltigVon: string;
  avgsGueltigBis: string;
  startDate: string;
  endDate: string;
  p_name: string;
  p_email: string;
  p_kundennr: string;
};

const EMPTY: CourseFormValues = {
  coachIds: [],
  avgsNummer: "",
  durchfuehrungsort: "",
  anzahlBewilligteUe: "",
  bedarfstraegerId: "",
  massnahmeTyp: "EKC",
  bundesland: "",
  avgsGueltigVon: "",
  avgsGueltigBis: "",
  startDate: "",
  endDate: "",
  p_name: "",
  p_email: "",
  p_kundennr: "",
};

/**
 * Geteiltes Formular für Anlegen UND Bearbeiten eines Kunden. Im Edit-Modus
 * wird eine andere Server-Action + `courseId` (Hidden) übergeben und mit
 * `initial` vorbefüllt.
 */
export function CourseForm({
  bedarfstraeger,
  coaches,
  action = createCourse,
  initial,
  courseId,
  submitLabel = "Kunde anlegen",
}: {
  bedarfstraeger: BedarfstraegerOption[];
  coaches: CoachOption[];
  action?: (
    prev: CourseFormState,
    formData: FormData,
  ) => Promise<CourseFormState>;
  initial?: CourseFormValues;
  courseId?: string;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<CourseFormState, FormData>(
    action,
    undefined,
  );
  // Controlled halten: React 19 setzt das <form> nach jedem Action-Durchlauf
  // automatisch zurück — über useState überleben die Eingaben bei Fehler.
  const [head, setHead] = useState<CourseFormValues>(initial ?? EMPTY);
  // Bestätigung für den „E-Mail ist bereits Kunde"-Hinweis (Stammdaten teilen).
  const [confirmShared, setConfirmShared] = useState(false);
  const setField =
    (key: keyof typeof head) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setHead((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <form action={formAction} className="space-y-8">
      {courseId && <input type="hidden" name="courseId" value={courseId} />}
      <section className="rounded-xl border border-zinc-300 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold">Maßnahme-Daten</h2>

        <div className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">
            Kompetenzteam (Coaches) <span className="text-red-600">*</span>
          </span>
          <CoachMultiSelect
            coaches={coaches}
            value={head.coachIds}
            onChange={(ids) => setHead((prev) => ({ ...prev, coachIds: ids }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="avgsNummer"
            label="Maßnahmen-Nr."
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
              {MASSNAHME_TYPEN.map((t) => (
                <option key={t} value={t}>
                  {MASSNAHME_TYP_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">
              Bundesland <span className="text-red-600">*</span>
            </span>
            <select
              name="bundesland"
              required
              value={head.bundesland}
              onChange={setField("bundesland")}
              className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
            >
              <option value="" disabled>
                Bitte wählen…
              </option>
              {BUNDESLAENDER.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-zinc-500">
              Bestimmt, an welchen Feiertagen die Termin-Anlage warnt.
            </span>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="avgsGueltigVon"
            label="AVGS-Gutschein gültig von"
            type="date"
            required
            value={head.avgsGueltigVon}
            onChange={setField("avgsGueltigVon")}
            hint="Gültigkeit laut Gutschein. Startdatum + erster Termin müssen in dieses Fenster fallen."
          />
          <Field
            name="avgsGueltigBis"
            label="AVGS-Gutschein gültig bis"
            type="date"
            required
            value={head.avgsGueltigBis}
            onChange={setField("avgsGueltigBis")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="startDate"
            label="Startdatum (optional)"
            type="date"
            value={head.startDate}
            onChange={setField("startDate")}
            hint="Wird nach dem Erstgespräch vereinbart und bei der AA/JC eingereicht. Muss in der Gutschein-Gültigkeit liegen."
          />
          <Field
            name="endDate"
            label="Bewilligungsende (optional)"
            type="date"
            value={head.endDate}
            onChange={setField("endDate")}
            hint="Kommt mit der Bewilligung der AA/JC zurück. Der letzte Termin muss ≤ diesem Datum sein."
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

      {state?.duplicateHint && (
        <div
          role="status"
          className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p>{state.duplicateHint}</p>
          <label className="flex items-start gap-2 font-medium">
            <input
              type="checkbox"
              name="confirmShared"
              value="true"
              checked={confirmShared}
              onChange={(e) => setConfirmShared(e.target.checked)}
              className="mt-0.5"
            />
            <span>Verstanden — Stammdaten teilen und trotzdem anlegen.</span>
          </label>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Wird gespeichert…" : submitLabel}
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
        className={`block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black ${className ?? ""}`}
      />
      {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}
