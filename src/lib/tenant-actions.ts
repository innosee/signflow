"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { createTenantWithUniqueSlug } from "@/lib/bildungstraeger-onboarding";
import {
  ACTIVE_TENANT_COOKIE,
  assertNotImpersonating,
  getActiveRole,
  requireSession,
} from "@/lib/dal";
import { ensureMembership, getActiveMemberships } from "@/lib/memberships";

const ONE_YEAR = 60 * 60 * 24 * 365;

async function setActiveTenantCookie(tenantId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

export async function clearActiveTenantCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACTIVE_TENANT_COOKIE);
}

/**
 * Wechselt den aktiven Tenant (Membership-Modell Phase 2). Setzt das
 * `active_tenant_id`-Cookie, das `resolveActiveMembership` in der Session-
 * Auflösung liest. Hart gegen Fremd-Tenants abgesichert: es lässt sich nur auf
 * einen Tenant wechseln, in dem der User selbst eine aktive Mitgliedschaft hat.
 * Während Impersonation blockiert — der Kontext-Wechsel ist dann sinnlos und
 * beweisrechtlich heikel.
 */
export async function switchTenant(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertNotImpersonating(session);

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) redirect("/");

  const memberships = await getActiveMemberships(session.user.id);
  const target = memberships.find((m) => m.tenantId === tenantId);
  if (!target) {
    // Kein Recht auf diesen Tenant — still ignorieren, zurück zur Wurzel.
    redirect("/");
  }

  await setActiveTenantCookie(target.tenantId);
  redirect(target.role === "bildungstraeger" ? "/bildungstraeger" : "/coach");
}

export type FoundBtState = { error?: string } | undefined;

/**
 * „Bildungsträger gründen" für eine BESTEHENDE Identität (eingeloggt). Legt
 * einen neuen Tenant an und macht den aktuellen User dort zum Bildungsträger —
 * OHNE eine zweite User-Zeile (eine Identität, mehrere Mitgliedschaften). Das
 * ist der auth-gated Gegenpart zum öffentlichen `/register`: dort wird eine
 * bereits existierende E-Mail bewusst abgewiesen (Account-Takeover-Schutz),
 * hier beweist der eingeloggte User die Kontrolle über sein Konto selbst.
 *
 * Materialisiert vorab die „Heimat"-Mitgliedschaft des Users, falls noch keine
 * Mitgliedschaft existiert — sonst würde der User nach dem Insert auf die neue
 * (dann einzige) BT-Mitgliedschaft kollabieren und seinen bisherigen Coach-
 * Kontext verlieren (siehe ensureMembership-Doku).
 */
export async function foundBildungstraeger(
  _prev: FoundBtState,
  formData: FormData,
): Promise<FoundBtState> {
  const session = await requireSession();
  assertNotImpersonating(session);

  const company = String(formData.get("company") ?? "").trim();
  if (!company) return { error: "Bitte einen Namen für den Bildungsträger angeben." };
  if (company.length > 200) return { error: "Bitte den Namen kürzen." };

  // Echte Heimat aus der users-Tabelle (NICHT aus der Session — die trägt nach
  // Phase 1 bereits den aufgelösten aktiven Tenant).
  const [home] = await db
    .select({ tenantId: schema.users.tenantId, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  if (!home) return { error: "Konto nicht gefunden." };

  let newTenantId: string;
  try {
    newTenantId = await db.transaction(async (tx) => {
      // Bestehende Mitgliedschaften materialisieren, damit nicht auf die neue
      // BT-Mitgliedschaft kollabiert wird.
      const existing = await getActiveMemberships(session.user.id);
      if (existing.length === 0) {
        await ensureMembership(tx, {
          userId: session.user.id,
          tenantId: home.tenantId,
          role: home.role === "bildungstraeger" ? "bildungstraeger" : "coach",
        });
      }

      const tenant = await createTenantWithUniqueSlug(tx, company);
      await ensureMembership(tx, {
        userId: session.user.id,
        tenantId: tenant.id,
        role: "bildungstraeger",
      });
      return tenant.id;
    });
  } catch {
    return { error: "Bildungsträger konnte nicht angelegt werden." };
  }

  await logAudit({
    actorType:
      getActiveRole(session) === "bildungstraeger" ? "bildungstraeger" : "coach",
    actorId: session.user.id,
    action: "bildungstraeger.onboard",
    resourceType: "user",
    resourceId: session.user.id,
    metadata: { source: "self_found", tenantId: newTenantId, company },
  });

  // Direkt in den neuen BT-Kontext wechseln.
  await setActiveTenantCookie(newTenantId);
  redirect("/bildungstraeger");
}
