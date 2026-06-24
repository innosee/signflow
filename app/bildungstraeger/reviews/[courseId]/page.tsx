import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";

import { ReviewThread } from "@/components/review-thread";
import { Stundennachweis } from "@/components/stundennachweis";
import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import { loadStundennachweisSheet } from "@/lib/sheet-data";

import { ReviewDecisionButtons } from "../review-decision-buttons";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ courseId: string }>;
};

const REVIEW_STATUS_LABEL: Record<string, string> = {
  none: "noch nicht eingereicht",
  pending: "zu prüfen",
  changes_requested: "Nachbesserung angefordert",
  approved: "freigegeben",
};

export default async function BildungstraegerReviewDetailPage({
  params,
}: Props) {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);
  const { courseId } = await params;

  // Tenant-Gate über den Coach-Join — ein BT darf nur Kurse des eigenen
  // Mandanten prüfen.
  const [course] = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      avgsNummer: schema.courses.avgsNummer,
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
      flagVorzeitigesEnde: schema.courses.flagVorzeitigesEnde,
      flagUeUnterschritten: schema.courses.flagUeUnterschritten,
      begruendungText: schema.courses.begruendungText,
      reviewStatus: schema.courses.reviewStatus,
      reviewRequestedAt: schema.courses.reviewRequestedAt,
      participantId: schema.courses.participantId,
      coachName: schema.users.name,
      customerName: schema.participants.name,
    })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.users.tenantId, tenantId),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);

  if (!course) notFound();

  // Geleistete UE (nur completed Sessions, ohne Erstgespräch) — derselbe
  // Maßstab wie auf der Coach-Seite.
  const completed = await db
    .select({
      anzahlUe: schema.sessions.anzahlUe,
      isErstgespraech: schema.sessions.isErstgespraech,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, courseId),
        eq(schema.sessions.status, "completed"),
        isNull(schema.sessions.deletedAt),
      ),
    );
  const geleisteteUe = completed
    .filter((s) => !s.isErstgespraech)
    .reduce((sum, s) => sum + Number.parseFloat(s.anzahlUe), 0);

  const notes = await db
    .select({
      id: schema.courseReviewNotes.id,
      authorType: schema.courseReviewNotes.authorType,
      authorName: schema.users.name,
      kind: schema.courseReviewNotes.kind,
      body: schema.courseReviewNotes.body,
      createdAt: schema.courseReviewNotes.createdAt,
    })
    .from(schema.courseReviewNotes)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.courseReviewNotes.authorId),
    )
    .where(eq(schema.courseReviewNotes.courseId, courseId))
    .orderBy(asc(schema.courseReviewNotes.createdAt));

  // Pixel-identische Vorschau der späteren PDF — derselbe Renderer, den
  // Coach-Print und Teilnehmer-Preview nutzen.
  const sheet = await loadStundennachweisSheet({
    courseId,
    participantId: course.participantId,
  });

  const isPending = course.reviewStatus === "pending";

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {course.title}
          </h1>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-600">
            <span>Kunde: {course.customerName}</span>
            <span>AVGS {course.avgsNummer}</span>
            <span>Coach: {course.coachName}</span>
            <span>
              Status:{" "}
              {REVIEW_STATUS_LABEL[course.reviewStatus] ?? course.reviewStatus}
            </span>
          </div>
        </div>
        <Link
          href="/bildungstraeger/reviews"
          className="shrink-0 text-sm text-zinc-600 underline-offset-2 hover:underline"
        >
          ← zurück
        </Link>
      </header>

      <section className="rounded-xl border border-zinc-300 bg-white px-6 py-5 space-y-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="text-xs text-zinc-500">Bewilligte UE</div>
            <div className="mt-0.5 text-lg font-semibold">
              {course.anzahlBewilligteUe}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Geleistete UE</div>
            <div className="mt-0.5 text-lg font-semibold">
              {geleisteteUe.toString().replace(".", ",")}
            </div>
          </div>
        </div>

        {course.flagUeUnterschritten && course.begruendungText && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="text-xs font-medium uppercase tracking-wide text-amber-700">
              UE-Unterschreitung — Begründung des Coaches
            </div>
            <p className="mt-1 whitespace-pre-wrap">{course.begruendungText}</p>
          </div>
        )}

        {course.flagVorzeitigesEnde && (
          <div className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            Hinweis: Maßnahme wurde zeitlich vor dem Bewilligungsende beendet.
          </div>
        )}

        {notes.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Verlauf
            </div>
            <ReviewThread notes={notes} />
          </div>
        )}

        {isPending ? (
          <div className="border-t border-zinc-200 pt-4">
            <div className="mb-2 text-sm font-medium">
              Liste prüfen und entscheiden
            </div>
            <ReviewDecisionButtons courseId={course.id} />
          </div>
        ) : (
          <p className="border-t border-zinc-200 pt-4 text-sm text-zinc-500">
            Diese Liste steht aktuell nicht zur Entscheidung an.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-700">
          Vorschau der Anwesenheitsliste (1:1 mit dem späteren AfA-PDF)
        </h2>
        {sheet ? (
          <div className="overflow-x-auto rounded-xl border border-zinc-300 bg-zinc-100 p-4">
            <Stundennachweis
              course={sheet.course}
              bedarfstraeger={sheet.bedarfstraeger}
              coach={sheet.coach}
              participant={sheet.participant}
              sessions={sheet.sessions}
              audit={sheet.audit}
            />
          </div>
        ) : (
          <p className="rounded-xl border border-zinc-300 bg-white px-6 py-8 text-center text-sm text-zinc-500">
            Vorschau konnte nicht geladen werden.
          </p>
        )}
      </section>
    </div>
  );
}
