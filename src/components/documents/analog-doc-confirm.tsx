"use client";

import { useActionState } from "react";

import type { DocumentEditorAction } from "./document-editor";

/**
 * Analog-Modus für Kunde-Dokumente (F08/F21): Der Owner lädt den auf Papier
 * unterschriebenen Scan (PDF) hoch und schließt das Dokument ab. Ersetzt im
 * Analog-Modus den digitalen „wartet auf Teilnehmer-Unterschrift"-Zustand.
 */
export function AnalogDocConfirm({
  documentId,
  confirmAction,
  blankPdfUrl,
}: {
  documentId: string;
  confirmAction: DocumentEditorAction;
  /** Download-Link für das leere Formular-PDF (zum Ausdrucken). */
  blankPdfUrl: string;
}) {
  const [state, action, pending] = useActionState(confirmAction, undefined);

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
        <li>
          <a
            href={blankPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline"
          >
            Leeres Formular als PDF herunterladen
          </a>{" "}
          und ausdrucken.
        </li>
        <li>Auf Papier unterschreiben lassen.</li>
        <li>Unterschriebenes Blatt scannen (PDF) und hier hochladen.</li>
      </ol>

      <form action={action} className="space-y-2">
        <input type="hidden" name="documentId" value={documentId} />
        <input
          type="file"
          name="scan"
          accept="application/pdf"
          required
          className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-50"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-zinc-800 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition enabled:hover:bg-zinc-50 disabled:opacity-40"
        >
          {pending ? "Wird hochgeladen…" : "Unterschriebenen Scan hochladen"}
        </button>
        {state?.error && (
          <p role="alert" className="text-xs text-red-700">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}
