"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";
import { clearActiveTenantCookie } from "@/lib/tenant-actions";

export type LoginFormState = { error?: string } | undefined;

export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "E-Mail und Passwort sind erforderlich." };
  }

  let role: "bildungstraeger" | "coach";
  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
    role = result.user?.role === "bildungstraeger" ? "bildungstraeger" : "coach";
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "E-Mail oder Passwort ist falsch." };
    }
    throw err;
  }

  // Jeder Login startet im „Heimat"-Kontext (users.tenant_id/role). Ein evtl.
  // aus einer früheren Sitzung übrig gebliebenes active_tenant_id-Cookie wird
  // gelöscht, damit Redirect-Rolle und aufgelöster aktiver Tenant konsistent
  // sind. Wechseln erfolgt danach über den Tenant-Switcher.
  await clearActiveTenantCookie();
  redirect(role === "bildungstraeger" ? "/bildungstraeger" : "/coach");
}

export async function logoutAction(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  await clearActiveTenantCookie();
  redirect("/login");
}
