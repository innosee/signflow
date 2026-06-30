"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import {
  assertNotImpersonating,
  getTenantId,
  requireBildungstraeger,
} from "@/lib/dal";

export type BedarfstraegerFormState = { error?: string } | undefined;

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

type ParsedFields =
  | {
      ok: true;
      values: {
        name: string;
        type: "JC" | "AA";
        adresse: string | null;
        kontaktPerson: string | null;
        email: string | null;
      };
    }
  | { ok: false; error: string };

/** Gemeinsame Validierung für Anlegen + Bearbeiten. */
function parseFields(formData: FormData): ParsedFields {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const adresse = String(formData.get("adresse") ?? "").trim() || null;
  const kontaktPerson =
    String(formData.get("kontaktPerson") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;

  if (!name) return { ok: false, error: "Name ist erforderlich." };
  if (type !== "JC" && type !== "AA") {
    return {
      ok: false,
      error: "Typ muss Jobcenter (JC) oder Arbeitsagentur (AA) sein.",
    };
  }
  if (email && !looksLikeEmail(email)) {
    return { ok: false, error: `Ungültige E-Mail-Adresse: ${email}` };
  }

  return { ok: true, values: { name, type, adresse, kontaktPerson, email } };
}

export async function createBedarfstraeger(
  _prev: BedarfstraegerFormState,
  formData: FormData,
): Promise<BedarfstraegerFormState> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);

  const parsed = parseFields(formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await db.insert(schema.bedarfstraeger).values({
      tenantId,
      ...parsed.values,
    });
  } catch (err) {
    // Volle Fehlerdetails (Constraint-/Schema-Infos) nur in Server-Logs,
    // nicht zurück an den Client — sonst leakt DB-Intern an UI.
    console.error("[createBedarfstraeger] insert failed", err);
    return { error: "Konnte nicht angelegt werden. Bitte erneut versuchen." };
  }

  redirect("/bildungstraeger/bedarfstraeger");
}

export async function updateBedarfstraeger(
  _prev: BedarfstraegerFormState,
  formData: FormData,
): Promise<BedarfstraegerFormState> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Kein Bedarfsträger angegeben." };

  const parsed = parseFields(formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    // Tenant-Scope ist Pflicht: ein Bildungsträger darf nur die eigenen
    // Behörden bearbeiten (Data-Isolation, siehe CLAUDE.md → Auth).
    const updated = await db
      .update(schema.bedarfstraeger)
      .set(parsed.values)
      .where(
        and(
          eq(schema.bedarfstraeger.id, id),
          eq(schema.bedarfstraeger.tenantId, tenantId),
          isNull(schema.bedarfstraeger.deletedAt),
        ),
      )
      .returning({ id: schema.bedarfstraeger.id });

    if (updated.length === 0) {
      return { error: "Bedarfsträger nicht gefunden." };
    }
  } catch (err) {
    console.error("[updateBedarfstraeger] update failed", err);
    return {
      error: "Konnte nicht gespeichert werden. Bitte erneut versuchen.",
    };
  }

  redirect("/bildungstraeger/bedarfstraeger");
}
