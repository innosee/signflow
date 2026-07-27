"use client";

import { useRouter } from "next/navigation";

import { SignatureCanvas } from "@/components/signature-canvas";

/**
 * Setup der geteilten Organisations-Unterschrift des Bildungsträgers. EINE pro
 * Tenant — sie erscheint als „erango Mitarbeiter:in"-Zeile auf den
 * BT-Dokumenten (Datenschutz/Teilnehmervertrag/Merge).
 */
export function TenantSignatureSetup({
  existingUrl,
}: {
  existingUrl: string | null;
}) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {existingUrl && (
        <div className="rounded-xl border border-zinc-300 bg-white p-5">
          <p className="text-sm text-zinc-600">Aktuelle Unterschrift:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={existingUrl}
            alt="Aktuelle Organisations-Unterschrift"
            className="mt-3 h-24 w-auto rounded border border-zinc-200 bg-white"
          />
        </div>
      )}

      <div className="rounded-xl border border-zinc-300 bg-white p-5">
        <h2 className="text-base font-semibold text-zinc-900">
          {existingUrl ? "Neue Unterschrift aufnehmen" : "Unterschrift aufnehmen"}
        </h2>
        <p className="mt-1 mb-4 text-sm text-zinc-600">
          Diese Unterschrift wird einmalig für die gesamte Organisation erfasst
          und mit aktiver Bestätigung (Klick + Zeitstempel) auf die
          Bildungsträger-Dokumente (Datenschutz, Teilnehmervertrag, TNV+DS)
          eingebunden. Ohne hinterlegte Unterschrift kannst du kein Dokument
          freigeben.
        </p>
        <SignatureCanvas
          action="/api/signatures/tenant"
          submitLabel={
            existingUrl ? "Unterschrift aktualisieren" : "Unterschrift speichern"
          }
          onUploaded={() => {
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
