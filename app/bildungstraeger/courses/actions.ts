"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import {
  assertNotImpersonating,
  getTenantId,
  requireBildungstraeger,
} from "@/lib/dal";

export type CourseFormState = { error?: string } | undefined;

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Bildungsträger legt einen Kunden (= Kurs, 1:1) an UND weist ihn direkt einem
 * Coach zu. Erst nach Zuweisung erscheint der Kunde im Coach-Dashboard. Coaches
 * können nicht mehr selbst anlegen — die Anlage liegt allein beim BT.
 *
 * Reihenfolge wegen NOT-NULL-FK: erst den Kunden (participants) tenant-scoped
 * reuse-or-create, dann den Kurs mit `coach_id` + `participant_id`.
 */
export async function createCourse(
  _prev: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);

  const title = String(formData.get("title") ?? "").trim();
  const avgsNummer = String(formData.get("avgsNummer") ?? "").trim();
  const durchfuehrungsort = String(
    formData.get("durchfuehrungsort") ?? "",
  ).trim();
  const anzahlBewilligteUeRaw = String(
    formData.get("anzahlBewilligteUe") ?? "",
  ).trim();
  const bedarfstraegerId = String(formData.get("bedarfstraegerId") ?? "").trim();
  const coachId = String(formData.get("coachId") ?? "").trim();
  const massnahmeTypRaw = String(formData.get("massnahmeTyp") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();

  // Kunde (genau einer, 1:1).
  const customerName = String(formData.get("p_name") ?? "").trim();
  const customerEmail = String(formData.get("p_email") ?? "")
    .trim()
    .toLowerCase();
  const customerKundenNr = String(formData.get("p_kundennr") ?? "").trim();

  const allowedMassnahmeTyp = ["EKC", "ESC", "EGC", "ESCA"] as const;
  if (
    !allowedMassnahmeTyp.includes(
      massnahmeTypRaw as (typeof allowedMassnahmeTyp)[number],
    )
  ) {
    return { error: "Ungültiger Maßnahme-Typ. Bitte aus der Liste wählen." };
  }
  const massnahmeTyp = massnahmeTypRaw as (typeof allowedMassnahmeTyp)[number];

  if (
    !title ||
    !avgsNummer ||
    !durchfuehrungsort ||
    !anzahlBewilligteUeRaw ||
    !bedarfstraegerId ||
    !coachId ||
    !startDate ||
    !endDate
  ) {
    return { error: "Bitte alle Kurs-Felder ausfüllen (inkl. Coach)." };
  }
  if (!customerName || !customerEmail || !customerKundenNr) {
    return { error: "Kunde braucht Name, E-Mail und Kunden-Nr. (AfA)." };
  }
  if (!looksLikeEmail(customerEmail)) {
    return { error: "Ungültige E-Mail-Adresse des Kunden." };
  }

  const anzahlBewilligteUe = Number.parseInt(anzahlBewilligteUeRaw, 10);
  if (!Number.isInteger(anzahlBewilligteUe) || anzahlBewilligteUe <= 0) {
    return { error: "Bewilligte UE muss eine positive ganze Zahl sein." };
  }
  if (endDate < startDate) {
    return { error: "Enddatum darf nicht vor dem Startdatum liegen." };
  }

  // Coach serverseitig tenant-scoped validieren — der Client-Dropdown ist
  // manipulierbar; ein BT darf nur eigene Coaches zuweisen.
  const [coach] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, coachId),
        eq(schema.users.tenantId, tenantId),
        eq(schema.users.role, "coach"),
        isNull(schema.users.deletedAt),
      ),
    )
    .limit(1);
  if (!coach) {
    return { error: "Der gewählte Coach existiert nicht (mehr)." };
  }

  // Bedarfsträger tenant-scoped validieren.
  const [bt] = await db
    .select({ id: schema.bedarfstraeger.id })
    .from(schema.bedarfstraeger)
    .where(
      and(
        eq(schema.bedarfstraeger.id, bedarfstraegerId),
        eq(schema.bedarfstraeger.tenantId, tenantId),
        isNull(schema.bedarfstraeger.deletedAt),
      ),
    )
    .limit(1);
  if (!bt) {
    return { error: "Der gewählte Bedarfsträger existiert nicht (mehr)." };
  }

  let newCourseId: string | null = null;
  try {
    newCourseId = await db.transaction(async (tx) => {
      // Kunde tenant-scoped reuse-or-create (gleiche E-Mail = derselbe Mensch
      // innerhalb des Tenants, evtl. weitere Maßnahme).
      const [existing] = await tx
        .select({ id: schema.participants.id })
        .from(schema.participants)
        .where(
          and(
            eq(schema.participants.email, customerEmail),
            eq(schema.participants.tenantId, tenantId),
          ),
        )
        .limit(1);

      let participantId: string;
      if (existing) {
        participantId = existing.id;
      } else {
        const [created] = await tx
          .insert(schema.participants)
          .values({
            tenantId,
            name: customerName,
            email: customerEmail,
            kundenNr: customerKundenNr,
          })
          .returning({ id: schema.participants.id });
        if (!created) throw new Error("PARTICIPANT_INSERT_FAILED");
        participantId = created.id;
      }

      const [course] = await tx
        .insert(schema.courses)
        .values({
          coachId,
          participantId,
          title,
          avgsNummer,
          durchfuehrungsort,
          anzahlBewilligteUe,
          bedarfstraegerId,
          massnahmeTyp,
          startDate,
          endDate,
        })
        .returning({ id: schema.courses.id });
      if (!course) throw new Error("COURSE_INSERT_FAILED");
      return course.id;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Kunde konnte nicht angelegt werden (${message}).` };
  }

  if (!newCourseId) {
    return { error: "Kunde konnte nicht angelegt werden." };
  }

  redirect("/bildungstraeger/courses");
}
