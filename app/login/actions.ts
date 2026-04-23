"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";

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

  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });

    const role = result.user?.role === "bildungstraeger" ? "bildungstraeger" : "coach";
    redirect(role === "bildungstraeger" ? "/bildungstraeger" : "/coach");
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "E-Mail oder Passwort ist falsch." };
    }
    throw err;
  }
}

export async function logoutAction(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
