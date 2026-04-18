"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { db, schema } from "@/db";
import { auth } from "@/lib/auth";

export type SetupFormState = { error?: string } | undefined;

export async function bootstrapAgency(
  _prev: SetupFormState,
  formData: FormData,
): Promise<SetupFormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !name || !password) {
    return { error: "Bitte alle Felder ausfüllen." };
  }
  if (password.length < 8) {
    return { error: "Passwort muss mindestens 8 Zeichen haben." };
  }

  const passwordHash = await hashPassword(password);

  // Existence-Check UND beide Inserts in einer Transaktion —
  // verhindert TOCTOU-Race (zwei parallele Requests erstellen je eine Agency)
  // und orphan-User (users eingefügt, authAccount-Insert scheitert).
  let userId: string | null = null;
  try {
    userId = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.role, "agency"))
        .limit(1);
      if (existing.length > 0) {
        throw new Error("AGENCY_EXISTS");
      }

      const [user] = await tx
        .insert(schema.users)
        .values({ email, name, role: "agency", emailVerified: true })
        .returning();
      if (!user) throw new Error("USER_INSERT_FAILED");

      await tx.insert(schema.authAccount).values({
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: passwordHash,
      });

      return user.id;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "AGENCY_EXISTS") {
      return { error: "Es existiert bereits ein Agency-Account." };
    }
    return { error: "Benutzer konnte nicht erstellt werden." };
  }

  if (!userId) return { error: "Benutzer konnte nicht erstellt werden." };

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch {
    // User wurde angelegt, aber Auto-Login ist fehlgeschlagen. Nutzer
    // kann sich manuell anmelden — freundlich weiterleiten statt 500.
    redirect("/login");
  }

  redirect("/agency");
}
