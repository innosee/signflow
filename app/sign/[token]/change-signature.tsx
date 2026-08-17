"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SignatureCanvas } from "@/components/signature-canvas";

/**
 * Erlaubt dem Teilnehmer, eine BEREITS hinterlegte Unterschrift neu zu
 * zeichnen (z.B. wenn versehentlich nur ein „Punkt" gespeichert wurde).
 * Ohne diese Option gibt es keinen Weg zurück zum Zeichnen-Schritt, sobald
 * einmal eine Unterschrift existiert (Onboarding wird dann ausgeblendet).
 *
 * Postet an denselben Endpoint wie das Onboarding — der zieht die neue
 * Unterschrift serverseitig auf alle bereits bestätigten Termine/Dokumente
 * dieses Nachweises nach (solange er nicht finalisiert ist).
 */
export function ChangeSignature({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-600 underline underline-offset-2 enabled:hover:text-zinc-800"
      >
        Unterschrift neu zeichnen
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-300 bg-white p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Unterschrift neu zeichnen</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 underline underline-offset-2 enabled:hover:text-zinc-700"
        >
          Abbrechen
        </button>
      </div>
      <p className="text-xs text-zinc-600">
        Deine neue Unterschrift ersetzt die bisherige — auch auf bereits
        bestätigten Terminen dieses Nachweises.
      </p>
      <SignatureCanvas
        action="/api/signatures/participant"
        extraFields={{ token }}
        submitLabel="Neue Unterschrift speichern"
        onUploaded={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
