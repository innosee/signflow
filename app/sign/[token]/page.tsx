import { resolveParticipantToken } from "@/lib/participant-tokens";

import { ParticipantSignatureOnboarding } from "./signature-onboarding";
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
          <h1 className="text-lg font-semibold text-red-800">Link ungültig</h1>
          <p className="mt-2 text-sm text-red-700">
            Dieser Link ist abgelaufen oder wurde durch einen neueren ersetzt.
            Bitte wende dich an deinen Coach für einen neuen Link.
          </p>
        </div>
      </div>
    );
  }

  const hasSignature = !!resolved.participantSignatureUrl;
  const open = resolved.sessions.filter((s) => !s.hasParticipantSignature);
  const done = resolved.sessions.filter((s) => s.hasParticipantSignature);

  return (
    <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {resolved.courseTitle}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {hasSignature
            ? `Hallo ${resolved.participantName}, bitte bestätige die unten aufgeführten Termine. Du kannst alle offenen Einheiten in einem Rutsch erledigen.`
            : "Kurze Einrichtung, dann kannst du die einzelnen Einheiten bestätigen."}
        </p>
      </header>

      {!hasSignature ? (
        <ParticipantSignatureOnboarding
          token={token}
          participantName={resolved.participantName}
        />
      ) : open.length === 0 ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
          Alle Einheiten sind bestätigt – danke! Sobald dein Coach den Kurs
          abschließt, bekommst du eine Vorschau zur finalen Freigabe.
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-700">
            Offen ({open.length})
          </h2>
          {open.map((s) => (
            <SessionRow key={s.id} session={s} token={token} open />
          ))}
        </section>
      )}

      {hasSignature && done.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-700">
            Bereits bestätigt ({done.length})
          </h2>
          {done.map((s) => (
            <SessionRow key={s.id} session={s} token={token} open={false} />
          ))}
        </section>
      )}

      {hasSignature && (
        <p className="text-xs text-zinc-500">
          Bestätigung per aktivem Klick + Zeitstempel — deine einmal angelegte
          Unterschrift wird dabei als Snapshot in den AfA-Nachweis übernommen.
        </p>
      )}
    </div>
  );
}

function SessionRow({
  session,
  token,
  open,
}: {
  session: {
    id: string;
    sessionDate: string;
    topic: string;
    anzahlUe: string;
    modus: "praesenz" | "online";
    isErstgespraech: boolean;
  };
  token: string;
  open: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-300 bg-white p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <div>
          <div className="font-medium">{session.sessionDate}</div>
          <div className="text-xs text-zinc-500">
            {session.modus === "online" ? "Online" : "Präsenz"}
            {" · "}
            {session.isErstgespraech
              ? "Erstgespräch"
              : `${session.anzahlUe} UE`}
          </div>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-zinc-700">{session.topic}</p>
      {open ? (
        <SignForm token={token} sessionId={session.id} />
      ) : (
        <p className="text-xs text-green-700">✓ bestätigt</p>
      )}
    </div>
  );
}
