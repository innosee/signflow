"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db, schema } from "@/db";
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
