"use client";

import { useRouter } from "next/navigation";

import { SignatureCanvas } from "@/components/signature-canvas";

export function SignatureSetup({ existingUrl }: { existingUrl: string | null }) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {existingUrl && (
        <div className="rounded-xl border border-zinc-300 bg-white p-5">
          <p className="text-sm text-zinc-600">Aktuelle Unterschrift:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={existingUrl}
            alt="Aktuelle Unterschrift"
            className="mt-3 h-24 w-auto rounded border border-zinc-200 bg-white"
          />
        </div>
      )}

      <div className="rounded-xl border border-zinc-300 bg-white p-5">
        <h2 className="text-base font-semibold text-zinc-900">
          {existingUrl ? "Neue Unterschrift aufnehmen" : "Unterschrift aufnehmen"}
        </h2>
        <p className="mt-1 mb-4 text-sm text-zinc-600">
          Diese Unterschrift wird einmalig erfasst und pro Session mit aktiver
          Bestätigung (Klick + Zeitstempel) in den Anwesenheitsnachweis
          eingebunden — du musst sie also nicht pro Termin neu leisten.
        </p>
        <SignatureCanvas
          action="/api/signatures/me"
          submitLabel={
            existingUrl ? "Unterschrift aktualisieren" : "Unterschrift speichern"
          }
          onUploaded={() => {
            // Server-Komponenten neu rendern lassen, damit der Banner auf dem
            // Dashboard verschwindet und die neue URL sichtbar wird.
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
