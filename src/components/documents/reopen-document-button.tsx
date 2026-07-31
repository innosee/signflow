"use client";

import { useFormStatus } from "react-dom";

function Inner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-800 enabled:hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Wird geöffnet…" : "Bearbeiten (Korrektur)"}
    </button>
  );
}

/**
 * Holt ein freigegebenes, aber vom Kunden noch NICHT signiertes Dokument zur
 * Korrektur zurück auf Entwurf (Tippfehler VOR der Kundenunterschrift). Die
 * erango-seitige Unterschrift wird zurückgenommen und muss danach neu geleistet
 * werden — deshalb mit Bestätigungsdialog. `action` ist die rollen-spezifische
 * `reopenDocument`-Server-Action (Coach- bzw. BT-Route).
 */
export function ReopenDocumentButton({
  action,
  documentId,
}: {
  action: (formData: FormData) => Promise<void>;
  documentId: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Zum Korrigieren wieder öffnen? Die bereits geleistete Unterschrift der erango-Seite wird zurückgenommen und muss nach der Korrektur neu geleistet werden. Das geht nur, solange die Teilnehmer:in noch nicht unterschrieben hat.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="documentId" value={documentId} />
      <Inner />
    </form>
  );
}
