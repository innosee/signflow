import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { getTenantId, requireBildungstraeger } from "@/lib/dal";
import { getTenantCoaches, getTenantCoachesByIds } from "@/lib/memberships";

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
      avgsGueltigVon: schema.courses.avgsGueltigVon,
      avgsGueltigBis: schema.courses.avgsGueltigBis,
      startDate: schema.courses.startDate,
      endDate: schema.courses.endDate,
      bewilligtAt: schema.courses.bewilligtAt,
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
    .where(eq(schema.courseCoaches.courseId, course.id))
    .orderBy(asc(schema.courseCoaches.coachId));
  // Der primäre Coach steht IMMER an Position 0: die Server-Action leitet
  // `courses.coach_id` aus `coachIds[0]` ab. Ohne feste Reihenfolge würde jedes
  // Speichern den Hauptcoach auf ein beliebiges Teammitglied umhängen.
  // (Fallback auf den primären Coach, falls Altdaten ohne Team-Eintrag.)
  const teamCoachIds = [
    course.coachId,
    ...team.map((t) => t.coachId).filter((id) => id !== course.coachId),
  ];

  // Deaktivierte Coaches bleiben in `course_coaches` stehen, fehlen aber in
  // `getTenantCoaches`. Ohne Nachladen wären sie im Multiselect unsichtbar —
  // kein Chip zum Entfernen, aber im Hidden-Input mitgesendet: der Kunde ließe
  // sich dann überhaupt nicht mehr speichern (Fall „Hermina Laktos", 09/2026).
  const knownIds = new Set(coaches.map((c) => c.id));
  const missingIds = teamCoachIds.filter((id) => !knownIds.has(id));
  // Hart `inactive`: was nicht in der aktiven Auswahlliste steht, darf hier
  // nicht neu zuweisbar werden — nur sichtbar und entfernbar.
  const coachOptions = [
    ...coaches,
    ...(await getTenantCoachesByIds(tenantId, missingIds)).map((c) => ({
      ...c,
      inactive: true,
    })),
  ];

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
        coaches={coachOptions}
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
          avgsGueltigVon: course.avgsGueltigVon,
          avgsGueltigBis: course.avgsGueltigBis,
          startDate: course.startDate ?? "",
          endDate: course.endDate ?? "",
          bewilligt: course.bewilligtAt != null,
          p_name: course.pName,
          p_email: course.pEmail,
          p_kundennr: course.pKundenNr,
        }}
      />
    </div>
  );
}
