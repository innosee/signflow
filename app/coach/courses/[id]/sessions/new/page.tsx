import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { assertNotImpersonating, requireSigningEnabled } from "@/lib/dal";

import { SessionForm } from "./session-form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function NewSessionPage({ params }: Props) {
  const session = await requireSigningEnabled();
  // Session-Anlage ist ein schreibender Vorgang → Bildungsträger darf das während
  // Impersonation nicht auslösen (siehe CLAUDE.md → Auth & Berechtigungen).
  assertNotImpersonating(session);

  const { id } = await params;

  const [course] = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
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

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Neue Session</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Eine Kurseinheit erfassen. Coach-Signatur und Teilnehmer-Signaturen
          erfolgen im nächsten Schritt.
        </p>
      </header>

      <SessionForm courseId={course.id} courseTitle={course.title} />
    </div>
  );
}
