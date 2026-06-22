"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";

import { logAudit } from "@/lib/audit";
import { provisionBildungstraeger } from "@/lib/bildungstraeger-onboarding";

export type OnboardFormState =
  | { error?: string; success?: string }
  | undefined;

/**
 * Operator-Gate: vergleicht das eingegebene Secret zeitkonstant mit
 * `OPERATOR_ONBOARD_SECRET`. Kein User-Account dahinter — der Operator ist
 * der Betreiber (innosee), der eine Warteliste-Anfrage manuell freigibt.
 * Es gibt (bewusst) keine tenant-übergreifende Super-Admin-Rolle, deshalb
 * ist ein Env-Secret der pragmatische, sichere Gate.
 */
function operatorSecretOk(provided: string): boolean {
  const expected = process.env.OPERATOR_ONBOARD_SECRET ?? "";
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual wirft bei ungleicher Länge — vorher abfangen, sonst
  // leakt die Länge über den Throw-Pfad.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Operator-getriebenes Onboarding eines neuen Bildungsträgers (= neuer
 * Mandant). Anders als `/setup` (einmaliger Bootstrap des Default-Tenants)
 * legt diese Action für JEDE Freigabe einen frischen Tenant an. Die eigentliche
 * Erzeugung liegt im geteilten Helper (siehe `provisionBildungstraeger`); hier
 * nur das Operator-Gate + Audit.
 */
export async function onboardBildungstraeger(
  _prev: OnboardFormState,
  formData: FormData,
): Promise<OnboardFormState> {
  const secret = String(formData.get("secret") ?? "");
  if (!operatorSecretOk(secret)) {
    return { error: "Operator-Secret fehlt oder ist falsch." };
  }

  const company = String(formData.get("company") ?? "");
  const result = await provisionBildungstraeger(
    {
      company,
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
    },
    await headers(),
  );
  if (!result.ok) return { error: result.error };

  await logAudit({
    actorType: "system",
    actorId: null,
    action: "bildungstraeger.onboard",
    resourceType: "user",
    resourceId: result.userId,
    metadata: {
      source: "operator",
      tenantId: result.tenantId,
      company: company.trim(),
    },
  });

  return {
    success: `Bildungsträger „${company.trim()}" angelegt. Einladung zum Passwort-Festlegen an ${result.email} versendet.`,
  };
}
