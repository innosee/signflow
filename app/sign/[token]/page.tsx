import { AutoRefresh } from "@/components/auto-refresh";
import { Stundennachweis } from "@/components/stundennachweis";
import { loadStundennachweisSheet } from "@/lib/sheet-data";
import { resolveParticipantToken } from "@/lib/participant-tokens";

import { ApproveForm } from "./approve-form";
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

  // Preview-Modus: Teilnehmer hat alle Sessions signiert und noch nicht
  // final freigegeben → er sieht das vollständige Dokument pixel-identisch
  // zum späteren PDF + einen Freigabe-Button (CLAUDE.md Schritt 8).
  const inPreviewMode =
    hasSignature &&
    resolved.sessions.length > 0 &&
    open.length === 0 &&
    !resolved.hasApproved;

  if (inPreviewMode) {
    const sheet = await loadStundennachweisSheet({
      courseId: resolved.courseId,
      participantId: resolved.participantId,
    });
    // Wenn wir im Preview-Modus sind (alle Sessions signiert + nicht
    // approved), MUSS das Sheet ladbar sein — sonst wäre die TN hier
    // wieder im normalen „alle bestätigt"-Flow und könnte nie freigeben.
    // Statt stillschweigend den alten Flow zu zeigen, hart fehlschlagen
    // mit klarer Meldung.
    if (!sheet) {
      return (
        <div className="mx-auto max-w-md px-4 py-16">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <h1 className="text-lg font-semibold text-red-800">
              Nachweis gerade nicht ladbar
            </h1>
            <p className="mt-2 text-sm text-red-700">
              Wir konnten dein fertiges Dokument gerade nicht zusammenstellen.
              Bitte in ein paar Minuten erneut probieren oder deinen Coach
              informieren.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="preview-wrapper">
        <header className="preview-header">
          <h1 className="text-lg font-semibold">Dein Stundennachweis</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Bitte prüfe das Dokument — so wird es an die Agentur für Arbeit
            gemeldet. Mit der Freigabe bestätigst du die inhaltliche
            Richtigkeit.
          </p>
        </header>
        <div className="preview-sheet">
          <Stundennachweis
            course={sheet.course}
            bedarfstraeger={sheet.bedarfstraeger}
            coach={sheet.coach}
            participant={sheet.participant}
            sessions={sheet.sessions}
          />
        </div>
        <div className="preview-cta">
          <ApproveForm token={token} />
        </div>
        <style>{previewCss}</style>
      </div>
    );
  }

  if (resolved.hasApproved) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            {resolved.courseTitle}
          </h1>
        </header>
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
          Danke, {resolved.participantName}! Du hast den Nachweis freigegeben.
          Dein Coach setzt im nächsten Schritt das digitale Siegel und leitet
          das Dokument an die Agentur für Arbeit weiter.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
      <AutoRefresh />
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

// Mobile-Vorgabe: das Sheet skaliert horizontal auf den Viewport,
// damit der TN auf dem Handy nicht seitwärts scrollen muss. Der
// Freigabe-Button liegt sticky am unteren Rand, damit er auch nach
// dem Scrollen durchs Sheet erreichbar bleibt.
const previewCss = `
  .preview-wrapper {
    background: #f4f4f5;
    min-height: 100vh;
    padding: 16px 8px 160px 8px;
  }
  .preview-header {
    max-width: 800px;
    margin: 0 auto 16px;
    padding: 0 8px;
  }
  .preview-sheet {
    max-width: 800px;
    margin: 0 auto;
    transform-origin: top center;
  }
  @media (max-width: 820px) {
    /* Auf schmalen Screens rutscht das A4-Sheet in Overflow — einfach
       horizontal scrollbar lassen, das PDF-Layout bleibt intakt. */
    .preview-sheet { overflow-x: auto; }
  }
  .preview-cta {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 16px;
    background: rgba(255,255,255,0.96);
    border-top: 1px solid #d4d4d8;
    backdrop-filter: blur(6px);
  }
  .preview-cta form {
    max-width: 560px;
    margin: 0 auto;
  }
`;
