"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { type Bundesland, getFeiertag } from "@/lib/feiertage";

import { updateSession, type SessionFormState } from "../../../actions";

type SessionInitial = {
  id: string;
  sessionDate: string;
  topic: string;
  anzahlUe: string;
  modus: "praesenz" | "online";
  isErstgespraech: boolean;
  geeignet: boolean | null;
};

export function SessionEditForm({
  courseId,
  courseTitle,
  bundesland,
  session,
}: {
  courseId: string;
  courseTitle: string;
  bundesland: Bundesland | null;
  session: SessionInitial;
}) {
  const [state, action, pending] = useActionState<SessionFormState, FormData>(
    updateSession,
    undefined,
  );
  const [isErstgespraech, setIsErstgespraech] = useState(session.isErstgespraech);
  const [sessionDate, setSessionDate] = useState(session.sessionDate);

  // Weiche Feiertags-Warnung, identisch zur Neu-Anlage (nur Hinweis, kein Block).
  const feiertag = getFeiertag(sessionDate, bundesland);

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="sessionId" value={session.id} />

      <section className="rounded-xl border border-zinc-300 bg-white p-6 space-y-4">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold">Termin bearbeiten</h2>
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
              Nur Werktage (Mo–Fr). Wochenenden sind gesperrt.
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">
              Modus <span className="text-red-600">*</span>
            </span>
            <select
              name="modus"
              defaultValue={session.modus}
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
                defaultValue={session.anzahlUe}
                placeholder="z.B. 2"
                className="block w-full rounded-lg border border-zinc-500 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              />
            </label>
          )}
        </div>

        {feiertag && (
          <p
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            ⚠️ Der {formatGermanDate(sessionDate)} ist ein Feiertag
            <span className="font-medium"> ({feiertag})</span> — findet hier
            wirklich ein Coaching statt? Speichern bleibt möglich.
          </p>
        )}

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
              Zählt keine UE, braucht aber Entscheidung &bdquo;geeignet JA/NEIN&ldquo;.
            </span>
          </span>
        </label>

        {isErstgespraech && (
          <fieldset className="rounded-lg border border-zinc-300 bg-zinc-50 p-4 space-y-2">
            <legend className="px-1 text-sm font-medium text-zinc-800">
              Teilnehmerin für diese Maßnahme geeignet?{" "}
              <span className="text-red-600">*</span>
            </legend>
            <div className="flex gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="geeignet"
                  value="ja"
                  defaultChecked={session.geeignet === true}
                  required
                />
                Ja
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="geeignet"
                  value="nein"
                  defaultChecked={session.geeignet === false}
                  required
                />
                Nein
              </label>
            </div>
          </fieldset>
        )}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-800">
            Themen / Inhalte <span className="text-red-600">*</span>
          </span>
          <textarea
            name="topic"
            required
            rows={4}
            defaultValue={session.topic}
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

// `YYYY-MM-DD` → `DD.MM.YYYY`, reines String-Splitting (keine Zeitzonen-Falle).
function formatGermanDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}
