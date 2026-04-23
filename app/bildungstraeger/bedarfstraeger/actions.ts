"use server";

import { redirect } from "next/navigation";

import { db, schema } from "@/db";
import { assertNotImpersonating, requireBildungstraeger } from "@/lib/dal";

export type BedarfstraegerFormState = { error?: string } | undefined;

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function createBedarfstraeger(
  _prev: BedarfstraegerFormState,
  formData: FormData,
): Promise<BedarfstraegerFormState> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const adresse = String(formData.get("adresse") ?? "").trim() || null;
  const kontaktPerson =
    String(formData.get("kontaktPerson") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;

  if (!name) return { error: "Name ist erforderlich." };
  if (type !== "JC" && type !== "AA") {
    return { error: "Typ muss Jobcenter (JC) oder Arbeitsagentur (AA) sein." };
  }
  if (email && !looksLikeEmail(email)) {
    return { error: `Ungültige E-Mail-Adresse: ${email}` };
  }

  try {
    await db.insert(schema.bedarfstraeger).values({
      name,
      type,
      adresse,
      kontaktPerson,
      email,
    });
  } catch (err) {
    // Volle Fehlerdetails (Constraint-/Schema-Infos) nur in Server-Logs,
    // nicht zurück an den Client — sonst leakt DB-Intern an UI.
    console.error("[createBedarfstraeger] insert failed", err);
    return { error: "Konnte nicht angelegt werden. Bitte erneut versuchen." };
  }

  redirect("/bildungstraeger/bedarfstraeger");
}
