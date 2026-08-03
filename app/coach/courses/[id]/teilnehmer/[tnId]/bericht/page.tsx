import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull, max } from "drizzle-orm";

import { db, schema } from "@/db";
import { courseVisibleToCoach } from "@/lib/course-access";
import { getSigningEnabled, isImpersonating, requireCoach } from "@/lib/dal";
import { formatDateDE } from "@/lib/format-date";
import type { Abschlussbericht } from "@/db/schema";

import { stopImpersonating } from "../../../../../../bildungstraeger/actions";
import { BerEditor } from "./ber-editor";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; tnId: string }>;
};

export default async function BerEditorPage({ params }: Props) {
  const session = await requireCoach();
  // BER-Editor ist Checker-Funktionalität — für alle Coaches offen. Nur der
  // „Zurück zum Kurs"-Link ist für Nicht-Signatur-Coaches sinnlos (Kurs-
  // Detail-Seite ist gated), deshalb navigiert der Back-Link in dem Fall
  // zurück aufs Checker-Dashboard.
  const signingEnabled = await getSigningEnabled(session.user.id);
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
        massnahmeTyp: schema.courses.massnahmeTyp,
      },
      participant: {
        id: schema.participants.id,
        name: schema.participants.name,
        kundenNr: schema.participants.kundenNr,
      },
    })
    .from(schema.courses)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(
      and(
        eq(schema.courses.id, courseId),
        courseVisibleToCoach(session.user.id),
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

  // Letzter Termin = spätestes Datum aller nicht gelöschten Termine. Dient als
  // Vorbelegung für das Abschlussdatum (= Ende des Zeitraums im Dokument);
  // der Coach kann es im Editor überschreiben.
  const [{ letzterTermin } = { letzterTermin: null }] = await db
    .select({ letzterTermin: max(schema.sessions.sessionDate) })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, courseId),
        isNull(schema.sessions.deletedAt),
      ),
    );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 space-y-6">
      <div>
        <Link
          href={signingEnabled ? `/coach/courses/${courseId}` : "/coach/checker"}
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← {signingEnabled ? `zurück zum Kurs ${row.course.title}` : "zurück zur Berichts-Übersicht"}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Abschlussbericht für {row.participant.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Kunden-Nr. {row.participant.kundenNr} · AVGS {row.course.avgsNummer}{" "}
          ·{" "}
          {row.course.startDate && row.course.endDate
            ? `${formatDateDE(row.course.startDate)} bis ${formatDateDE(row.course.endDate)}`
            : "Bewilligungszeitraum offen"}{" "}
          · {row.course.anzahlBewilligteUe} UE bewilligt
        </p>
      </div>

      <BerEditor
        // Key zwingt React zum Remount, wenn der Coach zwischen zwei BERs
        // wechselt (z.B. aus dem Checker-Dashboard heraus). Ohne Key würde
        // der client-seitige useState (input/status/phase) vom vorherigen
        // BER hängen bleiben — Daten eines anderen Teilnehmers wären im
        // aktuellen Bericht sichtbar.
        key={`${courseId}:${participantId}`}
        courseId={courseId}
        participantId={participantId}
        massnahmeTyp={row.course.massnahmeTyp}
        coachName={session.user.name}
        participantName={row.participant.name}
        kundenNr={row.participant.kundenNr}
        avgsNummer={row.course.avgsNummer}
        courseStartDate={row.course.startDate}
        courseEndDate={row.course.endDate}
        letzterTermin={letzterTermin ?? null}
        gesamtzahlUe={String(row.course.anzahlBewilligteUe)}
        initialBer={initialBer}
        impersonating={isImpersonating(session)}
        stopImpersonationAction={stopImpersonating}
      />
    </div>
  );
}
