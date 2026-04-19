"use client";

import { useRouter } from "next/navigation";

import { SignatureCanvas } from "@/components/signature-canvas";

export function ParticipantSignatureOnboarding({
  token,
  participantName,
}: {
  token: string;
  participantName: string;
}) {
  const router = useRouter();

  return (
    <div className="rounded-xl border border-zinc-300 bg-white p-5 space-y-3">
      <h2 className="text-base font-semibold">
        Hallo {participantName} — einmalig Unterschrift anlegen
      </h2>
      <p className="text-sm text-zinc-600">
        Damit du die einzelnen Einheiten schnell bestätigen kannst, brauchen
        wir deine Unterschrift einmal. Die wird dann bei jeder Bestätigung mit
        aktivem Klick + Zeitstempel in den AfA-Nachweis übernommen.
      </p>
      <SignatureCanvas
        action="/api/signatures/participant"
        extraFields={{ token }}
        submitLabel="Unterschrift speichern"
        onUploaded={() => router.refresh()}
      />
    </div>
  );
}
