"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, gt, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import {
  sendCourseAssignedToCoach,
  sendParticipantEmailChangedToCoach,
} from "@/lib/email";
import {
  assertNotImpersonating,
  getTenantId,
  requireBildungstraeger,
} from "@/lib/dal";
import { getTenantCoaches } from "@/lib/memberships";
import { parseCourseForm, type ParsedCourseForm } from "@/lib/course-form";

export type CourseFormState =
  | {
      error?: string;
      /**
       * Nicht-blockierender Hinweis: die eingegebene Kunden-E-Mail existiert im
       * Tenant bereits. Der BT bestätigt mit `confirmShared`, dass die
       * Stammdaten geteilt werden (eine Person, mehrere Maßnahmen).
       */
      duplicateHint?: string;
    }
  | undefined;

/**
 * Tenant-scoped Referenz-Prüfung: Coach-Team und Bedarfsträger müssen zum
 * Tenant des BT gehören (der Client ist manipulierbar — ein BT darf nur eigene
 * Coaches ins Team nehmen). Separat von `parseCourseForm`, weil DB-Zugriff nötig.
 */
async function validateCourseRefs(
  values: ParsedCourseForm,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenantCoachIds = new Set(
    (await getTenantCoaches(tenantId)).map((c) => c.id),
  );
  if (values.coachIds.some((id) => !tenantCoachIds.has(id))) {
    return {
      ok: false,
      error:
        "Mindestens ein gewählter Coach gehört nicht (mehr) zu diesem Bildungsträger.",
    };
  }

  const [bt] = await db
    .select({ id: schema.bedarfstraeger.id })
    .from(schema.bedarfstraeger)
    .where(
      and(
        eq(schema.bedarfstraeger.id, values.bedarfstraegerId),
        eq(schema.bedarfstraeger.tenantId, tenantId),
        isNull(schema.bedarfstraeger.deletedAt),
      ),
    )
    .limit(1);
  if (!bt) {
    return { ok: false, error: "Der gewählte Bedarfsträger existiert nicht (mehr)." };
  }
  return { ok: true };
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

  const parsed = parseCourseForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const {
    avgsNummer,
    durchfuehrungsort,
    anzahlBewilligteUe,
    bedarfstraegerId,
    coachIds,
    primaryCoachId,
    massnahmeTyp,
    title,
    bundesland,
    avgsGueltigVon,
    avgsGueltigBis,
    startDate,
    endDate,
    customerName,
    customerEmail,
    customerKundenNr,
  } = parsed.values;

  const refs = await validateCourseRefs(parsed.values, tenantId);
  if (!refs.ok) return { error: refs.error };

  // Nicht-blockierender Hinweis: existiert die Kunden-E-Mail im Tenant schon,
  // wird der bestehende Stammdatensatz wiederverwendet (eine Person, mehrere
  // Maßnahmen — Stammdaten-Änderungen wirken dann auf alle). Beim ersten Submit
  // bekommt der BT den Hinweis; mit `confirmShared` legt er bewusst trotzdem an.
  const confirmShared = formData.get("confirmShared") === "true";
  const [existingCustomer] = await db
    .select({ name: schema.participants.name })
    .from(schema.participants)
    .where(
      and(
        eq(schema.participants.email, customerEmail),
        eq(schema.participants.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (existingCustomer && !confirmShared) {
    return {
      duplicateHint: `Diese E-Mail ist bereits als Kunde „${existingCustomer.name}" angelegt. Beim Anlegen wird derselbe Stammdatensatz verwendet — spätere Änderungen an Name/E-Mail/Kunden-Nr. wirken dann auf ALLE Maßnahmen dieser Person. Zum bewussten Fortfahren bestätigen.`,
    };
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
          avgsGueltigVon,
          avgsGueltigBis,
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

  // Zugewiesene Coaches benachrichtigen (best-effort — der Kunde ist bereits
  // angelegt; ein Mail-Fehler darf die Anlage nicht zurückrollen).
  await notifyAssignedCoaches(newCourseId, coachIds, customerName, title);

  // ?created=<id> signalisiert der Liste den frischen Abschluss → dort feuert
  // ein Client-Tracker das course_published-Event (window.track) und entfernt
  // den Param wieder. Die Server-Action redirectet, kann also nicht selbst
  // client-seitig tracken.
  redirect(`/bildungstraeger/courses?created=${newCourseId}`);
}

/**
 * Schickt den zugewiesenen Coaches die „Neuer Kunde zugewiesen"-Mail. Best-
 * effort: Fehler werden geloggt, nicht geworfen — der Kunde existiert dann
 * trotzdem. Wird beim Anlegen (alle Coaches) und beim Bearbeiten (nur neu
 * hinzugefügte) genutzt.
 */
async function notifyAssignedCoaches(
  courseId: string,
  coachIds: string[],
  customerName: string,
  courseTitle: string,
): Promise<void> {
  if (coachIds.length === 0) return;
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const coaches = await db
      .select({ name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .where(inArray(schema.users.id, coachIds));
    const results = await Promise.allSettled(
      coaches.map((c) =>
        sendCourseAssignedToCoach({
          to: c.email,
          coachName: c.name,
          customerName,
          courseTitle,
          url: `${base}/coach/courses/${courseId}`,
        }),
      ),
    );
    results.forEach((r) => {
      if (r.status === "rejected") {
        console.error(
          `course-assigned notification failed for course ${courseId}:`,
          r.reason,
        );
      }
    });
  } catch (err) {
    console.error(
      `course-assigned notification lookup failed for course ${courseId}:`,
      err,
    );
  }
}

/**
 * Nach einer Kunden-E-Mail-Korrektur: alle Coaches benachrichtigen, deren
 * Maßnahme dieses (ggf. geteilten) Kunden noch offene, auf eine TN-Unterschrift
 * wartende Termine hat (`status='coach_signed'`) — nur dort ist ein erneutes
 * Einladen überhaupt nötig. Best-effort, blockiert das Speichern nie.
 */
async function notifyCoachesParticipantEmailChanged(
  participantId: string,
  tenantId: string,
): Promise<void> {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const rows = await db
      .selectDistinct({
        courseId: schema.courses.id,
        courseTitle: schema.courses.title,
        customerName: schema.participants.name,
        coachName: schema.users.name,
        coachEmail: schema.users.email,
      })
      .from(schema.courses)
      .innerJoin(
        schema.participants,
        eq(schema.participants.id, schema.courses.participantId),
      )
      .innerJoin(
        schema.sessions,
        eq(schema.sessions.courseId, schema.courses.id),
      )
      // Den für den offenen Termin VERANTWORTLICHEN Coach adressieren —
      // sessions.coachId (Kompetenzteam) mit Fallback auf den Kurs-Lead.
      // Spiegelt die Zuständigkeit der Coach-Seite (assignedToMe).
      .innerJoin(
        schema.users,
        eq(
          schema.users.id,
          sql`coalesce(${schema.sessions.coachId}, ${schema.courses.coachId})`,
        ),
      )
      .where(
        and(
          eq(schema.courses.participantId, participantId),
          eq(schema.users.tenantId, tenantId),
          ne(schema.courses.status, "archived"),
          isNull(schema.courses.deletedAt),
          eq(schema.sessions.status, "coach_signed"),
          isNull(schema.sessions.deletedAt),
        ),
      );
    const results = await Promise.allSettled(
      rows.map((r) =>
        sendParticipantEmailChangedToCoach({
          to: r.coachEmail,
          coachName: r.coachName,
          customerName: r.customerName,
          courseTitle: r.courseTitle,
          url: `${base}/coach/courses/${r.courseId}`,
        }),
      ),
    );
    results.forEach((res) => {
      if (res.status === "rejected") {
        console.error(
          `email-changed notification failed for participant ${participantId}:`,
          res.reason,
        );
      }
    });
  } catch (err) {
    console.error(
      `email-changed notification lookup failed for participant ${participantId}:`,
      err,
    );
  }
}

/**
 * Bildungsträger bearbeitet die Stammdaten eines bestehenden Kunden — Maßnahme-
 * Felder (AVGS, Ort, UE, Bedarfsträger, Typ, Bundesland, Zeitraum, zugewiesener
 * Coach) UND die Kunden-Person (Name, E-Mail, Kunden-Nr.). Signaturen, Termine
 * und FES-Gates bleiben unangetastet — geändert wird nur, was nicht an einer
 * Unterschrift hängt. `courseId` kommt als Hidden-Feld.
 *
 * AUSNAHME E-Mail-Korrektur: Ändert sich die Kunden-E-Mail, sind die bisher
 * verschickten Magic-Links wertlos (gingen an die alte Adresse). Sie werden
 * revoked (`participant_access_tokens.used_at`) und die betroffenen Coaches
 * per Mail informiert, dass sie den TN erneut einladen müssen. Signaturen
 * bleiben erhalten — nur offene Termine brauchen einen neuen Link.
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
      participantEmail: schema.participants.email,
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
  if (!course) return { error: "Kunde nicht gefunden." };

  const parsed = parseCourseForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const {
    avgsNummer,
    durchfuehrungsort,
    anzahlBewilligteUe,
    bedarfstraegerId,
    coachIds,
    primaryCoachId,
    massnahmeTyp,
    title,
    bundesland,
    avgsGueltigVon,
    avgsGueltigBis,
    startDate,
    endDate,
    customerName,
    customerEmail,
    customerKundenNr,
  } = parsed.values;

  // E-Mail-Korrektur erkennen: die bisher verschickten Magic-Links zeigten auf
  // die alte Adresse. Bei einer Änderung müssen sie revoked werden und der
  // Coach den TN erneut einladen (sonst „wartet auf TN"-Limbo).
  const emailChanged =
    course.participantEmail.trim().toLowerCase() !==
    customerEmail.trim().toLowerCase();

  const refs = await validateCourseRefs(parsed.values, tenantId);
  if (!refs.ok) return { error: refs.error };

  // Startdatum darf nicht ≤ einem bereits erfassten Erstgespräch liegen — das
  // Erstgespräch findet vor dem Coaching-Start statt (schließt das Schlupfloch,
  // dass der BT das Startdatum nachträglich vor das Erstgespräch setzt).
  if (startDate) {
    const [erstgespraech] = await db
      .select({ sessionDate: schema.sessions.sessionDate })
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.courseId, courseId),
          eq(schema.sessions.isErstgespraech, true),
          isNull(schema.sessions.deletedAt),
        ),
      )
      .limit(1);
    if (erstgespraech && erstgespraech.sessionDate >= startDate) {
      const [y, m, d] = erstgespraech.sessionDate.split("-");
      return {
        error: `Das Startdatum muss nach dem erfassten Erstgespräch (${d}.${m}.${y}) liegen.`,
      };
    }
  }

  let addedCoachIds: string[] = [];
  try {
    addedCoachIds = await db.transaction(async (tx) => {
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

      if (emailChanged) {
        // Alt-Links zeigten auf die falsche Adresse → explizit revoken
        // (used_at). Greift über ALLE Maßnahmen dieses (ggf. geteilten)
        // Kunden. Die Coach-Seite leitet daraus „Teilnehmer (erneut)
        // einladen" ab; Coach-/TN-Signaturen bleiben unangetastet.
        await tx
          .update(schema.participantAccessTokens)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(
                schema.participantAccessTokens.participantId,
                course.participantId,
              ),
              isNull(schema.participantAccessTokens.usedAt),
              gt(schema.participantAccessTokens.expiresAt, new Date()),
            ),
          );
      }

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
          avgsGueltigVon,
          avgsGueltigBis,
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
      return toAdd;
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

  // Nur NEU ins Team aufgenommene Coaches benachrichtigen — wer schon zugewiesen
  // war, bekommt beim reinen Stammdaten-Edit keine erneute Mail.
  await notifyAssignedCoaches(courseId, addedCoachIds, customerName, title);

  // E-Mail-Korrektur: Coaches mit offenen (auf TN wartenden) Terminen dieses
  // Kunden aktiv informieren, dass sie den TN an die neue Adresse erneut
  // einladen müssen.
  if (emailChanged) {
    await notifyCoachesParticipantEmailChanged(course.participantId, tenantId);
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
 * Kunden HART löschen — unwiderruflich (v.a. zum Aufräumen in der Testphase).
 * Anders als „Archivieren" (status) oder Soft-Delete (deletedAt) verschwindet
 * der Kurs physisch aus der DB; der FK-Cascade räumt Termine, Signaturen,
 * Magic-Link-Tokens, TN-Freigaben, Review-Notizen, Berichte und das finale
 * Dokument mit weg — auch wenn der Coach bereits unterschrieben hat. Es gibt
 * KEINE Wiederherstellung.
 *
 * Die Kunden-Person (participants) wird nur mitgelöscht, wenn sie an keiner
 * weiteren Maßnahme mehr hängt — geteilte Stammdaten (eine Person, mehrere
 * Maßnahmen) bleiben erhalten. Während Impersonation hart blockiert.
 */
export async function deleteCourse(formData: FormData): Promise<void> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);
  const courseId = String(formData.get("courseId") ?? "").trim();
  const confirmName = String(formData.get("confirmName") ?? "").trim();

  if (courseId) {
    // Besitz tenant-scoped prüfen und participantId + Name für die Aufräum-
    // bzw. Bestätigungs-Logik holen.
    const [course] = await db
      .select({
        id: schema.courses.id,
        participantId: schema.courses.participantId,
        participantName: schema.participants.name,
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

    // Tippbestätigung serverseitig gegenprüfen — der Client ist manipulierbar.
    // Bei Mismatch wird kommentarlos NICHT gelöscht (defensive No-Op).
    const nameConfirmed =
      !!course &&
      confirmName.toLowerCase() === course.participantName.trim().toLowerCase();

    if (course && nameConfirmed) {
      // Audit-Eintrag + Hard-Delete atomar. resource_id ist kein FK, der
      // Log-Eintrag überlebt das Löschen des Kurses.
      await db.transaction(async (tx) => {
        await logAudit(
          {
            actorType: "bildungstraeger",
            actorId: session.user.id,
            action: "course.delete",
            resourceType: "course",
            resourceId: courseId,
          },
          tx,
        );
        await tx.delete(schema.courses).where(eq(schema.courses.id, courseId));
      });

      // Verwaiste Kunden-Person aufräumen: nur löschen, wenn keine weitere
      // Maßnahme mehr auf sie zeigt. Best-effort und außerhalb der Lösch-
      // Transaction — eine verbleibende Referenz (z.B. ein Ad-hoc-Bericht)
      // darf das Kurs-Löschen nicht zurückrollen, dann bleibt die Person.
      try {
        const [remaining] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.courses)
          .where(eq(schema.courses.participantId, course.participantId));
        if ((remaining?.count ?? 0) === 0) {
          await db
            .delete(schema.participants)
            .where(eq(schema.participants.id, course.participantId));
        }
      } catch {
        // Verbleibende FK-Referenzen → Person bewusst behalten.
      }
    }
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
