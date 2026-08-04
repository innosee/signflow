"use client";

import { useActionState } from "react";

import { confirmCourseAnalog, type ConfirmAnalogState } from "./actions";

/**
 * Analog-Modus (Papier): ersetzt das digitale Signieren am Stundennachweis.
 * Der Coach lädt den händisch unterschriebenen ANW-Scan (PDF) hoch und
 * bestätigt „Papier unterschrieben & abgelegt". Das schaltet die
 * BT-Einreichung frei und liefert das finale PDF (der Scan wird ausgeliefert).
 * Ein bereits bestätigter Scan lässt sich erneut hochladen (überschreibt).
 */
export function AnalogConfirmPanel({
  courseId,
  anwPdfUrl,
  confirmedAt,
}: {
  courseId: string;
  /** Download-Link für die leere ANW-PDF-Vorlage (zum Ausdrucken). */
  anwPdfUrl: string;
  /** ISO-Zeitstempel der letzten Bestätigung oder null. */
  confirmedAt: string | null;
}) {
  const [state, action, pending] = useActionState<ConfirmAnalogState, FormData>(
    confirmCourseAnalog,
    undefined,
  );

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
        <li>
          <a
            href={anwPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline"
          >
            Leere ANW-Vorlage als PDF herunterladen
          </a>{" "}
          und ausdrucken.
        </li>
        <li>Von Coach und Teilnehmer auf Papier unterschreiben lassen.</li>
        <li>Unterschriebenes Blatt scannen (als PDF) und hier hochladen.</li>
      </ol>

      {confirmedAt && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ Papier bestätigt am{" "}
          {new Date(confirmedAt).toLocaleString("de-DE")}. Du kannst bei Bedarf
          eine korrigierte Version erneut hochladen.
        </p>
      )}

      <form action={action} className="space-y-2">
        <input type="hidden" name="courseId" value={courseId} />
        <input
          type="file"
          name="scan"
          accept="application/pdf"
          required
          className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-50"
        />
        <label className="flex items-start gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="confirm"
            value="on"
            required
            className="mt-0.5"
          />
          <span>
            Ich bestätige: Der Stundennachweis wurde auf Papier von Coach und
            Teilnehmer unterschrieben und wird im Original abgelegt.
          </span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-zinc-800 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition enabled:hover:bg-zinc-50 disabled:opacity-40"
        >
          {pending
            ? "Wird hochgeladen…"
            : confirmedAt
              ? "Neuen Scan hochladen & bestätigen"
              : "Papier unterschrieben & abgelegt"}
        </button>
        {state?.error && (
          <p role="alert" className="text-xs text-red-700">
            {state.error}
          </p>
        )}
        {state?.success && (
          <p className="text-xs text-emerald-700">
            Scan gespeichert. Du kannst jetzt beim Bildungsträger einreichen.
          </p>
        )}
      </form>
    </div>
  );
}
