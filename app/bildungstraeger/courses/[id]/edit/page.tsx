import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import { getTenantCoaches } from "@/lib/memberships";

import { CourseForm } from "../../new/course-form";
import { updateCourse } from "../../actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({ params }: Props) {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);
  const { id: courseId } = await params;

  // Kurs + Kunde laden, tenant-scoped (Coach-Join).
  const [course] = await db
    .select({
      id: schema.courses.id,
      coachId: schema.courses.coachId,
      avgsNummer: schema.courses.avgsNummer,
      durchfuehrungsort: schema.courses.durchfuehrungsort,
      anzahlBewilligteUe: schema.courses.anzahlBewilligteUe,
      bedarfstraegerId: schema.courses.bedarfstraegerId,
      massnahmeTyp: schema.courses.massnahmeTyp,
      bundesland: schema.courses.bundesland,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      pName: schema.participants.name,
      pEmail: schema.participants.email,
      pKundenNr: schema.participants.kundenNr,
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

  const bedarfstraeger = await db
    .select({
      id: schema.bedarfstraeger.id,
      name: schema.bedarfstraeger.name,
      type: schema.bedarfstraeger.type,
    })
    .from(schema.bedarfstraeger)
    .where(
      and(
        eq(schema.bedarfstraeger.tenantId, tenantId),
        isNull(schema.bedarfstraeger.deletedAt),
      ),
    )
    .orderBy(asc(schema.bedarfstraeger.name));

  // Auswahlquelle fürs Multiselect (alle Tenant-Coaches) + aktuelles Team.
  const coaches = await getTenantCoaches(tenantId);
  const team = await db
    .select({ coachId: schema.courseCoaches.coachId })
    .from(schema.courseCoaches)
    .where(eq(schema.courseCoaches.courseId, course.id));
  // Fallback auf den primären Coach, falls (Altdaten) noch kein Team-Eintrag.
  const teamCoachIds =
    team.length > 0 ? team.map((t) => t.coachId) : [course.coachId];

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Kunde bearbeiten
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Stammdaten der Maßnahme und des Kunden. Termine und Signaturen bleiben
          unverändert.
        </p>
      </header>

      <CourseForm
        bedarfstraeger={bedarfstraeger}
        coaches={coaches}
        action={updateCourse}
        courseId={course.id}
        submitLabel="Änderungen speichern"
        initial={{
          coachIds: teamCoachIds,
          avgsNummer: course.avgsNummer,
          durchfuehrungsort: course.durchfuehrungsort,
          anzahlBewilligteUe: String(course.anzahlBewilligteUe),
          bedarfstraegerId: course.bedarfstraegerId,
          massnahmeTyp: course.massnahmeTyp,
          bundesland: course.bundesland ?? "",
          startDate: course.startDate,
          endDate: course.endDate,
          p_name: course.pName,
          p_email: course.pEmail,
          p_kundennr: course.pKundenNr,
        }}
      />
    </div>
  );
}
