import Link from "next/link";

import { AutoRefresh } from "@/components/auto-refresh";
import { Stundennachweis } from "@/components/stundennachweis";
import { isFutureSessionDate } from "@/lib/dates";
import { loadStundennachweisSheet } from "@/lib/sheet-data";
import { resolveParticipantToken } from "@/lib/participant-tokens";
import { classifyApprovalGate } from "@/lib/sign-state";

import { getDocumentConfig, type DocumentTypeId } from "@/lib/documents/config";

import { ApproveForm } from "./approve-form";
import { DocumentSignForm } from "./document-sign-form";
import { ParticipantSignatureOnboarding } from "./signature-onboarding";
import { SignForm } from "./sign-form";

export const dynamic = "force-dynamic";

/**
 * DSGVO-Informationspflicht nach Art. 13: bei jedem Erst-Aufruf der
 * Sign-Page bekommt der TN einen sichtbaren Hinweis auf die
 * Verarbeitung + Link zur vollständigen Erklärung. Keine Einwilligungs-
 * Logik (Verarbeitung läuft Art. 6 lit b/c), nur Information.
 *
 * Bewusst kompakt + immer sichtbar (kein Dismissal), damit auch bei
 * wiederkehrenden TN-Visits der Hinweis nicht verloren geht.
 */
function DataProtectionNotice() {
  return (
    <p className="text-[11px] leading-relaxed text-zinc-500">
      Mit der Bestätigung deiner Anwesenheit verarbeitet die innosee GmbH
      im Auftrag deines Bildungsträgers personenbezogene Daten (Name,
      Zeitstempel, IP-Adresse, deine Unterschrift als Bild). Details in der{" "}
      <Link
        href="/datenschutz"
        className="underline underline-offset-2 hover:text-zinc-700"
      >
        Datenschutzerklärung
      </Link>
      .
    </p>
  );
}

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

  // Kunde-Dokumente (erango-Formulare): offen = vom Coach freigegeben (active),
  // noch nicht vom Teilnehmer signiert.
  const openDocs = resolved.documents.filter(
    (d) => d.status === "active" && !d.hasParticipantSignature,
  );
  const doneDocs = resolved.documents.filter((d) => d.hasParticipantSignature);

  // Freigabe-Gate (geteilt mit der Server-Action): "ready" heißt, ALLE Termine
  // sind vollständig signiert (Coach UND TN). Der TN darf seinen Teil vor dem
  // Coach signieren (gewollt) — dann ist `open` leer, aber das Gate noch nicht
  // "ready", und er wartet auf den Coach statt fälschlich „offene Termine"
  // signieren zu sollen.
  const approvalGate = classifyApprovalGate(
    resolved.sessions.map((s) => ({
      status: s.status,
      participantSigned: s.hasParticipantSignature,
    })),
  );

  // Preview-Modus: Dokument final (Gate "ready") und der Teilnehmer hat noch
  // nicht freigegeben → er sieht das vollständige Dokument pixel-identisch zum
  // späteren PDF + einen Freigabe-Button (CLAUDE.md Schritt 8).
  const inPreviewMode =
    hasSignature &&
    resolved.sessions.length > 0 &&
    approvalGate === "ready" &&
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
            Bitte prüfe deinen Stundennachweis auf Richtigkeit. Mit der
            Freigabe bestätigst du, dass deine Anwesenheiten korrekt erfasst
            sind.
          </p>
        </header>
        <div className="preview-sheet">
          <Stundennachweis
            branding={sheet.branding}
            course={sheet.course}
            bedarfstraeger={sheet.bedarfstraeger}
            coach={sheet.coach}
            participant={sheet.participant}
            sessions={sheet.sessions}
            audit={sheet.audit}
          />
        </div>
        <div className="preview-cta">
          <ApproveForm token={token} />
          <div className="mx-auto mt-3 max-w-140">
            <DataProtectionNotice />
          </div>
        </div>
        <style>{previewCss}</style>
      </div>
    );
  }

  // „Vorgang abgeschlossen" nur, wenn der TN freigegeben hat UND es keine
  // offenen Termine gibt. Legt der Coach nach der Freigabe einen neuen Termin
  // an, wird die Freigabe serverseitig verworfen (siehe createSession) — als
  // zusätzliche Absicherung haben offene Termine hier Vorrang vor dem
  // „Fertig"-Screen, damit der TN den neuen Termin signieren kann.
  if (resolved.hasApproved && open.length === 0 && openDocs.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            {resolved.courseTitle}
          </h1>
        </header>
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
          <strong>
            Danke, {resolved.participantName} – Vorgang abgeschlossen.
          </strong>{" "}
          Du hast deinen Stundennachweis geprüft und freigegeben. Du musst
          nichts weiter tun.
        </div>
        <DataProtectionNotice />
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
            : "Kurze Einrichtung, dann kannst du die einzelnen Termine bestätigen."}
        </p>
      </header>

      {!hasSignature ? (
        <ParticipantSignatureOnboarding
          token={token}
          participantName={resolved.participantName}
        />
      ) : open.length === 0 ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
          Alle Termine sind bestätigt – danke! Sobald dein Coach die Maßnahme
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

      {hasSignature && (openDocs.length > 0 || doneDocs.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-700">Dokumente</h2>
          {openDocs.map((d) => (
            <DocumentRow key={d.id} doc={d} token={token} open />
          ))}
          {doneDocs.map((d) => (
            <DocumentRow key={d.id} doc={d} token={token} open={false} />
          ))}
        </section>
      )}

      <DataProtectionNotice />
    </div>
  );
}

function DocumentRow({
  doc,
  token,
  open,
}: {
  doc: {
    id: string;
    type: DocumentTypeId;
    status: "active" | "completed";
    hasParticipantSignature: boolean;
  };
  token: string;
  open: boolean;
}) {
  const cfg = getDocumentConfig(doc.type);
  return (
    <div className="rounded-xl border border-zinc-300 bg-white p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <div className="font-medium">
          {cfg.formNumber} · {cfg.label}
        </div>
        <Link
          href={`/sign/${token}/dokument/${doc.id}`}
          className="text-xs text-zinc-600 underline underline-offset-2 hover:text-zinc-800"
        >
          ansehen
        </Link>
      </div>
      {open ? (
        <DocumentSignForm token={token} documentId={doc.id} />
      ) : (
        <p className="text-xs text-green-700">✓ unterschrieben</p>
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
      {!open ? (
        <p className="text-xs text-green-700">✓ bestätigt</p>
      ) : isFutureSessionDate(session.sessionDate) ? (
        <p className="text-xs text-zinc-500">
          Dieser Termin liegt in der Zukunft — du kannst ihn ab dem
          Termindatum bestätigen.
        </p>
      ) : (
        <SignForm token={token} sessionId={session.id} />
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
