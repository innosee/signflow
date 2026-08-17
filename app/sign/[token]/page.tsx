import Link from "next/link";

import { AutoRefresh } from "@/components/auto-refresh";
import { isFutureSessionDate } from "@/lib/dates";
import { formatDateDE } from "@/lib/format-date";
import { resolveParticipantToken } from "@/lib/participant-tokens";

import { getDocumentConfig, type DocumentTypeId } from "@/lib/documents/config";

import { ChangeSignature } from "./change-signature";
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

  // „Fertig": Der Teilnehmer hat seine Unterschrift angelegt und es gibt weder
  // offene Termine noch offene Dokumente. Eine separate Stundennachweis-
  // „Freigabe" durch den Teilnehmer gibt es NICHT mehr (entfernt 2026-07-29) —
  // die einzelnen Termin-Signaturen + der Audit-Trail dokumentieren die
  // Zustimmung. Offene Termine/Dokumente haben Vorrang vor dem Fertig-Screen,
  // damit der TN neu angelegte Einheiten noch signieren kann.
  if (hasSignature && open.length === 0 && openDocs.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            {resolved.courseTitle}
          </h1>
        </header>
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
          <strong>Danke, {resolved.participantName} – alles erledigt.</strong>{" "}
          Du hast alle Termine und Dokumente unterschrieben. Du musst nichts
          weiter tun.
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-xs text-zinc-500">
            Ist deine Unterschrift nicht richtig übernommen worden? Du kannst
            sie neu zeichnen — sie wird dann auf alle Termine übernommen.
          </p>
          <ChangeSignature token={token} />
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
          Alle Termine sind bestätigt – danke!
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
        <div className="flex flex-col gap-1">
          <p className="text-xs text-zinc-500">
            Bestätigung per aktivem Klick + Zeitstempel — deine einmal angelegte
            Unterschrift wird dabei als Snapshot in den AfA-Nachweis übernommen.
          </p>
          <ChangeSignature token={token} />
        </div>
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
          <div className="font-medium">{formatDateDE(session.sessionDate)}</div>
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
