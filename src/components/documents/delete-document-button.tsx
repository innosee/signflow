"use client";

import { useFormStatus } from "react-dom";

function Inner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 enabled:hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Wird gelöscht…" : "Löschen"}
    </button>
  );
}

/**
 * Löscht ein (noch nicht abgeschlossenes) Kunde-Dokument. Bewusst mit
 * Bestätigungsdialog, da der Klick soft-löscht und direkt zur Liste
 * zurückspringt. `action` ist die rollen-spezifische `deleteDocument`-Server-
 * Action (Coach- bzw. BT-Route).
 */
export function DeleteDocumentButton({
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
        if (!window.confirm("Dieses Dokument wirklich löschen?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="documentId" value={documentId} />
      <Inner />
    </form>
  );
}
