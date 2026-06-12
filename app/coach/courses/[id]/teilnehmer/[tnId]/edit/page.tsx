import { notFound } from "next/navigation";
import { and, eq, isNull, ne, sql as drizzleSql } from "drizzle-orm";

import { db, schema } from "@/db";
import {
  assertNotImpersonating,
  getTenantId,
  requireSigningEnabled,
} from "@/lib/dal";
import { isSmsEnabled } from "@/lib/sms";

import { EditParticipantForm } from "./edit-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; tnId: string }> };

export default async function EditParticipantPage({ params }: Props) {
  const session = await requireSigningEnabled();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);
  const { id, tnId } = await params;

  // Kurs + Coach-Ownership in einer Query mit dem TN-Stammdatensatz joinen,
  // damit ein Coach durch URL-Manipulation NICHT auf TN-Daten anderer
  // Kurse/Tenants zugreifen kann. `course_participants` ist das gating
  // Element — fehlt die Enrollment-Zeile, gibt's 404.
  const [row] = await db
    .select({
      courseId: schema.courses.id,
      courseTitle: schema.courses.title,
      participantId: schema.participants.id,
      name: schema.participants.name,
      email: schema.participants.email,
      kundenNr: schema.participants.kundenNr,
      phone: schema.participants.phone,
    })
    .from(schema.courses)
    .innerJoin(
      schema.participants,
      eq(schema.participants.id, schema.courses.participantId),
    )
    .where(
      and(
        eq(schema.courses.id, id),
        eq(schema.courses.coachId, session.user.id),
        eq(schema.participants.id, tnId),
        eq(schema.participants.tenantId, tenantId),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);

  if (!row) notFound();

  // Wieviele ANDERE Kurse haben diesen Kunden noch? Coach soll wissen,
  // dass Stammdaten-Änderungen dort mitwirken (Stamm = ein Datensatz).
  const [{ count: othersRaw }] = await db
    .select({
      count: drizzleSql<number>`count(*) filter (where ${schema.courses.deletedAt} is null)::int`,
    })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.participantId, tnId),
        ne(schema.courses.id, id),
      ),
    );
  const enrolledInOtherCourses = othersRaw ?? 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Teilnehmer bearbeiten
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Stammdaten anpassen. Magic-Link-Tokens bleiben unverändert.
        </p>
      </header>
      <EditParticipantForm
        courseId={row.courseId}
        courseTitle={row.courseTitle}
        participantId={row.participantId}
        initial={{
          name: row.name,
          email: row.email,
          kundenNr: row.kundenNr,
          phone: row.phone,
        }}
        smsEnabled={isSmsEnabled()}
        enrolledInOtherCourses={enrolledInOtherCourses}
      />
    </div>
  );
}
