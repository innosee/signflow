import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { auth } from "@/lib/auth";

export type SessionData = Awaited<ReturnType<typeof auth.api.getSession>>;

export const getCurrentSession = cache(async (): Promise<SessionData> => {
  const h = await headers();
  return auth.api.getSession({ headers: h });
});

export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  // Soft-gelöschte Nutzer sollen ihre Session sofort verlieren — nicht erst
  // bei Ablauf. Ohne diesen Check dürfte ein grad deaktivierter Coach noch
  // weiter in seiner alten Session arbeiten.
  if ((session.user as { deletedAt?: Date | null }).deletedAt) {
    redirect("/login");
  }
  return session;
}

/**
 * Liefert die `tenantId` des aktuellen Users. Pflicht für jede Coach-/BT-
 * Aktion, die Daten anlegt oder filtert — Multi-Tenant-Isolation hängt an
 * diesem Wert.
 *
 * Wirft, wenn die Session keinen tenantId hat (Schema-Drift oder Bug —
 * darf in Production nie passieren, weil tenant_id NOT NULL ist).
 */
export function getTenantId(session: SessionData): string {
  const tenantId = (session?.user as { tenantId?: string } | undefined)
    ?.tenantId;
  if (!tenantId) {
    throw new Error(
      "Session has no tenantId — DB schema or auth setup is inconsistent.",
    );
  }
  return tenantId;
}

export async function requireBildungstraeger() {
  const session = await requireSession();
  if (session.user.role !== "bildungstraeger") redirect("/");
  return session;
}

export async function requireCoach() {
  const session = await requireSession();
  if (session.user.role !== "coach") redirect("/");
  return session;
}

export function isImpersonating(session: SessionData): boolean {
  return !!session?.session?.impersonatedBy;
}

/**
 * Schreibende Aktionen — insbesondere Signaturen — sind während Impersonation
 * hart blockiert, sonst wäre die rechtliche Beweiskraft der digitalen
 * Unterschrift kaputt (Coach könnte behaupten, Bildungsträger habe in seinem
 * Namen signiert). Siehe CLAUDE.md → Auth & Berechtigungen.
 */
export function assertNotImpersonating(session: SessionData): void {
  if (isImpersonating(session)) {
    throw new Error(
      "Schreibende Aktionen sind während Impersonation nicht erlaubt.",
    );
  }
}

/**
 * Liest den `signing_enabled`-Flag eines Coaches direkt aus der DB. Cached
 * innerhalb eines Renders (React.cache), damit wiederholte Checks im selben
 * Request keine N+1 erzeugen. Wird nicht aus der Session gezogen, damit ein
 * frisches Togglen durch den Bildungsträger beim nächsten Request greift —
 * ohne dass der Coach erst aus-/einloggen muss.
 */
export const getSigningEnabled = cache(
  async (userId: string): Promise<boolean> => {
    const [row] = await db
      .select({ signingEnabled: schema.users.signingEnabled })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return !!row?.signingEnabled;
  },
);

/**
 * Server-Gate für Signatur-Routen (`/coach/courses*`, `/coach/signature`,
 * Server-Actions darin). Coach ohne Flag wird hart auf `/coach/checker`
 * umgeleitet — Checker ist für alle freigeschaltet. Der Bildungsträger
 * öffnet das Flag pro Pilot-Coach per Admin-UI.
 */
export async function requireSigningEnabled() {
  const session = await requireCoach();
  const enabled = await getSigningEnabled(session.user.id);
  if (!enabled) redirect("/coach/checker");
  return session;
}

/**
 * Owner-Konvention für BT-User: der **älteste aktive BT-User** eines
 * Tenants ist Owner. Implizit über `createdAt ASC LIMIT 1`, kein
 * explizites Schema-Feld — wenn der Owner gelöscht wird, rückt
 * automatisch der nächst-älteste nach. Reicht solange Owner-Status
 * nur ein Berechtigungs-Schalter ist und kein Settlement / Audit-
 * Marker (dann später explizites `tenants.owner_user_id` einführen).
 *
 * Cached pro Render, damit die Page nicht 2× dieselbe Query rauslässt
 * (Owner-Check + List-Item-Owner-Markierung).
 */
export const getTenantOwnerId = cache(
  async (tenantId: string): Promise<string | null> => {
    const [row] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.tenantId, tenantId),
          eq(schema.users.role, "bildungstraeger"),
          isNull(schema.users.deletedAt),
        ),
      )
      .orderBy(asc(schema.users.createdAt))
      .limit(1);
    return row?.id ?? null;
  },
);

export async function isTenantOwner(session: SessionData): Promise<boolean> {
  if (!session || session.user.role !== "bildungstraeger") return false;
  if (isImpersonating(session)) return false;
  const tenantId = (session.user as { tenantId?: string }).tenantId;
  if (!tenantId) return false;
  const ownerId = await getTenantOwnerId(tenantId);
  return ownerId === session.user.id;
}
