"use client";

import { useActionState, useState } from "react";

import { correctSessionTopic, type CorrectTopicState } from "./actions";

/**
 * „Inhalt korrigieren" für bereits signierte Termine: ändert den Themen-/
 * ANW-Text und den Modus (Präsenz/Online), OHNE die Unterschriften oder die
 * Teilnehmer-Freigabe zurückzusetzen. Inline-Formular (mit aktuellen Werten
 * vorbelegt). Für materielle Änderungen (Datum/UE/…) gibt es weiterhin
 * „Bearbeiten (Signaturen zurücksetzen)".
 */
export function CorrectTopicButton({
  courseId,
  sessionId,
  topic,
  modus,
}: {
  courseId: string;
  sessionId: string;
  topic: string;
  modus: "praesenz" | "online";
}) {
  const [state, action, pending] = useActionState<CorrectTopicState, FormData>(
    correctSessionTopic,
    undefined,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition hover:bg-zinc-50"
        title="Nur den Themen-/Inhaltstext korrigieren — Unterschriften & Freigabe bleiben erhalten"
      >
        <span aria-hidden="true">✎</span> Inhalt korrigieren
      </button>
    );
  }

  return (
    <form action={action} className="w-full space-y-2">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <textarea
        name="topic"
        defaultValue={topic}
        rows={3}
        required
        className="block w-full rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm outline-none focus:border-black"
      />
      <label className="flex items-center gap-2 text-xs text-zinc-600">
        <span className="w-14 shrink-0">Modus</span>
        <select
          name="modus"
          defaultValue={modus}
          className="rounded-lg border border-zinc-400 bg-white px-2 py-1.5 text-sm outline-none focus:border-black"
        >
          <option value="praesenz">Präsenz</option>
          <option value="online">Online</option>
        </select>
      </label>
      <p className="text-[10px] text-zinc-500">
        Themen-/Inhaltstext und Modus werden geändert. Unterschriften &amp;
        Freigabe bleiben erhalten. ANW-Check und Bildungsträger-Prüfung laufen
        danach neu.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition enabled:hover:bg-zinc-800 disabled:opacity-40"
        >
          {pending ? "Speichert…" : "Speichern"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
        >
          {state?.success ? "Schließen" : "Abbrechen"}
        </button>
        {state?.success && (
          <span className="text-[10px] text-emerald-700">
            ✓ gespeichert — Unterschriften erhalten
          </span>
        )}
      </div>
      {state?.error && (
        <p role="alert" className="text-[10px] text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
