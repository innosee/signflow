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
 * Löscht ein Kunde-Dokument (Soft-Delete). Bewusst mit Bestätigungsdialog, da
 * der Klick direkt zur Liste zurückspringt. `signed` verschärft den Hinweis für
 * bereits unterschriebene Dokumente. `action` ist die rollen-spezifische
 * `deleteDocument`-Server-Action (Coach- bzw. BT-Route).
 */
export function DeleteDocumentButton({
  action,
  documentId,
  signed = false,
}: {
  action: (formData: FormData) => Promise<void>;
  documentId: string;
  /** Ist das Dokument bereits (beidseitig) unterschrieben? → stärkere Warnung. */
  signed?: boolean;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const message = signed
          ? "Dieses Dokument ist bereits unterschrieben. Wirklich löschen? Es wird aus der Kunden-Akte entfernt."
          : "Dieses Dokument wirklich löschen?";
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="documentId" value={documentId} />
      <Inner />
    </form>
  );
}
