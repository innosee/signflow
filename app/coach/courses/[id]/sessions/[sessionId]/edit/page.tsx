import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { assertNotImpersonating, requireSigningEnabled } from "@/lib/dal";

import { SessionEditForm } from "./session-edit-form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; sessionId: string }>;
};

export default async function EditSessionPage({ params }: Props) {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);

  const { id, sessionId } = await params;

  // Course + Session + Signatur-Status in einer Query — wir leiten Coach
  // direkt zurück zum Kurs-Dashboard, wenn schon signiert wurde, damit er
  // dort die spätere „Session wieder öffnen"-Action triggern kann (noch
  // nicht implementiert, daher bewusst defensive Tür).
  const [course] = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      bundesland: schema.courses.bundesland,
    })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.id, id),
        eq(schema.courses.coachId, session.user.id),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);
  if (!course) notFound();

  const [sess] = await db
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
        eq(schema.sessions.id, sessionId),
        eq(schema.sessions.courseId, course.id),
        isNull(schema.sessions.deletedAt),
      ),
    )
    .limit(1);
  if (!sess) notFound();

  const [existingSig] = await db
    .select({ id: schema.signatures.id })
    .from(schema.signatures)
    .where(eq(schema.signatures.sessionId, sessionId))
    .limit(1);
  if (existingSig) {
    // Session schon signiert → Bearbeiten nicht erlaubt. Redirect zurück
    // mit Hint im URL, das page.tsx später als Banner rendern könnte.
    redirect(`/coach/courses/${course.id}?signed=${sessionId}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Termin bearbeiten</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Solange weder du noch der Kunde signiert hat, kannst du die Eingaben
          hier korrigieren.
        </p>
      </header>

      <SessionEditForm
        courseId={course.id}
        courseTitle={course.title}
        bundesland={course.bundesland}
        session={{
          id: sess.id,
          sessionDate: sess.sessionDate,
          topic: sess.topic,
          anzahlUe: sess.anzahlUe,
          modus: sess.modus,
          isErstgespraech: sess.isErstgespraech,
          geeignet: sess.geeignet,
        }}
      />
    </div>
  );
}
