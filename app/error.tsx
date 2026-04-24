"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Globale Fehlerseite. Next.js zeigt diese Seite, wenn ein Render oder eine
 * Server-Action innerhalb des Segments wirft. In dev bleibt zusätzlich das
 * Dev-Overlay aktiv (Next.js-Konvention); in prod ist das hier, was der
 * Nutzer sieht. Absichtlich ohne technische Details — der Stacktrace landet
 * über `console.error` in der Telemetrie, nicht im UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-300 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Etwas ist schiefgegangen
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Die Aktion konnte nicht abgeschlossen werden. Versuche es bitte
            erneut. Wenn das Problem bestehen bleibt, melde dich bei uns.
          </p>
        </div>

        {error.digest && (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            Fehler-Referenz: <span className="font-mono">{error.digest}</span>
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Nochmal versuchen
          </button>
          <Link
            href="/"
            className="rounded-lg border border-zinc-500 px-4 py-2 text-sm hover:bg-zinc-50"
          >
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}
