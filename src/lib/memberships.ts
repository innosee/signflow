import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";

/** Executor: entweder die DB oder eine laufende Drizzle-Transaction. */
type DbOrTx =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type MembershipRole =
  (typeof schema.tenantMemberships.role.enumValues)[number];

export type MembershipView = {
  tenantId: string;
  tenantName: string;
  role: MembershipRole;
};

/**
 * Alle aktiven Mitgliedschaften eines Users (mit Tenant-Name), für den
 * Tenant-Switcher und das Login-Routing. Nur nicht-gelöschte Mitgliedschaften
 * in nicht-gelöschten Tenants, alphabetisch nach Tenant-Name.
 */
export async function getActiveMemberships(
  userId: string,
): Promise<MembershipView[]> {
  return db
    .select({
      tenantId: schema.tenantMemberships.tenantId,
      tenantName: schema.tenants.name,
      role: schema.tenantMemberships.role,
    })
    .from(schema.tenantMemberships)
    .innerJoin(
      schema.tenants,
      eq(schema.tenants.id, schema.tenantMemberships.tenantId),
    )
    .where(
      and(
        eq(schema.tenantMemberships.userId, userId),
        isNull(schema.tenantMemberships.deletedAt),
        isNull(schema.tenants.deletedAt),
      ),
    )
    .orderBy(asc(schema.tenants.name));
}

export type TenantSwitcherData = {
  memberships: MembershipView[];
  activeTenantId: string;
  activeTenantName: string;
};

/**
 * Daten für den Tenant-Switcher im Header: alle Mitgliedschaften des Users plus
 * der aktuell aktive Tenant (Name). Fällt für Zero-Membership-User (Konto ohne
 * materialisierte Mitgliedschaft) auf eine direkte Tenant-Abfrage zurück.
 */
export async function getTenantSwitcherData(
  userId: string,
  activeTenantId: string,
): Promise<TenantSwitcherData> {
  const memberships = await getActiveMemberships(userId);
  let activeTenantName = memberships.find(
    (m) => m.tenantId === activeTenantId,
  )?.tenantName;
  if (!activeTenantName) {
    const [t] = await db
      .select({ name: schema.tenants.name })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, activeTenantId))
      .limit(1);
    activeTenantName = t?.name ?? "Mein Konto";
  }
  return { memberships, activeTenantId, activeTenantName };
}

/**
 * Legt eine Mitgliedschaft (User × Tenant) an, falls noch keine aktive
 * existiert — idempotent. Gibt die ID der bestehenden bzw. neuen Zeile zurück.
 *
 * Wichtig für die Rückwärtskompatibilität des Membership-Modells: solange ein
 * User KEINE Mitgliedschaft hat, fällt `resolveActiveMembership` auf
 * `users.tenant_id/role` zurück. Sobald aber EINE Mitgliedschaft existiert,
 * ist die Tabelle maßgeblich — wer also eine zweite Mitgliedschaft hinzufügt
 * (z. B. „Bildungsträger gründen"), muss vorher die „Heimat"-Mitgliedschaft
 * materialisieren, sonst kollabiert der User auf die neue (einzige) Rolle.
 */
export async function ensureMembership(
  exec: DbOrTx,
  membership: {
    userId: string;
    tenantId: string;
    role: MembershipRole;
    signingEnabled?: boolean;
  },
): Promise<string> {
  const [existing] = await exec
    .select({ id: schema.tenantMemberships.id })
    .from(schema.tenantMemberships)
    .where(
      and(
        eq(schema.tenantMemberships.userId, membership.userId),
        eq(schema.tenantMemberships.tenantId, membership.tenantId),
        isNull(schema.tenantMemberships.deletedAt),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [row] = await exec
    .insert(schema.tenantMemberships)
    .values({
      userId: membership.userId,
      tenantId: membership.tenantId,
      role: membership.role,
      signingEnabled: membership.signingEnabled ?? false,
    })
    .returning({ id: schema.tenantMemberships.id });
  return row.id;
}
