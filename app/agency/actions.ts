"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";

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

  try {
    await auth.api.createUser({
      body: { email, name, password: placeholderPassword, role: "coach" },
      headers: h,
    });
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
    if (err instanceof APIError) {
      return {
        error: `Benutzer angelegt, aber Einladungs-E-Mail fehlgeschlagen: ${err.message}`,
      };
    }
    throw err;
  }

  return { success: `Einladung an ${email} versendet.` };
}

export async function impersonateCoach(formData: FormData): Promise<void> {
  await requireAgency();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  await auth.api.impersonateUser({
    body: { userId },
    headers: await headers(),
  });
  redirect("/coach");
}

export async function stopImpersonating(): Promise<void> {
  const session = await getCurrentSession();
  if (!session || !isImpersonating(session)) return;

  await auth.api.stopImpersonating({ headers: await headers() });
  redirect("/agency");
}
