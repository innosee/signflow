"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { assertNotImpersonating, requireSession } from "@/lib/dal";

export type SettingsFormState =
  | undefined
  | { ok?: undefined; error?: string }
  | { ok: true; message: string };

/**
 * Validierung Postanschrift: bis zu 12 Zeilen, jede ≤ 120 Zeichen, gesamt
 * ≤ 600 Zeichen. Reicht für lange Adress-Blöcke (Firma + Straße + PLZ +
 * Telefon + Fax + E-Mail + URL) und schützt gleichzeitig davor, dass
 * jemand z. B. 100 KB Markdown reinschiebt — der Block landet 1:1 ins PDF.
 */
const ADDRESS_MAX_LINES = 12;
const ADDRESS_MAX_LINE_LENGTH = 120;
const ADDRESS_MAX_TOTAL_LENGTH = 600;

function validateAddress(raw: string): string | { error: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length > ADDRESS_MAX_TOTAL_LENGTH) {
    return { error: `Adressblock darf max. ${ADDRESS_MAX_TOTAL_LENGTH} Zeichen haben.` };
  }
  const lines = trimmed.split(/\r?\n/);
  if (lines.length > ADDRESS_MAX_LINES) {
    return { error: `Adressblock darf max. ${ADDRESS_MAX_LINES} Zeilen haben.` };
  }
  if (lines.some((l) => l.length > ADDRESS_MAX_LINE_LENGTH)) {
    return { error: `Eine einzelne Zeile darf max. ${ADDRESS_MAX_LINE_LENGTH} Zeichen haben.` };
  }
  return trimmed;
}

export async function updateProfileAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await requireSession();
  assertNotImpersonating(session);

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { error: "Name muss mindestens 2 Zeichen haben." };
  }
  if (name.length > 120) {
    return { error: "Name darf max. 120 Zeichen haben." };
  }

  try {
    await auth.api.updateUser({
      body: { name },
      headers: await headers(),
    });
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "Profil konnte nicht aktualisiert werden." };
    }
    throw err;
  }

  // Header / Pages, die den User-Namen anzeigen, neu rendern lassen.
  revalidatePath("/coach", "layout");
  revalidatePath("/bildungstraeger", "layout");
  return { ok: true, message: "Name aktualisiert." };
}

export async function changePasswordAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await requireSession();
  assertNotImpersonating(session);

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8) {
    return { error: "Neues Passwort muss mindestens 8 Zeichen haben." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Neues Passwort und Bestätigung stimmen nicht überein." };
  }
  if (newPassword === currentPassword) {
    return { error: "Neues Passwort muss sich vom alten unterscheiden." };
  }

  try {
    await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "Aktuelles Passwort ist falsch." };
    }
    throw err;
  }

  return { ok: true, message: "Passwort aktualisiert. Andere Sitzungen wurden abgemeldet." };
}

export async function updateBrandingAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await requireSession();
  assertNotImpersonating(session);
  if (session.user.role !== "bildungstraeger") {
    return { error: "Nur der Bildungsträger darf das PDF-Branding ändern." };
  }

  const addressResult = validateAddress(String(formData.get("pdfAddress") ?? ""));
  if (typeof addressResult === "object" && "error" in addressResult) {
    return addressResult;
  }

  await db
    .update(schema.users)
    .set({
      pdfAddress: addressResult.length === 0 ? null : addressResult,
    })
    .where(eq(schema.users.id, session.user.id));

  // BER-PDFs ziehen das Branding bei jedem Render neu — Settings-Page
  // selbst zeigt die aktuellen Werte nach Refresh.
  revalidatePath("/bildungstraeger/settings");
  revalidatePath("/coach/checker/export");
  return { ok: true, message: "Adresse für PDF-Header aktualisiert." };
}

export async function clearBrandingLogoAction(): Promise<void> {
  const session = await requireSession();
  assertNotImpersonating(session);
  if (session.user.role !== "bildungstraeger") return;

  await db
    .update(schema.users)
    .set({ pdfLogoUrl: null })
    .where(eq(schema.users.id, session.user.id));

  revalidatePath("/bildungstraeger/settings");
  revalidatePath("/coach/checker/export");
}
