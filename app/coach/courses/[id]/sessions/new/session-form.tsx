"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { type Bundesland, getFeiertag } from "@/lib/feiertage";

import { createSession, type SessionFormState } from "../../actions";
import { CoachAssignmentField } from "../coach-assignment-field";
import { EignungAnalyseFieldset } from "../eignung-fieldset";

export function SessionForm({
  courseId,
  courseTitle,
  bundesland,
  erstgespraechExists = false,
  coaches,
  defaultCoachId,
}: {
  courseId: string;
  courseTitle: string;
  bundesland: Bundesland | null;
  /** #4: Existiert schon ein Erstgespräch, wird die Option ausgeblendet. */
  erstgespraechExists?: boolean;
  /** Kompetenzteams: zuweisbare Coaches des Tenants (inkl. Lead). */
  coaches: Array<{ id: string; name: string }>;
  /** Vorausgewählter Coach (= Lead-Coach des Kurses). */
  defaultCoachId: string;
}) {
  const [state, action, pending] = useActionState<SessionFormState, FormData>(
    createSession,
    undefined,
  );
  const [isErstgespraech, setIsErstgespraech] = useState(false);
  const [sessionDate, setSessionDate] = useState("");

  // Weiche Warnung: Coaching findet an Feiertagen i.d.R. nicht statt. Nur ein
  // Hinweis, kein Block — Ausnahmen kommen vor (anders als das harte Wochenend-
  // Gate in der Server-Action). `null`-Bundesland (Bestandskunde) → keine
  // Warnung.
  const feiertag = getFeiertag(sessionDate, bundesland);

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="courseId" value={courseId} />

      <section className="rounded-xl border border-zinc-300 bg-white p-6 space-y-4">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold">Neuer Termin</h2>
          <p className="text-sm text-zinc-500">
            Für Kunde: <span className="font-medium">{courseTitle}</span>
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">
              Datum <span className="text-red-600">*</span>
            </span>
            <input
              type="date"
              name="sessionDate"
              required
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
            />
            <span className="text-xs text-zinc-500">
              Mo–Sa möglich. Sonntage sind gesperrt, Feiertage werden markiert.
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">
              Modus <span className="text-red-600">*</span>
            </span>
            <select
              name="modus"
              defaultValue="praesenz"
              required
              className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
            >
              <option value="praesenz">Präsenz</option>
              <option value="online">Online</option>
            </select>
          </label>

          {!isErstgespraech && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-800">
                UE <span className="text-red-600">*</span>
              </span>
              <input
                type="number"
                name="anzahlUe"
                step="0.5"
                min="0.5"
                max="24"
                required
                placeholder="z.B. 2"
                className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              />
            </label>
          )}
        </div>

        <CoachAssignmentField coaches={coaches} defaultCoachId={defaultCoachId} />

        {feiertag && (
          <p
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            ⚠️ Der {formatGermanDate(sessionDate)} ist ein Feiertag
            <span className="font-medium"> ({feiertag})</span> — findet hier
            wirklich ein Coaching statt? Anlegen bleibt möglich.
          </p>
        )}

        {erstgespraechExists ? (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            Für diese Maßnahme ist bereits ein Erstgespräch erfasst — ein
            zweites ist nicht möglich.
          </p>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="isErstgespraech"
              checked={isErstgespraech}
              onChange={(e) => setIsErstgespraech(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Erstgespräch</span>
              <span className="block text-xs text-zinc-500">
                Zählt keine UE, braucht aber die Eignungsanalyse.
              </span>
            </span>
          </label>
        )}

        {!erstgespraechExists && isErstgespraech && <EignungAnalyseFieldset />}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">
            Themen / Inhalte <span className="text-red-600">*</span>
          </span>
          <textarea
            name="topic"
            required
            rows={4}
            placeholder="z.B. Lebenslauf-Feedback, Bewerbungstraining, Zielklärung"
            className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
          />
        </label>

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
          {pending ? "Wird angelegt…" : "Termin anlegen"}
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

// `YYYY-MM-DD` → `DD.MM.YYYY`. Keine Date-Parsing-Konvertierung (Zeitzonen-
// Falle), reines String-Splitting — `sessionDate` ist ein Kalendertag.
function formatGermanDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}
