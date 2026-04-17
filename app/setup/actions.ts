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

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, "agency"))
    .limit(1);
  if (existing.length > 0) {
    return { error: "Es existiert bereits ein Agency-Account." };
  }

  const [user] = await db
    .insert(schema.users)
    .values({ email, name, role: "agency", emailVerified: true })
    .returning();

  if (!user) return { error: "Benutzer konnte nicht erstellt werden." };

  const passwordHash = await hashPassword(password);

  await db.insert(schema.authAccount).values({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: passwordHash,
  });

  await auth.api.signInEmail({
    body: { email, password },
    headers: await headers(),
  });

  redirect("/agency");
}
