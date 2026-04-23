import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireAgency } from "@/lib/dal";

export const dynamic = "force-dynamic";

const COURSE_STATUS_LABEL: Record<string, string> = {
  active: "aktiv",
  completed: "abgeschlossen",
  archived: "archiviert",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AgencyCourseBerListPage({ params }: Props) {
  await requireAgency();
  const { id: courseId } = await params;

  const [course] = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      avgsNummer: schema.courses.avgsNummer,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      status: schema.courses.status,
      coachName: schema.users.name,
    })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .where(
      and(eq(schema.courses.id, courseId), isNull(schema.courses.deletedAt)),
    )
    .limit(1);

  if (!course) notFound();

  const rows = await db
    .select({
      participantId: schema.participants.id,
      participantName: schema.participants.name,
      kundenNr: schema.participants.kundenNr,
      berId: schema.abschlussberichte.id,
      berStatus: schema.abschlussberichte.status,
      berSubmittedAt: schema.abschlussberichte.submittedAt,
      berUpdatedAt: schema.abschlussberichte.updatedAt,
    })
    .from(schema.courseParticipants)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courseParticipants.participantId),
    )
    .leftJoin(
      schema.abschlussberichte,
      and(
        eq(schema.abschlussberichte.courseId, courseId),
        eq(
          schema.abschlussberichte.participantId,
          schema.courseParticipants.participantId,
        ),
      ),
    )
    .where(eq(schema.courseParticipants.courseId, courseId))
    .orderBy(asc(schema.participants.name));

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-6">
      <div>
        <Link
          href="/agency"
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← zurück zum Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Abschlussberichte — {course.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Coach: {course.coachName} · AVGS {course.avgsNummer} ·{" "}
          {course.startDate} bis {course.endDate} · Kurs-Status:{" "}
          {COURSE_STATUS_LABEL[course.status] ?? course.status}
        </p>
      </div>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="border-b border-zinc-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">
            Teilnehmer ({rows.length})
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Klick auf einen eingereichten Bericht, um ihn einzusehen oder als
            PDF zu speichern. Entwürfe können noch verändert werden und sind
            hier nicht abrufbar.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-zinc-500">
            Keine Teilnehmer im Kurs.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const submittedAt = r.berSubmittedAt
                ? new Date(r.berSubmittedAt)
                : null;
              const isSubmitted = r.berStatus === "submitted";
              const isDraft = r.berStatus === "draft";
              return (
                <li
                  key={r.participantId}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="font-medium text-zinc-900">
                      {r.participantName}
                    </div>
                    <div className="text-xs text-zinc-500">
                      Kunden-Nr. {r.kundenNr}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {isSubmitted && submittedAt
                      ? `eingereicht am ${submittedAt.toLocaleDateString("de-DE")}`
                      : isDraft
                        ? "Entwurf in Arbeit"
                        : "noch nicht begonnen"}
                  </div>
                  {isSubmitted && r.berId ? (
                    <Link
                      href={`/agency/abschlussberichte/${r.berId}`}
                      className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      Bericht ansehen →
                    </Link>
                  ) : isDraft ? (
                    <span className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                      nur Entwurf
                    </span>
                  ) : (
                    <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-500">
                      fehlt
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
