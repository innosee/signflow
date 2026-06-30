"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";

export type ChangelogEditorState =
  | { error?: string; success?: string }
  | undefined;

/**
 * Operator-Gate, identisch zu /operator/onboard: zeitkonstanter Vergleich mit
 * OPERATOR_ONBOARD_SECRET. Kein User-Account dahinter — der Operator (innosee)
 * verfasst globale Produkt-News.
 */
function operatorSecretOk(provided: string): boolean {
  const expected = process.env.OPERATOR_ONBOARD_SECRET ?? "";
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function createChangelogEntry(
  _prev: ChangelogEditorState,
  formData: FormData,
): Promise<ChangelogEditorState> {
  if (!operatorSecretOk(String(formData.get("secret") ?? ""))) {
    return { error: "Operator-Secret fehlt oder ist falsch." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title) return { error: "Titel ist erforderlich." };
  if (!body) return { error: "Text ist erforderlich." };

  try {
    await db.insert(schema.changelogEntries).values({ title, body });
  } catch (err) {
    console.error("[createChangelogEntry] insert failed", err);
    return { error: "Konnte nicht gespeichert werden. Bitte erneut versuchen." };
  }

  // /neu (alle eingeloggten User) + diese Editor-Liste frisch ziehen.
  revalidatePath("/neu");
  revalidatePath("/operator/changelog");
  return { success: `Eintrag „${title}" veröffentlicht.` };
}

export async function deleteChangelogEntry(
  _prev: ChangelogEditorState,
  formData: FormData,
): Promise<ChangelogEditorState> {
  if (!operatorSecretOk(String(formData.get("secret") ?? ""))) {
    return { error: "Operator-Secret fehlt oder ist falsch." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Kein Eintrag angegeben." };

  try {
    await db
      .update(schema.changelogEntries)
      .set({ deletedAt: new Date() })
      .where(eq(schema.changelogEntries.id, id));
  } catch (err) {
    console.error("[deleteChangelogEntry] failed", err);
    return { error: "Konnte nicht gelöscht werden. Bitte erneut versuchen." };
  }

  revalidatePath("/neu");
  revalidatePath("/operator/changelog");
  return { success: "Eintrag gelöscht." };
}
