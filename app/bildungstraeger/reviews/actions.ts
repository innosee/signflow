"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { getTenantId, isImpersonating, requireBildungstraeger } from "@/lib/dal";
import {
  sendReviewApprovedToCoach,
  sendReviewChangesToCoach,
} from "@/lib/email";

export type ReviewDecisionState =
  | { error?: string; success?: boolean }
  | undefined;

/**
 * Lädt einen Kurs tenant-scoped (über den Coach-Join) und liefert die zur
 * Entscheidung nötigen Felder. Verhindert, dass ein BT durch courseId-
 * Manipulation einen Kurs eines fremden Mandanten freigibt.
 */
async function loadReviewCourse(courseId: string, tenantId: string) {
  const [row] = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      reviewStatus: schema.courses.reviewStatus,
      coachId: schema.users.id,
      coachName: schema.users.name,
      coachEmail: schema.users.email,
    })
    .from(schema.courses)
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .where(
      and(
        eq(schema.courses.id, courseId),
        eq(schema.users.tenantId, tenantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Bildungsträger gibt die geprüfte Anwesenheitsliste frei → der Coach darf
 * jetzt mit FES versiegeln. Nur aus dem Zustand `pending` heraus möglich.
 */
export async function approveCourseReview(
  _prev: ReviewDecisionState,
  formData: FormData,
): Promise<ReviewDecisionState> {
  const session = await requireBildungstraeger();
  if (isImpersonating(session)) {
    return { error: "Während Impersonation nicht möglich." };
  }
  const btUserId = session.user.id;
  const tenantId = getTenantId(session);

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kurs fehlt." };
  const note = String(formData.get("note") ?? "").trim();

  const course = await loadReviewCourse(courseId, tenantId);
  if (!course) return { error: "Kurs nicht gefunden." };
  if (course.reviewStatus !== "pending") {
    return {
      error:
        "Dieser Kurs steht aktuell nicht zur Prüfung (eventuell hat der Coach Termine geändert).",
    };
  }

  const now = new Date();
  const decided = await db.transaction(async (tx) => {
    // Atomar: nur freigeben, wenn noch 'pending' — verhindert Doppel-
    // Entscheidung bei Concurrent-Klicks.
    const updated = await tx
      .update(schema.courses)
      .set({
        reviewStatus: "approved",
        reviewDecidedAt: now,
        reviewDecidedBy: btUserId,
      })
      .where(
        and(
          eq(schema.courses.id, courseId),
          eq(schema.courses.reviewStatus, "pending"),
        ),
      )
      .returning({ id: schema.courses.id });
    if (updated.length === 0) return false;

    await tx.insert(schema.courseReviewNotes).values({
      courseId,
      authorType: "bildungstraeger",
      authorId: btUserId,
      kind: "approve",
      body: note || null,
    });
    await logAudit(
      {
        actorType: "bildungstraeger",
        actorId: btUserId,
        action: "course.review_approved",
        resourceType: "course",
        resourceId: courseId,
      },
      tx,
    );
    return true;
  });

  if (!decided) {
    return { error: "Der Status hat sich zwischenzeitlich geändert." };
  }

  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    await sendReviewApprovedToCoach({
      to: course.coachEmail,
      coachName: course.coachName,
      courseTitle: course.title,
      url: `${base}/coach/courses/${courseId}`,
    });
  } catch (err) {
    console.error(`review-approved notification failed for course ${courseId}:`, err);
  }

  revalidatePath(`/bildungstraeger/reviews/${courseId}`);
  revalidatePath("/bildungstraeger/reviews");
  revalidatePath("/bildungstraeger");
  return { success: true };
}

/**
 * Bildungsträger fordert eine Nachbesserung an. Pflicht-Notiz (der Coach
 * braucht zu wissen, was zu korrigieren ist). Setzt den Status auf
 * `changes_requested` — der Coach kann dann Termine editieren und neu
 * einreichen.
 */
export async function requestCourseChanges(
  _prev: ReviewDecisionState,
  formData: FormData,
): Promise<ReviewDecisionState> {
  const session = await requireBildungstraeger();
  if (isImpersonating(session)) {
    return { error: "Während Impersonation nicht möglich." };
  }
  const btUserId = session.user.id;
  const tenantId = getTenantId(session);

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kurs fehlt." };
  const note = String(formData.get("note") ?? "").trim();
  if (note.length === 0) {
    return {
      error:
        "Bitte beschreibe, was nachgebessert werden soll — der Coach sieht diese Notiz.",
    };
  }

  const course = await loadReviewCourse(courseId, tenantId);
  if (!course) return { error: "Kurs nicht gefunden." };
  if (course.reviewStatus !== "pending") {
    return {
      error:
        "Dieser Kurs steht aktuell nicht zur Prüfung (eventuell hat der Coach Termine geändert).",
    };
  }

  const now = new Date();
  const decided = await db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.courses)
      .set({
        reviewStatus: "changes_requested",
        reviewDecidedAt: now,
        reviewDecidedBy: btUserId,
      })
      .where(
        and(
          eq(schema.courses.id, courseId),
          eq(schema.courses.reviewStatus, "pending"),
        ),
      )
      .returning({ id: schema.courses.id });
    if (updated.length === 0) return false;

    await tx.insert(schema.courseReviewNotes).values({
      courseId,
      authorType: "bildungstraeger",
      authorId: btUserId,
      kind: "changes",
      body: note,
    });
    await logAudit(
      {
        actorType: "bildungstraeger",
        actorId: btUserId,
        action: "course.review_changes_requested",
        resourceType: "course",
        resourceId: courseId,
      },
      tx,
    );
    return true;
  });

  if (!decided) {
    return { error: "Der Status hat sich zwischenzeitlich geändert." };
  }

  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    await sendReviewChangesToCoach({
      to: course.coachEmail,
      coachName: course.coachName,
      courseTitle: course.title,
      note,
      url: `${base}/coach/courses/${courseId}`,
    });
  } catch (err) {
    console.error(`review-changes notification failed for course ${courseId}:`, err);
  }

  revalidatePath(`/bildungstraeger/reviews/${courseId}`);
  revalidatePath("/bildungstraeger/reviews");
  revalidatePath("/bildungstraeger");
  return { success: true };
}
