"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit-Button für reine Server-Action-`<form action={fn}>` (ohne
 * `useActionState`). Nutzt `useFormStatus`, um sich WÄHREND des Absendens selbst
 * zu deaktivieren und ein Lade-Label zu zeigen — verhindert Doppel-Klicks
 * (sonst legt ein Redirect-lastiger Submit ohne Feedback mehrere Datensätze an).
 *
 * Muss ein KIND des `<form>` sein (useFormStatus liest den Status des
 * umschließenden Formulars).
 */
export function PendingSubmitButton({
  children,
  pendingLabel = "Wird gespeichert…",
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
