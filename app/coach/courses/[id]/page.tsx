import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { isImpersonating, requireCoach } from "@/lib/dal";

import { NotifyParticipantsButton } from "./notify-button";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reused?: string }>;
};

const BEDARFSTRAEGER_LABEL = {
  JC: "Jobcenter",
  AA: "Arbeitsagentur",
} as const;

export default async function CourseDetailPage({ params, searchParams }: Props) {
  const session = await requireCoach();
  const impersonating = isImpersonating(session);
  const { id } = await params;
  const { reused } = await searchParams;

  // reused kommt als beliebiger String aus der URL — nur rendern, wenn
  // es eine positive Ganzzahl ist. Verhindert, dass z.B. ?reused=abc
  // einen unsinnigen Banner erzeugt.
  const reusedCount = reused ? Number.parseInt(reused, 10) : NaN;
  const showReusedBanner = Number.isFinite(reusedCount) && reusedCount > 0;

  // Data-Isolation serverseitig: coach_id muss zum angemeldeten User passen.
  const [course] = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      avgsNummer: schema.courses.avgsNummer,
      durchfuehrungsort: schema.courses.durchfuehrungsort,
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      bedarfstraegerName: schema.bedarfstraeger.name,
      bedarfstraegerType: schema.bedarfstraeger.type,
    })
    .from(schema.courses)
    .innerJoin(
      schema.bedarfstraeger,
      eq(schema.bedarfstraeger.id, schema.courses.bedarfstraegerId),
    )
    .where(
      and(
        eq(schema.courses.id, id),
        eq(schema.courses.coachId, session.user.id),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);

  if (!course) notFound();

  const participants = await db
    .select({
      id: schema.participants.id,
      name: schema.participants.name,
      email: schema.participants.email,
      kundenNr: schema.participants.kundenNr,
    })
    .from(schema.courseParticipants)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courseParticipants.participantId),
    )
    .where(eq(schema.courseParticipants.courseId, id))
    .orderBy(asc(schema.participants.name));

  const sessions = await db
    .select({
      id: schema.sessions.id,
      sessionDate: schema.sessions.sessionDate,
      anzahlUe: schema.sessions.anzahlUe,
      modus: schema.sessions.modus,
      isErstgespraech: schema.sessions.isErstgespraech,
      topic: schema.sessions.topic,
      status: schema.sessions.status,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.courseId, id),
        isNull(schema.sessions.deletedAt),
      ),
    )
    .orderBy(asc(schema.sessions.sessionDate));

  // "Geleistet" zählt nur Sessions, bei denen Coach UND alle Teilnehmer
  // signiert haben (status='completed'). Reine Coach-Signatur oder noch
  // offene Sessions zählen nicht — sonst würde der Fortschritt gegenüber
  // der AfA-Bewilligung optimistisch verfälscht.
  const geleisteteUe = sessions
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + Number.parseFloat(s.anzahlUe), 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-8">
      {showReusedBanner && (
        <div
          role="status"
          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
        >
          Hinweis: {reusedCount} Teilnehmer existierten bereits in Signflow —
          die bestehenden Datensätze wurden wiederverwendet (Name und
          Kunden-Nr. bleiben unverändert).
        </div>
      )}

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {course.title}
        </h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
          <span>AVGS {course.avgsNummer}</span>
          <span>{course.durchfuehrungsort}</span>
          <span>
            {course.bedarfstraegerName} (
            {BEDARFSTRAEGER_LABEL[course.bedarfstraegerType] ??
              course.bedarfstraegerType}
            )
          </span>
          <span>
            {course.startDate} bis {course.endDate}
          </span>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Bewilligte UE" value={`${course.anzahlBewilligteUe}`} />
        <Stat
          label="Geleistete UE"
          value={geleisteteUe.toString().replace(".", ",")}
        />
        <Stat label="Sessions" value={sessions.length.toString()} />
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-300 px-6 py-4">
          <h2 className="text-lg font-semibold">
            Sessions ({sessions.length})
          </h2>
          {impersonating ? (
            <span
              title="Während Impersonation nicht möglich"
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white opacity-40"
            >
              + Session anlegen
            </span>
          ) : (
            <Link
              href={`/coach/courses/${course.id}/sessions/new`}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              + Session anlegen
            </Link>
          )}
        </div>
        {sessions.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            Noch keine Sessions. Lege die erste Kurseinheit an.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-start gap-4 px-6 py-3">
                <div className="w-24 shrink-0">
                  <div className="font-medium">{s.sessionDate}</div>
                  <div className="text-xs text-zinc-500">
                    {s.modus === "online" ? "Online" : "Präsenz"}
                    {" · "}
                    {s.isErstgespraech ? "Erstgespräch" : `${s.anzahlUe} UE`}
                  </div>
                </div>
                <p className="flex-1 text-zinc-700">{s.topic}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-300 px-6 py-4">
          <h2 className="text-lg font-semibold">
            Teilnehmer ({participants.length})
          </h2>
          {!impersonating && (
            <NotifyParticipantsButton
              courseId={course.id}
              participantCount={participants.length}
            />
          )}
        </div>
        <ul className="divide-y divide-zinc-200 text-sm">
          {participants.map((p) => (
            <li key={p.id} className="flex items-baseline gap-4 px-6 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-zinc-500">{p.email}</div>
              </div>
              <div className="text-xs text-zinc-500">
                Kd-Nr. {p.kundenNr}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-300 bg-white px-5 py-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
