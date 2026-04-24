"use server";

import { headers } from "next/headers";
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";

export type ForgotPasswordState =
  | { error?: string; sent?: boolean }
  | undefined;

/**
 * Startet den Passwort-Reset. Bewusst idempotent: wir geben immer `sent: true`
 * zurück — egal ob die E-Mail existiert oder nicht — damit Angreifer nicht
 * per Response-Diff feststellen können, welche E-Mail-Adressen im System
 * angemeldet sind (User-Enumeration).
 */
export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) return { error: "E-Mail ist erforderlich." };

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: await headers(),
    });
  } catch (err) {
    // Rate-Limit o.ä. nicht als Fehler zeigen — sonst leaken wir erneut, ob
    // die E-Mail im System ist. Nur echte Infra-Fehler durchwerfen.
    if (!(err instanceof APIError)) throw err;
  }

  return { sent: true };
}
