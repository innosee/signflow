import "server-only";

import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { ensureMembership } from "@/lib/memberships";

/** Executor: entweder die DB oder eine laufende Drizzle-Transaction. */
type DbOrTx =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ProvisionResult =
  | { ok: true; userId: string; tenantId: string; email: string }
  | { ok: false; error: string };

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // Diakritika entfernen
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "bildungstraeger";
}

/**
 * Legt einen Tenant mit eindeutigem Slug an. Bei Slug-Kollision (gleicher
 * Firmenname) wird ein kurzes Zufalls-Suffix angehängt — der Slug ist intern
 * (Logs/Subdomain), nicht öffentlich. Geteilt zwischen Self-Service-Onboarding
 * und „Bildungsträger gründen" (bestehende Identität legt eigenen Träger an).
 */
export async function createTenantWithUniqueSlug(
  exec: DbOrTx,
  company: string,
): Promise<{ id: string }> {
  let slug = slugify(company);
  const [slugTaken] = await exec
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(and(eq(schema.tenants.slug, slug), isNull(schema.tenants.deletedAt)))
    .limit(1);
  if (slugTaken) {
    slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;
  }
  const [tenant] = await exec
    .insert(schema.tenants)
    .values({ name: company, slug })
    .returning({ id: schema.tenants.id });
  if (!tenant) throw new Error("TENANT_INSERT_FAILED");
  return tenant;
}

/**
 * Legt einen neuen Bildungsträger (= neuer Mandant) samt Admin-Account an und
 * verschickt die Einladung zum Passwort-Festlegen. Geteilte Kern-Logik für
 * beide Onboarding-Wege:
 *   - Operator-Freigabe aus der Warteliste (`/operator/onboard`)
 *   - öffentlicher Self-Service (`/register`)
 *
 * Reuse statt Neuerfindung: kein eigenes Invite-Token-Schema. Wir legen Tenant
 * + Admin-User + Credential-Account direkt an (wie der `/setup`-Bootstrap, weil
 * hier keine Admin-Session existiert, über die `auth.api.createUser` laufen
 * könnte) und stoßen den Better-Auth-Reset-Flow an. Der Account ist erst
 * nutzbar, wenn die Person den Mail-Link klickt und ein Passwort setzt —
 * `onPasswordReset` markiert sie dann als `emailVerified` (siehe
 * src/lib/auth.ts). Der Klick auf den Link IST die E-Mail-Verifikation.
 *
 * Caller-Verantwortung: Zugangskontrolle (Operator-Secret bzw. Bot-Schutz) und
 * Audit-Logging. Diese Funktion validiert nur Inhalt + Eindeutigkeit.
 */
export async function provisionBildungstraeger(
  input: { company: string; name: string; email: string },
  reqHeaders: Headers,
): Promise<ProvisionResult> {
  const company = input.company.trim();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!company || !name || !email) {
    return { ok: false, error: "Firma, Name und E-Mail sind Pflichtfelder." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Ungültiges E-Mail-Format." };
  }
  if (company.length > 200 || name.length > 120) {
    return { ok: false, error: "Bitte Eingaben kürzen." };
  }

  // Globaler Aktiv-Check: `users_email_active_uq` ist tenant-übergreifend
  // (Partial-Unique auf email WHERE deleted_at IS NULL). Eine Adresse, die
  // bereits irgendwo aktiv ist, kann nicht erneut angelegt werden. Hinweis auf
  // „Passwort vergessen" deckt den Fall ab, dass jemand sich registriert hat,
  // aber den Einladungs-Link verloren hat (oder dass eine fremde Person die
  // Adresse „squatten" wollte — der echte Inhaber holt sich den Account so
  // jederzeit zurück).
  const [existingActive] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
    .limit(1);
  if (existingActive) {
    return {
      ok: false,
      error:
        "Diese E-Mail-Adresse gehört bereits zu einem Account. Bitte melde dich an — eigenen Bildungsträger kannst du anschließend direkt aus deinem Konto gründen.",
    };
  }

  const placeholderPassword = await hashPassword(
    crypto.randomBytes(32).toString("hex"),
  );

  // Tenant + Admin-User + Credential-Account atomar — verhindert
  // Orphan-Tenants (Tenant angelegt, User-Insert scheitert) und Orphan-User
  // (User ohne Credential-Account → kein Reset-Login möglich).
  let createdUserId: string | null = null;
  let createdTenantId: string | null = null;
  try {
    const result = await db.transaction(async (tx) => {
      const tenant = await createTenantWithUniqueSlug(tx, company);

      const [user] = await tx
        .insert(schema.users)
        .values({
          email,
          name,
          role: "bildungstraeger",
          // Einladung ausstehend bis die Person ihr Passwort gesetzt hat —
          // onPasswordReset flippt das auf true.
          emailVerified: false,
          tenantId: tenant.id,
        })
        .returning({ id: schema.users.id });
      if (!user) throw new Error("USER_INSERT_FAILED");

      await tx.insert(schema.authAccount).values({
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: placeholderPassword,
      });

      // Mitgliedschaft des neuen BT in seinem eigenen Tenant — hält die
      // tenant_memberships-Tabelle als Source-of-Truth konsistent (sonst
      // existierte der neue BT nur über users.tenant_id/role als Fallback).
      await ensureMembership(tx, {
        userId: user.id,
        tenantId: tenant.id,
        role: "bildungstraeger",
      });

      return { userId: user.id, tenantId: tenant.id };
    });
    createdUserId = result.userId;
    createdTenantId = result.tenantId;
  } catch {
    return { ok: false, error: "Bildungsträger konnte nicht angelegt werden." };
  }

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: reqHeaders,
    });
  } catch {
    // Mail-Versand fehlgeschlagen → frisch angelegten User + Tenant
    // soft-deleten, damit (a) keine aktive Zeile mit Zufalls-Passwort
    // existiert und (b) E-Mail und Slug für einen erneuten Versuch wieder
    // frei sind (Partial-Unique greift nur auf nicht-gelöschte Zeilen).
    if (createdUserId) {
      await db
        .update(schema.users)
        .set({ deletedAt: new Date(), banned: true })
        .where(eq(schema.users.id, createdUserId))
        .catch(() => {});
    }
    if (createdTenantId) {
      await db
        .update(schema.tenants)
        .set({ deletedAt: new Date() })
        .where(eq(schema.tenants.id, createdTenantId))
        .catch(() => {});
    }
    return {
      ok: false,
      error:
        "Account angelegt, aber die Bestätigungs-E-Mail ist fehlgeschlagen. Vorgang wurde rückgängig gemacht — bitte erneut versuchen.",
    };
  }

  return { ok: true, userId: createdUserId, tenantId: createdTenantId, email };
}
