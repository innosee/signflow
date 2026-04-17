import { resolveParticipantToken } from "@/lib/participant-tokens";

import { SignForm } from "./sign-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export default async function ParticipantSignPage({ params }: Props) {
  const { token } = await params;
  const resolved = await resolveParticipantToken(token);

  if (!resolved) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-lg font-semibold text-red-800">
            Link ungültig
          </h1>
          <p className="mt-2 text-sm text-red-700">
            Dieser Link ist abgelaufen oder wurde bereits verwendet. Bitte
            wende dich an deinen Coach für einen neuen Link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Anwesenheit bestätigen
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Hallo {resolved.participantName}, bitte bestätige deine Teilnahme.
        </p>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-5 text-sm">
        <Row label="Kurs">{resolved.courseTitle}</Row>
        <Row label="Datum">{resolved.sessionDate}</Row>
        <Row label="Thema">{resolved.sessionTopic}</Row>
      </div>

      <SignForm token={token} name={resolved.participantName} />

      <p className="text-xs text-zinc-500">
        Hinweis: Die Unterschriftenerfassung (Canvas) folgt in der nächsten
        Ausbaustufe. Heute bestätigst du per Klick; die IP-Adresse und der
        Zeitstempel werden gespeichert.
      </p>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between border-b border-black/5 py-2 last:border-0">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
