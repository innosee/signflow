import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireSigningEnabled } from "@/lib/dal";
import type { Abschlussbericht } from "@/db/schema";

import { BerEditor } from "./ber-editor";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; tnId: string }>;
};

export default async function BerEditorPage({ params }: Props) {
  const session = await requireSigningEnabled();
  const { id: courseId, tnId: participantId } = await params;

  const [row] = await db
    .select({
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
      },
    })
    .from(schema.courses)
    .innerJoin(
      schema.courseParticipants,
      eq(schema.courseParticipants.courseId, schema.courses.id),
    )
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courseParticipants.participantId),
    )
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.courses.coachId, session.user.id),
        isNull(schema.courses.deletedAt),
        eq(schema.participants.id, participantId),
      ),
    )
    .limit(1);

  if (!row) notFound();

  const [existingBer] = await db
    .select()
    .from(schema.abschlussberichte)
    .where(
      and(
        eq(schema.abschlussberichte.courseId, courseId),
        eq(schema.abschlussberichte.participantId, participantId),
      ),
    )
    .limit(1);

  const initialBer: Abschlussbericht | null = existingBer ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 space-y-6">
      <div>
        <Link
          href={`/coach/courses/${courseId}`}
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← zurück zum Kurs {row.course.title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Abschlussbericht für {row.participant.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Kunden-Nr. {row.participant.kundenNr} · AVGS {row.course.avgsNummer}{" "}
          · {row.course.startDate} bis {row.course.endDate} ·{" "}
          {row.course.anzahlBewilligteUe} UE bewilligt
        </p>
      </div>

      <BerEditor
        courseId={courseId}
        participantId={participantId}
        coachName={session.user.name}
        participantName={row.participant.name}
        kundenNr={row.participant.kundenNr}
        avgsNummer={row.course.avgsNummer}
        zeitraum={`${row.course.startDate} – ${row.course.endDate}`}
        gesamtzahlUe={String(row.course.anzahlBewilligteUe)}
        initialBer={initialBer}
      />
    </div>
  );
}
