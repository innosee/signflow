import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { BerDocument } from "@/components/checker/ber-document";
import { db, schema } from "@/db";
import { requireAgency } from "@/lib/dal";

import { PrintButton } from "./print-toolbar";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ berId: string }>;
};

export default async function AgencyBerDetailPage({ params }: Props) {
  await requireAgency();
  const { berId } = await params;

  const [row] = await db
    .select({
      ber: {
        id: schema.abschlussberichte.id,
        teilnahme: schema.abschlussberichte.teilnahme,
        ablauf: schema.abschlussberichte.ablauf,
        fazit: schema.abschlussberichte.fazit,
        status: schema.abschlussberichte.status,
        submittedAt: schema.abschlussberichte.submittedAt,
        updatedAt: schema.abschlussberichte.updatedAt,
        lastCheckPassed: schema.abschlussberichte.lastCheckPassed,
      },
      course: {
        id: schema.courses.id,
        title: schema.courses.title,
        avgsNummer: schema.courses.avgsNummer,
        startDate: schema.courses.startDate,
        endDate: schema.courses.endDate,
        anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
      },
      participant: {
        id: schema.participants.id,
        name: schema.participants.name,
        kundenNr: schema.participants.kundenNr,
        email: schema.participants.email,
      },
      coach: {
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
      },
    })
    .from(schema.abschlussberichte)
    .innerJoin(
      schema.courses,
      eq(schema.courses.id, schema.abschlussberichte.courseId),
    )
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.abschlussberichte.participantId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.abschlussberichte.coachId))
    .where(eq(schema.abschlussberichte.id, berId))
    .limit(1);

  if (!row) notFound();

  const { ber, course, participant, coach } = row;
  const submittedAt = ber.submittedAt ? new Date(ber.submittedAt) : null;
  const updatedAt = ber.updatedAt ? new Date(ber.updatedAt) : null;
  const wasEditedAfterSubmit =
    submittedAt &&
    updatedAt &&
    updatedAt.getTime() - submittedAt.getTime() > 60_000;

  return (
    <div className="review-wrapper">
      <div className="review-toolbar" data-print-hide>
        <div className="min-w-0">
          <Link
            href={`/agency/courses/${course.id}/berichte`}
            className="text-xs text-zinc-500 hover:text-zinc-900"
          >
            ← zurück zur Kurs-Übersicht
          </Link>
          <h1 className="mt-1 truncate text-lg font-semibold">
            BER · {participant.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span>{course.title}</span>
            <span>·</span>
            <span>Coach: {coach.name}</span>
            <span>·</span>
            <span>Kd-Nr. {participant.kundenNr}</span>
            {ber.status === "submitted" ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                ✓ eingereicht
                {submittedAt
                  ? ` am ${submittedAt.toLocaleDateString("de-DE")}`
                  : ""}
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                Entwurf
              </span>
            )}
            {ber.lastCheckPassed && (
              <span
                title="Die finale AMDL-Regelprüfung wurde beim Einreichen bestanden."
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700"
              >
                AMDL-Check ✓
              </span>
            )}
            {wasEditedAfterSubmit && (
              <span
                title={`Zuletzt bearbeitet am ${updatedAt?.toLocaleString("de-DE")}`}
                className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800"
              >
                nach Einreichung bearbeitet
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <PrintButton />
        </div>
      </div>

      <div className="review-canvas">
        <BerDocument
          input={{
            teilnahme: ber.teilnahme,
            ablauf: ber.ablauf,
            fazit: ber.fazit,
          }}
          meta={{
            avgsMassnahme: course.title,
            teilnehmerName: participant.name,
            kundenNr: participant.kundenNr,
            zeitraum: `${course.startDate} – ${course.endDate}`,
            coachName: coach.name,
            gesamtzahlUe: String(course.anzahlBewilligteUe),
          }}
        />
      </div>

      <style>{toolbarCss}</style>
    </div>
  );
}

const toolbarCss = `
  .review-wrapper {
    background: #f4f4f5;
    min-height: 100vh;
    padding: 0 0 10mm 0;
  }
  .review-toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    max-width: 210mm;
    margin: 0 auto;
    padding: 5mm 10mm 6mm;
  }
  .review-canvas {
    max-width: 210mm;
    margin: 0 auto;
    background: white;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  }
  @media print {
    .review-wrapper {
      background: white;
      padding: 0;
    }
    .review-canvas {
      max-width: none;
      box-shadow: none;
    }
    [data-print-hide] {
      display: none !important;
    }
  }
`;
