"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";

import { db, schema } from "@/db";
import {
  assertNotImpersonating,
  getTenantId,
  requireBildungstraeger,
} from "@/lib/dal";
import { getTenantCoaches } from "@/lib/memberships";
import { isBundesland } from "@/lib/feiertage";
import { MASSNAHME_TYPEN, MASSNAHME_TYP_LABEL } from "@/lib/massnahme-typ";

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

  const avgsNummer = String(formData.get("avgsNummer") ?? "").trim();
  const durchfuehrungsort = String(
    formData.get("durchfuehrungsort") ?? "",
  ).trim();
  const anzahlBewilligteUeRaw = String(
    formData.get("anzahlBewilligteUe") ?? "",
  ).trim();
  const bedarfstraegerId = String(formData.get("bedarfstraegerId") ?? "").trim();
  // Kompetenzteam (1–n Coaches). Reihenfolge erhalten, dedupliziert.
  const coachIds = Array.from(
    new Set(
      formData
        .getAll("coachIds")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  );
  const massnahmeTypRaw = String(formData.get("massnahmeTyp") ?? "").trim();
  const bundeslandRaw = String(formData.get("bundesland") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();

  // Kunde (genau einer, 1:1).
  const customerName = String(formData.get("p_name") ?? "").trim();
  const customerEmail = String(formData.get("p_email") ?? "")
    .trim()
    .toLowerCase();
  const customerKundenNr = String(formData.get("p_kundennr") ?? "").trim();

  if (
    !MASSNAHME_TYPEN.includes(massnahmeTypRaw as (typeof MASSNAHME_TYPEN)[number])
  ) {
    return { error: "Ungültiger Maßnahme-Typ. Bitte aus der Liste wählen." };
  }
  const massnahmeTyp = massnahmeTypRaw as (typeof MASSNAHME_TYPEN)[number];
  // Kein Freitext-Titel mehr: der Titel ist das Label des Maßnahmentyps.
  const title = MASSNAHME_TYP_LABEL[massnahmeTyp];

  // Bundesland ist Pflicht für neue Kunden — Grundlage der Feiertags-Warnung.
  if (!isBundesland(bundeslandRaw)) {
    return { error: "Bitte ein Bundesland aus der Liste wählen." };
  }
  const bundesland = bundeslandRaw;

  if (
    !avgsNummer ||
    !durchfuehrungsort ||
    !anzahlBewilligteUeRaw ||
    !bedarfstraegerId ||
    coachIds.length === 0 ||
    !startDate ||
    !endDate
  ) {
    return {
      error: "Bitte alle Kurs-Felder ausfüllen (inkl. mindestens einem Coach).",
    };
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

  // Team serverseitig tenant-scoped validieren — der Client ist manipulierbar;
  // ein BT darf nur eigene Coaches ins Team nehmen. `coachIds[0]` wird der
  // primäre/anlegende Coach (courses.coach_id), alle landen in course_coaches.
  const tenantCoachIds = new Set(
    (await getTenantCoaches(tenantId)).map((c) => c.id),
  );
  if (coachIds.some((id) => !tenantCoachIds.has(id))) {
    return {
      error:
        "Mindestens ein gewählter Coach gehört nicht (mehr) zu diesem Bildungsträger.",
    };
  }
  const primaryCoachId = coachIds[0]!;

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
          coachId: primaryCoachId,
          participantId,
          title,
          avgsNummer,
          durchfuehrungsort,
          anzahlBewilligteUe,
          bedarfstraegerId,
          massnahmeTyp,
          bundesland,
          startDate,
          endDate,
        })
        .returning({ id: schema.courses.id });
      if (!course) throw new Error("COURSE_INSERT_FAILED");
      // Kompetenzteam materialisieren (inkl. primärem Coach).
      await tx
        .insert(schema.courseCoaches)
        .values(coachIds.map((cid) => ({ courseId: course.id, coachId: cid })));
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

/**
 * Bildungsträger bearbeitet die Stammdaten eines bestehenden Kunden — Maßnahme-
 * Felder (AVGS, Ort, UE, Bedarfsträger, Typ, Bundesland, Zeitraum, zugewiesener
 * Coach) UND die Kunden-Person (Name, E-Mail, Kunden-Nr.). Reine Stammdaten:
 * Signaturen, Termine und FES-Gates bleiben unangetastet — geändert wird nur,
 * was nicht an einer Unterschrift hängt. `courseId` kommt als Hidden-Feld.
 */
export async function updateCourse(
  _prev: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kunde nicht angegeben." };

  // Besitz prüfen: Kurs muss zum Tenant des BT gehören (Coach-Join).
  const [course] = await db
    .select({
      id: schema.courses.id,
      participantId: schema.courses.participantId,
    })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.users.tenantId, tenantId),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);
  if (!course) return { error: "Kunde nicht gefunden." };

  const avgsNummer = String(formData.get("avgsNummer") ?? "").trim();
  const durchfuehrungsort = String(
    formData.get("durchfuehrungsort") ?? "",
  ).trim();
  const anzahlBewilligteUeRaw = String(
    formData.get("anzahlBewilligteUe") ?? "",
  ).trim();
  const bedarfstraegerId = String(formData.get("bedarfstraegerId") ?? "").trim();
  const coachIds = Array.from(
    new Set(
      formData
        .getAll("coachIds")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  );
  const massnahmeTypRaw = String(formData.get("massnahmeTyp") ?? "").trim();
  const bundeslandRaw = String(formData.get("bundesland") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const customerName = String(formData.get("p_name") ?? "").trim();
  const customerEmail = String(formData.get("p_email") ?? "")
    .trim()
    .toLowerCase();
  const customerKundenNr = String(formData.get("p_kundennr") ?? "").trim();

  if (
    !MASSNAHME_TYPEN.includes(massnahmeTypRaw as (typeof MASSNAHME_TYPEN)[number])
  ) {
    return { error: "Ungültiger Maßnahme-Typ. Bitte aus der Liste wählen." };
  }
  const massnahmeTyp = massnahmeTypRaw as (typeof MASSNAHME_TYPEN)[number];
  const title = MASSNAHME_TYP_LABEL[massnahmeTyp];

  if (!isBundesland(bundeslandRaw)) {
    return { error: "Bitte ein Bundesland aus der Liste wählen." };
  }
  const bundesland = bundeslandRaw;

  if (
    !avgsNummer ||
    !durchfuehrungsort ||
    !anzahlBewilligteUeRaw ||
    !bedarfstraegerId ||
    coachIds.length === 0 ||
    !startDate ||
    !endDate
  ) {
    return {
      error: "Bitte alle Kurs-Felder ausfüllen (inkl. mindestens einem Coach).",
    };
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

  const tenantCoachIds = new Set(
    (await getTenantCoaches(tenantId)).map((c) => c.id),
  );
  if (coachIds.some((id) => !tenantCoachIds.has(id))) {
    return {
      error:
        "Mindestens ein gewählter Coach gehört nicht (mehr) zu diesem Bildungsträger.",
    };
  }
  const primaryCoachId = coachIds[0]!;

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
  if (!bt) return { error: "Der gewählte Bedarfsträger existiert nicht (mehr)." };

  try {
    await db.transaction(async (tx) => {
      // Kunden-Person aktualisieren (tenant-scoped). Achtung: bei geteilter
      // E-Mail/Person über mehrere Maßnahmen wirkt das auf alle.
      await tx
        .update(schema.participants)
        .set({
          name: customerName,
          email: customerEmail,
          kundenNr: customerKundenNr,
        })
        .where(
          and(
            eq(schema.participants.id, course.participantId),
            eq(schema.participants.tenantId, tenantId),
          ),
        );

      await tx
        .update(schema.courses)
        .set({
          coachId: primaryCoachId,
          title,
          avgsNummer,
          durchfuehrungsort,
          anzahlBewilligteUe,
          bedarfstraegerId,
          massnahmeTyp,
          bundesland,
          startDate,
          endDate,
        })
        .where(eq(schema.courses.id, courseId));

      // Kompetenzteam synchronisieren (diff). Einen Coach, dem in diesem Kurs
      // bereits Termine zugewiesen sind, darf der BT NICHT aus dem Team nehmen —
      // sonst hingen dessen (ggf. signierte) Termine an einem Nicht-Mitglied.
      const existing = await tx
        .select({ coachId: schema.courseCoaches.coachId })
        .from(schema.courseCoaches)
        .where(eq(schema.courseCoaches.courseId, courseId));
      const existingIds = new Set(existing.map((r) => r.coachId));
      const nextIds = new Set(coachIds);
      const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
      const toAdd = coachIds.filter((id) => !existingIds.has(id));

      if (toRemove.length > 0) {
        const [blocked] = await tx
          .select({ id: schema.sessions.id })
          .from(schema.sessions)
          .where(
            and(
              eq(schema.sessions.courseId, courseId),
              inArray(schema.sessions.coachId, toRemove),
              isNull(schema.sessions.deletedAt),
            ),
          )
          .limit(1);
        if (blocked) throw new Error("COACH_HAS_SESSIONS");
        await tx
          .delete(schema.courseCoaches)
          .where(
            and(
              eq(schema.courseCoaches.courseId, courseId),
              inArray(schema.courseCoaches.coachId, toRemove),
            ),
          );
      }
      if (toAdd.length > 0) {
        await tx
          .insert(schema.courseCoaches)
          .values(toAdd.map((cid) => ({ courseId, coachId: cid })));
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "COACH_HAS_SESSIONS") {
      return {
        error:
          "Ein Coach mit bereits angelegten Terminen kann nicht aus dem Team entfernt werden. Entferne/öffne erst dessen Termine.",
      };
    }
    // Häufigster Fehler: E-Mail kollidiert mit einem anderen Kunden im Tenant.
    if (/unique|duplicate/i.test(message)) {
      return {
        error:
          "Diese Kunden-E-Mail ist im Tenant bereits einem anderen Kunden zugeordnet.",
      };
    }
    return { error: `Änderung fehlgeschlagen (${message}).` };
  }

  redirect("/bildungstraeger/courses");
}

async function requireOwnedCourse(courseId: string, tenantId: string) {
  const [course] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.users.tenantId, tenantId),
        isNull(schema.courses.deletedAt),
      ),
    )
    .limit(1);
  return course ?? null;
}

/** Einzelnen Kunden archivieren (status='archived'). */
export async function archiveCourse(formData: FormData): Promise<void> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);
  const courseId = String(formData.get("courseId") ?? "").trim();
  if (courseId && (await requireOwnedCourse(courseId, tenantId))) {
    await db
      .update(schema.courses)
      .set({ status: "archived" })
      .where(eq(schema.courses.id, courseId));
  }
  revalidatePath("/bildungstraeger/courses");
  redirect("/bildungstraeger/courses");
}

/** Archivierung rückgängig machen (status zurück auf 'active'). */
export async function unarchiveCourse(formData: FormData): Promise<void> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);
  const courseId = String(formData.get("courseId") ?? "").trim();
  if (courseId && (await requireOwnedCourse(courseId, tenantId))) {
    await db
      .update(schema.courses)
      .set({ status: "active" })
      .where(eq(schema.courses.id, courseId));
  }
  revalidatePath("/bildungstraeger/courses");
  redirect("/bildungstraeger/courses");
}

/**
 * Alle ABGESCHLOSSENEN Kunden (Maßnahme als abgeschlossen markiert,
 * `abgeschlossen_at` gesetzt) auf einmal archivieren — tenant-scoped, nur
 * noch nicht archivierte. Bequemes Aufräumen am Ende eines Durchlaufs.
 */
export async function archiveAllCompleted(): Promise<void> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);

  const owned = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .where(
      and(
        eq(schema.users.tenantId, tenantId),
        isNull(schema.courses.deletedAt),
        isNotNull(schema.courses.abgeschlossenAt),
        ne(schema.courses.status, "archived"),
      ),
    );
  for (const c of owned) {
    await db
      .update(schema.courses)
      .set({ status: "archived" })
      .where(eq(schema.courses.id, c.id));
  }
  revalidatePath("/bildungstraeger/courses");
  redirect("/bildungstraeger/courses");
}
