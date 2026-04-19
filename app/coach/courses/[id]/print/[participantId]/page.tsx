import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull, or } from "drizzle-orm";

import { Stundennachweis } from "@/components/stundennachweis";
import { db, schema } from "@/db";
import { requireCoach } from "@/lib/dal";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; participantId: string }>;
};

export default async function PrintSheetPage({ params }: Props) {
  const session = await requireCoach();
  const { id: courseId, participantId } = await params;

  // Ownership + Kurs-Daten in einem Query — inkl. Bedarfsträger + Coach-Name.
  const [ctx] = await db
    .select({
      courseId: schema.courses.id,
      title: schema.courses.title,
      avgsNummer: schema.courses.avgsNummer,
      durchfuehrungsort: schema.courses.durchfuehrungsort,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
      flagUnter2Termine: schema.courses.flagUnter2Termine,
      flagVorzeitigesEnde: schema.courses.flagVorzeitigesEnde,
      begruendungText: schema.courses.begruendungText,
      bedarfstraegerName: schema.bedarfstraeger.name,
      bedarfstraegerType: schema.bedarfstraeger.type,
      coachName: schema.users.name,
    })
    .from(schema.courses)
    .innerJoin(
      schema.bedarfstraeger,
      eq(schema.bedarfstraeger.id, schema.courses.bedarfstraegerId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.coachId, session.user.id),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);
  if (!ctx) notFound();

  // Teilnehmer muss im Kurs eingeschrieben sein — sonst könnte der Coach
  // Nachweise für fremde Teilnehmer generieren.
  const [enrollment] = await db
    .select({
      cpId: schema.courseParticipants.id,
      participantName: schema.participants.name,
      kundenNr: schema.participants.kundenNr,
    })
    .from(schema.courseParticipants)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courseParticipants.participantId),
    )
    .where(
      and(
        eq(schema.courseParticipants.courseId, courseId),
        eq(schema.courseParticipants.participantId, participantId),
      ),
    )
    .limit(1);
  if (!enrollment) notFound();

  const sessions = await db
    .select({
      id: schema.sessions.id,
      sessionDate: schema.sessions.sessionDate,
      topic: schema.sessions.topic,
      anzahlUe: schema.sessions.anzahlUe,
      modus: schema.sessions.modus,
      isErstgespraech: schema.sessions.isErstgespraech,
      geeignet: schema.sessions.geeignet,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, courseId),
        isNull(schema.sessions.deletedAt),
      ),
    )
    .orderBy(asc(schema.sessions.sessionDate));

  // Nur die Signaturen ziehen, die für diesen Nachweis relevant sind: alle
  // Coach-Signaturen des Kurses + die TN-Signaturen DIESES Teilnehmers.
  // Signaturen anderer TN bleiben außen vor, sonst würde ein gemischter
  // Sessions-Join die Layout-Tabelle verzerren.
  const signatures = await db
    .select({
      sessionId: schema.signatures.sessionId,
      signerType: schema.signatures.signerType,
      signatureUrl: schema.signatures.signatureUrl,
      signedAt: schema.signatures.signedAt,
    })
    .from(schema.signatures)
    .innerJoin(
      schema.sessions,
      eq(schema.sessions.id, schema.signatures.sessionId),
    )
    .where(
      and(
        eq(schema.sessions.courseId, courseId),
        or(
          eq(schema.signatures.signerType, "coach"),
          and(
            eq(schema.signatures.signerType, "participant"),
            eq(schema.signatures.courseParticipantId, enrollment.cpId),
          ),
        ),
      ),
    );

  const sigBySession = new Map<
    string,
    {
      coachSignatureUrl: string | null;
      coachSignedAt: string | null;
      participantSignatureUrl: string | null;
      participantSignedAt: string | null;
    }
  >();
  for (const sig of signatures) {
    const slot = sigBySession.get(sig.sessionId) ?? {
      coachSignatureUrl: null,
      coachSignedAt: null,
      participantSignatureUrl: null,
      participantSignedAt: null,
    };
    if (sig.signerType === "coach") {
      slot.coachSignatureUrl = sig.signatureUrl;
      slot.coachSignedAt = sig.signedAt.toISOString();
    } else {
      slot.participantSignatureUrl = sig.signatureUrl;
      slot.participantSignedAt = sig.signedAt.toISOString();
    }
    sigBySession.set(sig.sessionId, slot);
  }

  const sheetSessions = sessions.map((s) => {
    const sig = sigBySession.get(s.id);
    return {
      id: s.id,
      sessionDate: s.sessionDate,
      topic: s.topic,
      anzahlUe: s.anzahlUe,
      modus: s.modus,
      isErstgespraech: s.isErstgespraech,
      geeignet: s.geeignet,
      coachSignatureUrl: sig?.coachSignatureUrl ?? null,
      coachSignedAt: sig?.coachSignedAt ?? null,
      participantSignatureUrl: sig?.participantSignatureUrl ?? null,
      participantSignedAt: sig?.participantSignedAt ?? null,
    };
  });

  return (
    <div className="print-wrapper">
      <div className="print-toolbar" data-print-hide>
        <Link
          href={`/coach/courses/${courseId}`}
          className="text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          ← zurück zum Kurs
        </Link>
        <div className="print-toolbar-actions">
          <a
            href={`/api/courses/${courseId}/participants/${participantId}/pdf`}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            PDF herunterladen
          </a>
          <p className="text-xs text-zinc-500">
            Headless-Chromium rendert dieselbe Seite nach A4 — 1:1 mit dem
            finalen AfA-PDF.
          </p>
        </div>
      </div>

      <Stundennachweis
        course={{
          title: ctx.title,
          avgsNummer: ctx.avgsNummer,
          durchfuehrungsort: ctx.durchfuehrungsort,
          startDate: ctx.startDate,
          endDate: ctx.endDate,
          anzahlBewilligteUe: ctx.anzahlBewilligteUe,
          flagUnter2Termine: ctx.flagUnter2Termine,
          flagVorzeitigesEnde: ctx.flagVorzeitigesEnde,
          begruendungText: ctx.begruendungText,
        }}
        bedarfstraeger={{
          name: ctx.bedarfstraegerName,
          type: ctx.bedarfstraegerType,
        }}
        coach={{ name: ctx.coachName }}
        participant={{
          name: enrollment.participantName,
          kundenNr: enrollment.kundenNr,
        }}
        sessions={sheetSessions}
      />

      <style>{toolbarCss}</style>
    </div>
  );
}

// Toolbar wird im Print-Modus ausgeblendet (AppHeader kommt separat über
// das Coach-Layout und wird durch `print:hidden` Tailwind-Utility versteckt —
// siehe layout.tsx-Anpassung).
const toolbarCss = `
  .print-wrapper { background: #f4f4f5; min-height: 100vh; padding: 0 0 8mm 0; }
  .print-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    max-width: 180mm;
    margin: 0 auto;
    padding: 4mm 10mm;
  }
  .print-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .print-toolbar-actions p { margin: 0; max-width: 30ch; }
  @media print {
    .print-wrapper { background: #fff; padding: 0; }
    [data-print-hide] { display: none !important; }
  }
`;
