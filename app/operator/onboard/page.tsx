import { notFound } from "next/navigation";

import { OnboardForm } from "./onboard-form";

export const dynamic = "force-dynamic";

/**
 * Operator-Seite (Betreiber-intern) zum Freischalten eines Bildungsträgers
 * aus der Warteliste. Kein User-Login dahinter — der Schutz läuft über das
 * `OPERATOR_ONBOARD_SECRET`, das in der Action zeitkonstant geprüft wird.
 *
 * Ist das Secret nicht konfiguriert, existiert die Seite faktisch nicht
 * (404) — verhindert, dass sie versehentlich ungesichert deployed wird.
 */
export default function OperatorOnboardPage() {
  if (!process.env.OPERATOR_ONBOARD_SECRET) notFound();

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-zinc-300 bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Bildungsträger freischalten
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Legt einen neuen Mandanten samt Admin-Account an und verschickt
            eine Einladung zum Passwort-Festlegen. Für Warteliste-Freigaben
            durch den Betreiber.
          </p>
        </div>
        <OnboardForm />
      </div>
    </div>
  );
}
