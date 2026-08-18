"use server";

import { headers } from "next/headers";

import { logAudit } from "@/lib/audit";
import { provisionBildungstraeger } from "@/lib/bildungstraeger-onboarding";
import { runBotChecks } from "@/lib/bot-protection";

export type RegisterState =
  | { ok?: true; error?: never }
  | { ok?: never; error: string }
  | undefined;

/**
 * Öffentliche Selbst-Registrierung eines Bildungsträgers. Im Gegensatz zum
 * Operator-Flow (`/operator/onboard`) ohne manuelle Freigabe — abgesichert
 * über denselben Bot-Schutz wie die Warteliste (Honeypot + Min-Time +
 * Turnstile + IP-Rate-Limit). Die eigentliche Account-Anlage liegt im
 * geteilten Helper; der Account ist erst nach Klick auf den E-Mail-Link
 * (Passwort setzen) nutzbar — das ist die E-Mail-Verifikation.
 */
export async function registerBildungstraeger(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const botCheck = await runBotChecks(formData);
  if (!botCheck.ok) {
    console.warn("register bot-check rejected:", botCheck.reason);
    return { error: botCheck.userMessage };
  }

  // Unternehmer-Bestätigung serverseitig erzwingen (Client-`required` ist nur
  // UX). Schließt den Verbraucher-Widerruf aus — Signflow ist ein reines
  // B2B-Angebot.
  if (formData.get("unternehmer") !== "on") {
    return {
      error:
        "Bitte bestätige, dass du als Unternehmer (nicht als Verbraucher) handelst.",
    };
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
      source: "self_service",
      tenantId: result.tenantId,
      company: company.trim(),
      unternehmer_confirmed: true,
    },
  });

  return { ok: true };
}
