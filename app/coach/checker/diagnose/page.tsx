import Link from "next/link";

import { requireCoach } from "@/lib/dal";

import { DiagnoseRunner } from "./diagnose-runner";

export const dynamic = "force-dynamic";

export default async function CheckerDiagnosePage() {
  await requireCoach();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 space-y-8">
      <div>
        <Link
          href="/coach/checker"
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← zurück
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Verbindung prüfen
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Der Checker schickt Texte zur Anonymisierung an einen Server in
          Frankfurt — direkt aus deinem Browser, an Vercel/USA vorbei. Manche
          Firmen-Netzwerke (Antivirus, Firewall, DNS-Filter) blockieren
          diese Verbindung. Mit diesem Test prüfst du in 5 Sekunden, ob bei
          dir alles offen ist.
        </p>
      </div>

      <DiagnoseRunner />
    </div>
  );
}
