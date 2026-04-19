"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { requireAgency, isImpersonating, getCurrentSession } from "@/lib/dal";

export type InviteFormState =
  | { error?: string; success?: string }
  | undefined;

export async function inviteCoach(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  await requireAgency();

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

  let createdUserId: string | null = null;
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

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: h,
    });
  } catch (err) {
    // Mail-Versand fehlgeschlagen → neu angelegten User wieder aufräumen,
    // sonst bleibt ein Coach mit zufälligem Passwort ohne Setz-Möglichkeit
    // zurück und die E-Mail-Adresse ist für eine Wiedereinladung blockiert.
    if (createdUserId) {
      await db
        .delete(schema.users)
        .where(eq(schema.users.id, createdUserId))
        .catch(() => {
          // Cleanup best-effort — in der Fehlermeldung steht, dass die
          // Agency sich ggf. manuell kümmern muss.
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

function backToAgencyWithError(code: string): never {
  redirect(`/agency?imp_error=${encodeURIComponent(code)}`);
}

export async function impersonateCoach(formData: FormData): Promise<void> {
  await requireAgency();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) backToAgencyWithError("invalid");

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

  if (!target) backToAgencyWithError("unknown");
  if (target.banned) backToAgencyWithError("banned");

  try {
    await auth.api.impersonateUser({
      body: { userId: target.id },
      headers: await headers(),
    });
  } catch (err) {
    // redirect() wirft intern NEXT_REDIRECT — nicht abfangen
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    if (err instanceof APIError) backToAgencyWithError("api");
    throw err;
  }
  redirect("/coach");
}

export async function stopImpersonating(): Promise<void> {
  const session = await getCurrentSession();
  if (!session || !isImpersonating(session)) return;

  await auth.api.stopImpersonating({ headers: await headers() });
  redirect("/agency");
}

export type SubmitAfaState =
  | { error?: string; submitted?: boolean }
  | undefined;

/**
 * Firma/Agency markiert den (bereits vom Coach gesiegelten) Stundennachweis
 * als an die AfA übermittelt. Aktuell rein dokumentarisch — die tatsächliche
 * Übermittlung (E-Mail-Anhang an den Bedarfsträger, Portal-Upload, o.ä.)
 * bleibt manueller Prozess, bis der Rechnungs-Flow in Phase 2 das koppelt.
 *
 * Nur `role=agency` darf das sehen/auslösen — Coaches haben auf AfA-
 * Übermittlung keinen Zugriff. Während Impersonation hart blockiert, weil
 * AfA-Übermittlung eine Firmen-Aktion ist und nicht unter Coach-Identität
 * laufen darf.
 */
export async function submitCourseToAfa(
  _prev: SubmitAfaState,
  formData: FormData,
): Promise<SubmitAfaState> {
  const session = await requireAgency();
  if (isImpersonating(session)) {
    return { error: "Während Impersonation nicht möglich." };
  }
  const agencyUserId = session.user.id;

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

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.finalDocuments)
      .set({
        afaStatus: "submitted",
        submittedToAfaAt: now,
        submittedBy: agencyUserId,
      })
      .where(eq(schema.finalDocuments.id, doc.id));

    await logAudit(
      {
        actorType: "agency",
        actorId: agencyUserId,
        action: "course.submit_afa",
        resourceType: "course",
        resourceId: courseId,
      },
      tx,
    );
  });

  revalidatePath("/agency/submissions");
  return { submitted: true };
}
