"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { requireBildungstraeger, isImpersonating, getCurrentSession } from "@/lib/dal";

export type InviteFormState =
  | { error?: string; success?: string }
  | undefined;

export async function inviteCoach(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  await requireBildungstraeger();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();

  if (!email || !name) {
    return { error: "Name und E-Mail sind erforderlich." };
  }

  // Random placeholder password. The coach sets their real one via the reset
  // email that goes out immediately after user creation.
  const placeholderPassword = crypto.randomBytes(32).toString("hex");

  const h = await headers();

  // Wenn dieselbe E-Mail schon mal als Coach existierte und soft-gelöscht
  // wurde, bleibt die `users`-Zeile in der DB stehen (mit `deletedAt`).
  // Better Auth's createUser checkt nur die E-Mail ohne unseren
  // deletedAt-Filter und schmeißt deshalb „User already exists" — obwohl
  // der Partial-Unique-Index ein Re-Insert technisch erlauben würde.
  // Statt zu re-inserten beleben wir die alte Zeile wieder: deletedAt +
  // banned werden zurückgesetzt, der Name aktualisiert. Audit-History
  // (gleiche user_id) bleibt erhalten. Better Auth's reset-flow setzt
  // dann das Passwort.
  const [existing] = await db
    .select({
      id: schema.users.id,
      deletedAt: schema.users.deletedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  let createdUserId: string | null = null;
  if (existing && existing.deletedAt) {
    // Resurrect-Pfad
    await db
      .update(schema.users)
      .set({
        deletedAt: null,
        banned: false,
        banReason: null,
        banExpires: null,
        emailVerified: false, // Einladung ausstehend bis Coach das Passwort setzt
        name,
        role: "coach",
        signingEnabled: false,
      })
      .where(eq(schema.users.id, existing.id));
    createdUserId = existing.id;
  } else if (existing && !existing.deletedAt) {
    // Aktive Zeile — wirklich Duplikat
    return { error: "Einladung fehlgeschlagen: Diese E-Mail-Adresse ist bereits registriert." };
  } else {
    try {
      const result = await auth.api.createUser({
        body: { email, name, password: placeholderPassword, role: "coach" },
        headers: h,
      });
      createdUserId = result.user?.id ?? null;
    } catch (err) {
      if (err instanceof APIError) {
        return { error: `Einladung fehlgeschlagen: ${err.message}` };
      }
      throw err;
    }
  }

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: h,
    });
  } catch (err) {
    // Mail-Versand fehlgeschlagen → den gerade angelegten/wiederbelebten
    // User soft-deleten, damit (a) keine aktive Zeile mit zufälligem
    // Passwort existiert und (b) die E-Mail-Adresse für eine erneute
    // Einladung wieder frei ist (Partial-Unique-Index auf email WHERE
    // deletedAt IS NULL).
    if (createdUserId) {
      await db
        .update(schema.users)
        .set({ deletedAt: new Date(), banned: true })
        .where(eq(schema.users.id, createdUserId))
        .catch(() => {
          // Cleanup best-effort — in der Fehlermeldung steht, dass die
          // Bildungsträger sich ggf. manuell kümmern muss.
        });
    }
    if (err instanceof APIError) {
      return {
        error: `Einladungs-E-Mail fehlgeschlagen (${err.message}). Der User wurde rückgängig gemacht, bitte erneut einladen.`,
      };
    }
    throw err;
  }

  return { success: `Einladung an ${email} versendet.` };
}

function backToBildungstraegerWithError(code: string): never {
  redirect(`/bildungstraeger?imp_error=${encodeURIComponent(code)}`);
}

export async function impersonateCoach(formData: FormData): Promise<void> {
  await requireBildungstraeger();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) backToBildungstraegerWithError("invalid");

  const [target] = await db
    .select({
      id: schema.users.id,
      banned: schema.users.banned,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.role, "coach"),
        isNull(schema.users.deletedAt),
      ),
    )
    .limit(1);

  if (!target) backToBildungstraegerWithError("unknown");
  if (target.banned) backToBildungstraegerWithError("banned");

  try {
    await auth.api.impersonateUser({
      body: { userId: target.id },
      headers: await headers(),
    });
  } catch (err) {
    // redirect() wirft intern NEXT_REDIRECT — nicht abfangen
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    if (err instanceof APIError) backToBildungstraegerWithError("api");
    throw err;
  }
  redirect("/coach");
}

export async function stopImpersonating(): Promise<void> {
  const session = await getCurrentSession();
  if (!session || !isImpersonating(session)) return;

  await auth.api.stopImpersonating({ headers: await headers() });
  redirect("/bildungstraeger");
}

/**
 * Per-Coach-Toggle für den `signing_enabled`-Flag. Standardmäßig sehen
 * Coaches nach dem Go-Live nur den Checker — der Bildungsträger schaltet
 * ausgewählte Pilot-Coaches frei (siehe ROADMAP.md → Rollout-Infrastruktur).
 *
 * Während Impersonation blockiert: sonst könnte ein Bildungsträger unter
 * Coach-Identität sich selbst den Flag setzen und die Beweiskette ist
 * sauberer, wenn role-mutierende Aktionen immer direkt laufen.
 */
export async function setCoachSigningEnabled(formData: FormData): Promise<void> {
  const session = await requireBildungstraeger();
  if (isImpersonating(session)) {
    redirect("/bildungstraeger?imp_error=invalid");
  }

  const coachId = String(formData.get("coachId") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!coachId) {
    redirect("/bildungstraeger?imp_error=invalid");
  }

  const [target] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, coachId),
        eq(schema.users.role, "coach"),
        isNull(schema.users.deletedAt),
      ),
    )
    .limit(1);
  if (!target) {
    redirect("/bildungstraeger?imp_error=unknown");
  }

  await db
    .update(schema.users)
    .set({ signingEnabled: enabled })
    .where(eq(schema.users.id, coachId));

  await logAudit({
    actorType: "bildungstraeger",
    actorId: session.user.id,
    action: enabled ? "coach.signing_enabled.on" : "coach.signing_enabled.off",
    resourceType: "user",
    resourceId: coachId,
  });

  revalidatePath("/bildungstraeger");
}

/**
 * Freigabe eines BERs trotz offener soft_flag-Hinweise. Der Bildungsträger
 * hat die Hinweise gesehen und entschieden, dass sie akzeptabel sind.
 * Setzt `softFlagsAcknowledgedAt` + `softFlagsAcknowledgedBy` auf der BER-
 * Zeile und loggt den Vorgang. Blockiert während Impersonation, damit die
 * Ack rechtlich klar dem Bildungsträger zuzuordnen ist.
 */
export async function acknowledgeSoftFlags(
  formData: FormData,
): Promise<void> {
  const session = await requireBildungstraeger();
  if (isImpersonating(session)) {
    redirect("/bildungstraeger?imp_error=invalid");
  }
  const berId = String(formData.get("berId") ?? "").trim();
  if (!berId) return;

  const [existing] = await db
    .select({
      id: schema.abschlussberichte.id,
      alreadyAckAt: schema.abschlussberichte.softFlagsAcknowledgedAt,
    })
    .from(schema.abschlussberichte)
    .where(eq(schema.abschlussberichte.id, berId))
    .limit(1);
  if (!existing) return;
  if (existing.alreadyAckAt) {
    // Ack ist idempotent — nichts tun, aber revalidate damit der UI-State
    // konsistent ist, falls es eine Race war.
    revalidatePath(`/bildungstraeger/abschlussberichte/${berId}`);
    return;
  }

  const now = new Date();
  await db
    .update(schema.abschlussberichte)
    .set({
      softFlagsAcknowledgedAt: now,
      softFlagsAcknowledgedBy: session.user.id,
    })
    .where(eq(schema.abschlussberichte.id, berId));

  await logAudit({
    actorType: "bildungstraeger",
    actorId: session.user.id,
    action: "ber.soft_flags.acknowledged",
    resourceType: "abschlussbericht",
    resourceId: berId,
  });

  revalidatePath(`/bildungstraeger/abschlussberichte/${berId}`);
  revalidatePath("/bildungstraeger");
}

/**
 * Soft-Delete eines Coaches durch den Bildungsträger. Blockiert, wenn der
 * Coach noch nicht-archivierte Kurse hat — sonst würde der Kurs-Besitz
 * plötzlich auf eine „gelöschte" User-ID verweisen und die Bildungsträger-
 * Übersicht kann nicht mehr sauber filtern. Dank des Partial-Unique-Index
 * auf `email WHERE deleted_at IS NULL` kann dieselbe E-Mail danach wieder
 * eingeladen werden. Während Impersonation hart blockiert — role-mutierende
 * Aktionen laufen nie unter Coach-Identität.
 */
export async function deleteCoach(formData: FormData): Promise<void> {
  const session = await requireBildungstraeger();
  if (isImpersonating(session)) {
    redirect("/bildungstraeger?imp_error=invalid");
  }

  const coachId = String(formData.get("coachId") ?? "").trim();
  if (!coachId) {
    redirect("/bildungstraeger?imp_error=invalid");
  }

  const [target] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, coachId),
        eq(schema.users.role, "coach"),
        isNull(schema.users.deletedAt),
      ),
    )
    .limit(1);
  if (!target) {
    redirect("/bildungstraeger?imp_error=unknown");
  }

  const [activeCourses] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.coachId, coachId),
        isNull(schema.courses.deletedAt),
        ne(schema.courses.status, "archived"),
      ),
    );
  if ((activeCourses?.count ?? 0) > 0) {
    redirect("/bildungstraeger?imp_error=has_courses");
  }

  await db
    .update(schema.users)
    .set({ deletedAt: new Date(), banned: true })
    .where(eq(schema.users.id, coachId));

  await logAudit({
    actorType: "bildungstraeger",
    actorId: session.user.id,
    action: "coach.delete",
    resourceType: "user",
    resourceId: coachId,
  });

  revalidatePath("/bildungstraeger");
}

export type SubmitAfaState =
  | { error?: string; submitted?: boolean }
  | undefined;

/**
 * Firma/Bildungsträger markiert den (bereits vom Coach gesiegelten) Stundennachweis
 * als an die AfA übermittelt. Aktuell rein dokumentarisch — die tatsächliche
 * Übermittlung (E-Mail-Anhang an den Bedarfsträger, Portal-Upload, o.ä.)
 * bleibt manueller Prozess, bis der Rechnungs-Flow in Phase 2 das koppelt.
 *
 * Nur `role=bildungstraeger` darf das sehen/auslösen — Coaches haben auf AfA-
 * Übermittlung keinen Zugriff. Während Impersonation hart blockiert, weil
 * AfA-Übermittlung eine Firmen-Aktion ist und nicht unter Coach-Identität
 * laufen darf.
 */
export async function submitCourseToAfa(
  _prev: SubmitAfaState,
  formData: FormData,
): Promise<SubmitAfaState> {
  const session = await requireBildungstraeger();
  if (isImpersonating(session)) {
    return { error: "Während Impersonation nicht möglich." };
  }
  const bildungstraegerUserId = session.user.id;

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kurs fehlt." };

  const [doc] = await db
    .select({
      id: schema.finalDocuments.id,
      fesStatus: schema.finalDocuments.fesStatus,
      afaStatus: schema.finalDocuments.afaStatus,
    })
    .from(schema.finalDocuments)
    .where(eq(schema.finalDocuments.courseId, courseId))
    .limit(1);
  if (!doc) return { error: "Kurs ist noch nicht gesiegelt." };
  if (doc.fesStatus !== "completed") {
    return { error: "FES-Siegel fehlt — erst muss der Coach siegeln." };
  }
  if (doc.afaStatus === "submitted") {
    return { error: "Kurs wurde bereits an die AfA übermittelt." };
  }

  // Atomares Submit: WHERE afa_status='pending' verhindert, dass zwei
  // parallele Requests beide `submitted` setzen. Wir prüfen danach ob
  // wirklich eine Zeile geschrieben wurde — nur dann das Audit-Log
  // schreiben, sonst doppeltes Log bei Concurrent-Submit.
  const now = new Date();
  const submittedByAction = await db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.finalDocuments)
      .set({
        afaStatus: "submitted",
        submittedToAfaAt: now,
        submittedBy: bildungstraegerUserId,
      })
      .where(
        and(
          eq(schema.finalDocuments.id, doc.id),
          eq(schema.finalDocuments.afaStatus, "pending"),
        ),
      )
      .returning({ id: schema.finalDocuments.id });

    if (updated.length === 0) return false;

    await logAudit(
      {
        actorType: "bildungstraeger",
        actorId: bildungstraegerUserId,
        action: "course.submit_afa",
        resourceType: "course",
        resourceId: courseId,
      },
      tx,
    );
    return true;
  });

  if (!submittedByAction) {
    return { error: "Kurs wurde zwischenzeitlich bereits übermittelt." };
  }

  revalidatePath("/bildungstraeger/submissions");
  return { submitted: true };
}
