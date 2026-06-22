"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import {
  ACTIVE_TENANT_COOKIE,
  assertNotImpersonating,
  requireSession,
} from "@/lib/dal";
import { getActiveMemberships } from "@/lib/memberships";

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

/**
 * Nimmt eine offene Einladung an (Membership-Modell). Setzt `accepted_at` auf
 * der pending-Mitgliedschaft → ab jetzt zählt sie als aktiv und gibt Zugriff.
 * Wechselt direkt in den neuen Kontext. Hart gegen Fremd-Einladungen
 * abgesichert: nur die eigene offene Einladung des eingeloggten Users.
 */
export async function acceptInvitation(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertNotImpersonating(session);

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) redirect("/konto/einladungen");

  const [pending] = await db
    .select({
      id: schema.tenantMemberships.id,
      role: schema.tenantMemberships.role,
    })
    .from(schema.tenantMemberships)
    .where(
      and(
        eq(schema.tenantMemberships.userId, session.user.id),
        eq(schema.tenantMemberships.tenantId, tenantId),
        isNull(schema.tenantMemberships.deletedAt),
        isNull(schema.tenantMemberships.acceptedAt),
      ),
    )
    .limit(1);

  if (!pending) {
    // Keine offene Einladung (mehr) — nichts anzunehmen.
    redirect("/konto/einladungen");
  }

  await db
    .update(schema.tenantMemberships)
    .set({ acceptedAt: new Date() })
    .where(eq(schema.tenantMemberships.id, pending.id));

  await setActiveTenantCookie(tenantId);
  redirect(pending.role === "bildungstraeger" ? "/bildungstraeger" : "/coach");
}

/**
 * Lehnt eine offene Einladung ab — soft-delete der pending-Mitgliedschaft.
 * Nur die eigene offene Einladung.
 */
export async function declineInvitation(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertNotImpersonating(session);

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) redirect("/konto/einladungen");

  await db
    .update(schema.tenantMemberships)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(schema.tenantMemberships.userId, session.user.id),
        eq(schema.tenantMemberships.tenantId, tenantId),
        isNull(schema.tenantMemberships.deletedAt),
        isNull(schema.tenantMemberships.acceptedAt),
      ),
    );

  redirect("/konto/einladungen");
}
