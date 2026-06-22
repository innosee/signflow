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

  // Edge-Case: Der Reset ist token-basiert (setzt das Passwort des
  // eingeladenen Coaches), berührt aber NICHT eine evtl. im selben Browser noch
  // aktive ANDERE Session. Ohne das hier bliebe man nach dem Setzen im vorher
  // eingeloggten Konto „hängen" statt sich als der neue Coach anzumelden.
  // Deshalb eine bestehende Session aktiv beenden → sauberer Login. Best-effort:
  // ist niemand eingeloggt (Normalfall: Coach auf eigenem Gerät), ist das ein
  // No-op.
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // kein aktiver Login / bereits abgemeldet — egal.
  }

  redirect("/login?reset=1");
}
