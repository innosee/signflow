import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { assertNotImpersonating, requireSigningEnabled } from "@/lib/dal";

import { ParticipantForm } from "./participant-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function NewParticipantPage({ params }: Props) {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const { id } = await params;

  const [course] = await db
    .select({ id: schema.courses.id, title: schema.courses.title })
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

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Neuer Teilnehmer
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Schreibt einen Teilnehmer nachträglich in den Kurs ein. Der Magic-
          Link wird erst beim nächsten „Teilnehmer benachrichtigen“ verschickt.
        </p>
      </header>
      <ParticipantForm courseId={course.id} courseTitle={course.title} />
    </div>
  );
}
