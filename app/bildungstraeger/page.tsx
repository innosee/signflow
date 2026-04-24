import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireBildungstraeger } from "@/lib/dal";

import { BerProgressList } from "./ber-progress-list";
import { CoachListItem } from "./coach-list-item";
import { InviteCoachForm } from "./invite-form";

export const dynamic = "force-dynamic";

const IMP_ERRORS: Record<string, string> = {
  invalid: "Ungültiger Coach.",
  unknown: "Dieser Coach existiert nicht (mehr).",
  banned: "Coach ist gesperrt — Impersonation nicht möglich.",
  api: "Impersonation von Better Auth abgelehnt.",
  has_courses:
    "Coach hat noch nicht-archivierte Kurse — diese zuerst abschließen oder archivieren.",
  delete_failed: "Coach konnte nicht gelöscht werden.",
};

type Props = {
  searchParams: Promise<{ imp_error?: string }>;
};

export default async function BildungstraegerDashboard({ searchParams }: Props) {
  await requireBildungstraeger();
  const { imp_error } = await searchParams;
  const impErrorMsg = imp_error ? IMP_ERRORS[imp_error] : undefined;

  // Offene AfA-Übermittlungen (gesiegelt, aber noch nicht an die AfA raus)
  // — als Teaser oben in der Übersicht anzeigen, damit der Firmen-User
  // direkt sieht, dass Arbeit im Stapel liegt.
  const [pendingSubmissionsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.finalDocuments)
    .where(
      and(
        eq(schema.finalDocuments.fesStatus, "completed"),
        eq(schema.finalDocuments.afaStatus, "pending"),
      ),
    );
  const pendingSubmissions = pendingSubmissionsRow?.count ?? 0;

  const coaches = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      emailVerified: schema.users.emailVerified,
      banned: schema.users.banned,
      signingEnabled: schema.users.signingEnabled,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(
      and(eq(schema.users.role, "coach"), isNull(schema.users.deletedAt)),
    )
    .orderBy(desc(schema.users.createdAt));

  /**
   * BER-Fortschritt pro Kurs: wie viele Teilnehmer haben schon einen
   * eingereichten Bericht gegen wie viele eingeschriebene. Aggregiert in
   * einer Query, um N+1 zu vermeiden.
   */
  const berProgress = await db
    .select({
      courseId: schema.courses.id,
      courseTitle: schema.courses.title,
      coachName: schema.users.name,
      courseStatus: schema.courses.status,
      tnCount: sql<number>`count(distinct ${schema.courseParticipants.participantId})::int`,
      submittedCount: sql<number>`count(distinct ${schema.abschlussberichte.participantId}) filter (where ${schema.abschlussberichte.status} = 'submitted')::int`,
      draftCount: sql<number>`count(distinct ${schema.abschlussberichte.participantId}) filter (where ${schema.abschlussberichte.status} = 'draft')::int`,
    })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .leftJoin(
      schema.courseParticipants,
      eq(schema.courseParticipants.courseId, schema.courses.id),
    )
    .leftJoin(
      schema.abschlussberichte,
      and(
        eq(schema.abschlussberichte.courseId, schema.courses.id),
        eq(
          schema.abschlussberichte.participantId,
          schema.courseParticipants.participantId,
        ),
      ),
    )
    .where(isNull(schema.courses.deletedAt))
    .groupBy(
      schema.courses.id,
      schema.courses.title,
      schema.users.name,
      schema.courses.status,
      schema.courses.createdAt,
    )
    .orderBy(desc(schema.courses.createdAt));

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Bildungsträger Dashboard
        </h1>
      </header>

      {impErrorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {impErrorMsg}
        </div>
      )}

      <section className="rounded-xl border border-zinc-300 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">AfA-Übermittlungen</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {pendingSubmissions === 0
                ? "Aktuell kein Kurs zur Übermittlung bereit."
                : `${pendingSubmissions} gesiegelter ${
                    pendingSubmissions === 1 ? "Kurs wartet" : "Kurse warten"
                  } auf Übermittlung.`}
            </p>
          </div>
          <Link
            href="/bildungstraeger/submissions"
            className="rounded-lg border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Öffnen
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              Abschlussberichte — Fortschritt
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Überblick über TN-bezogene Berichte pro Kurs. Grün = eingereicht,
              Gelb = Entwurf, Grau = noch nicht begonnen.
            </p>
          </div>
        </div>
        <BerProgressList rows={berProgress} />
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white p-6">
        <h2 className="text-lg font-semibold">Coach einladen</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Der Coach erhält eine E-Mail mit Link zum Passwort-Setzen.
        </p>
        <div className="mt-4">
          <InviteCoachForm />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white">
        <div className="border-b border-zinc-300 px-6 py-4">
          <h2 className="text-lg font-semibold">Coaches ({coaches.length})</h2>
        </div>
        {coaches.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-zinc-500">
            Noch keine Coaches. Lade den ersten oben ein.
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {coaches.map((c) => (
              <CoachListItem key={c.id} coach={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
