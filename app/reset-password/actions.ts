"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";

export type ResetPasswordState = { error?: string } | undefined;

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) return { error: "Token fehlt." };
  if (password.length < 8) {
    return { error: "Passwort muss mindestens 8 Zeichen haben." };
  }
  if (password !== confirm) {
    return { error: "Passwörter stimmen nicht überein." };
  }

  try {
    await auth.api.resetPassword({
      body: { newPassword: password, token },
      headers: await headers(),
    });
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "Link ist ungültig oder abgelaufen." };
    }
    throw err;
  }

  redirect("/login?reset=1");
}
