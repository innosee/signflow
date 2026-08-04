import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { auth } from "@/lib/auth";

export type SessionData = Awaited<ReturnType<typeof auth.api.getSession>>;

/**
 * Cookie, in dem ab Phase 2 der vom User gewählte „aktive Tenant" liegt
 * (Login-Träger-Auswahl / In-App-Switcher). In Phase 1 setzt ihn noch
 * niemand — er wird nur gelesen und greift erst, sobald ein User mehr als
 * eine Mitgliedschaft hat. Single-Membership-User (alle aktuell) merken
 * dadurch nichts.
 */
export const ACTIVE_TENANT_COOKIE = "active_tenant_id";

type ActiveMembership = {
  tenantId: string;
  role: (typeof schema.tenantMemberships.role.enumValues)[number];
};

/**
 * Auflösung des aktiven Tenants + der aktiven Rolle für einen User.
 *
 * Das ist der Kern des Membership-Modells (Phase 1): EINE Identität (E-Mail,
 * Login) kann bei mehreren Bildungsträgern Mitglied sein. Welche Mitgliedschaft
 * gerade „aktiv" ist, entscheidet sich hier — und nur hier. `getTenantId` /
 * `getActiveRole` lesen das Ergebnis dann synchron aus der angereicherten
 * Session, sodass die 23 Aufrufer unverändert bleiben.
 *
 * Reihenfolge:
 *  1. Keine aktive Mitgliedschaft (z. B. User angelegt NACH dem Phase-0-Backfill,
 *     Membership-Zeilen werden erst ab Phase 3 beim Invite mitgeschrieben) →
 *     Fallback auf die „Heimat" `users.tenant_id/role`.
 *  2. Genau eine Mitgliedschaft → die.
 *  3. Mehrere → `active_tenant_id`-Cookie (außer bei Impersonation), sonst die
 *     Heimat-`tenant_id`, sonst die erste. (Cookie wird erst ab Phase 2 gesetzt.)
 */
async function resolveActiveMembership(
  user: { id: string; tenantId?: string | null; role?: string | null },
  opts: { impersonating: boolean },
): Promise<ActiveMembership | null> {
  const fallback: ActiveMembership | null = user.tenantId
    ? {
        tenantId: user.tenantId,
        role:
          user.role === "bildungstraeger" ? "bildungstraeger" : "coach",
      }
    : null;

  // Nur ANGENOMMENE Mitgliedschaften geben Zugriff/Kontext. Offene Einladungen
  // (accepted_at IS NULL) zählen hier nicht — sonst bekäme jemand den aktiven
  // Tenant einer Einladung, die er nie angenommen hat.
  const memberships = await db
    .select({
      tenantId: schema.tenantMemberships.tenantId,
      role: schema.tenantMemberships.role,
    })
    .from(schema.tenantMemberships)
    .where(
      and(
        eq(schema.tenantMemberships.userId, user.id),
        isNull(schema.tenantMemberships.deletedAt),
        isNotNull(schema.tenantMemberships.acceptedAt),
      ),
    );

  if (memberships.length === 0) return fallback;
  if (memberships.length === 1) return memberships[0];

  // Mehrere Mitgliedschaften — gibt es in Phase 1 noch nicht (Backfill spiegelt
  // 1:1 die User-Zeile). Logik steht trotzdem schon, damit Phase 2/3 nur noch
  // das Cookie setzen müssen, ohne diesen Chokepoint anzufassen.
  let cookieTenant: string | undefined;
  if (!opts.impersonating) {
    const jar = await cookies();
    cookieTenant = jar.get(ACTIVE_TENANT_COOKIE)?.value;
  }
  const chosen =
    (cookieTenant &&
      memberships.find((m) => m.tenantId === cookieTenant)) ||
    (user.tenantId &&
      memberships.find((m) => m.tenantId === user.tenantId)) ||
    memberships[0];
  return chosen;
}

export const getCurrentSession = cache(async (): Promise<SessionData> => {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  // „Eingeloggt" ist genau EIN Prädikat: eine Session MIT User. Ein truthy-
  // aber-userloses Objekt (kaputtes/halbgültiges Cookie) wird hart auf null
  // normalisiert — sonst würde `if (session)` in den Rein-Redirects (`/`,
  // `/login`, …) greifen, während die Guards (`requireSession`) es als
  // „nicht eingeloggt" behandeln → Redirect-Loop.
  if (!session?.user) return null;

  // Aktiven Tenant + aktive Rolle EINMAL pro Request auflösen und auf die
  // Session legen. Ab hier liest die ganze App den aktiven Tenant aus
  // `session.user.tenantId` (überschrieben) und die aktive Rolle aus
  // `session.user.activeRole` — beides synchron, kein async im Hot Path der
  // 23 `getTenantId`-Aufrufer.
  const active = await resolveActiveMembership(session.user, {
    impersonating: !!session.session?.impersonatedBy,
  });
  if (active) {
    const u = session.user as {
      tenantId?: string | null;
      activeRole?: string;
    };
    u.tenantId = active.tenantId;
    u.activeRole = active.role;
  }
  return session;
});

export async function requireSession() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");
  // Soft-gelöschte Nutzer sollen ihre Session sofort verlieren — nicht erst
  // bei Ablauf. Ohne diesen Check dürfte ein grad deaktivierter Coach noch
  // weiter in seiner alten Session arbeiten.
  if ((session.user as { deletedAt?: Date | null }).deletedAt) {
    redirect("/login");
  }
  return session;
}

/**
 * Ziel-Route für eine BEREITS eingeloggte Session — oder `null`, wenn die
 * Session NICHT sauber in die App gehört (kein User, deaktiviert, oder keine
 * bekannte Rolle). Jeder „logged-in → rein"-Redirect (`/`, `/login`,
 * `/register`, `/forgot-password`) MUSS das hier benutzen, statt blind
 * `/coach` anzunehmen.
 *
 * Warum: Die Guards (`requireSession`/`requireCoach`) werfen eine deaktivierte
 * oder rollen-fremde Session wieder RAUS (nach `/login` bzw. `/`). Wenn die
 * Rein-Redirects dieselbe Session unkritisch wieder REIN schicken, entsteht
 * ein Redirect-Ping-Pong, das Chrome als „Throttling navigation" abbricht
 * (weißer Screen). `null` = Seite normal rendern statt rein-redirecten bricht
 * die Schleife.
 */
export function loggedInRedirectTarget(session: SessionData): string | null {
  if (!session?.user) return null;
  if ((session.user as { deletedAt?: Date | null }).deletedAt) return null;
  const role = getActiveRole(session);
  if (role === "bildungstraeger") return "/bildungstraeger";
  if (role === "coach") return "/coach";
  return null;
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

/**
 * Aktive Rolle des Users IM aktiven Tenant. Quelle ist die in der Session
 * aufgelöste Mitgliedschaft (`activeRole`); Fallback auf die globale
 * `users.role`, falls keine Anreicherung stattfand (sollte nicht vorkommen,
 * solange `getCurrentSession` läuft). Ab Phase 1 IMMER hierüber prüfen, nicht
 * mehr direkt `session.user.role` — dieselbe Person kann bei Träger A Coach,
 * bei Träger B Bildungsträger sein.
 */
export function getActiveRole(session: SessionData): string | undefined {
  const u = session?.user as
    | { activeRole?: string; role?: string }
    | undefined;
  return u?.activeRole ?? u?.role;
}

export async function requireBildungstraeger() {
  const session = await requireSession();
  if (getActiveRole(session) !== "bildungstraeger") redirect("/");
  return session;
}

export async function requireCoach() {
  const session = await requireSession();
  if (getActiveRole(session) !== "coach") redirect("/");
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
 * Das Signatur-Modul ist seit 2026-06 für **jeden** Coach freigeschaltet — das
 * frühere per-Coach `signing_enabled`-Gate (Pilot-Rollout, BT-Toggle) wurde
 * entfernt. Diese Funktion bleibt als stabiler Chokepoint für die vorhandenen
 * Aufrufer (Layout/Nav/Redirects) erhalten und liefert konstant `true`.
 * Die DB-Spalte `users.signing_enabled` bleibt bestehen, wird aber nicht mehr
 * gelesen.
 */
export const getSigningEnabled = cache(
  async (userId: string): Promise<boolean> => {
    // Argument bleibt für die bestehenden Aufrufer in der Signatur erhalten,
    // wird aber nicht mehr ausgewertet — jeder Coach ist freigeschaltet.
    void userId;
    return true;
  },
);

/**
 * Server-Gate für Signatur-Routen (`/coach/courses*`, `/coach/signature`,
 * Server-Actions darin). Seit der Freischaltung für alle Coaches identisch mit
 * `requireCoach` — es gibt kein per-Coach-Flag mehr, das jemanden aussperrt.
 */
export async function requireSigningEnabled() {
  return requireCoach();
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
  if (!session || getActiveRole(session) !== "bildungstraeger") return false;
  if (isImpersonating(session)) return false;
  const tenantId = (session.user as { tenantId?: string }).tenantId;
  if (!tenantId) return false;
  const ownerId = await getTenantOwnerId(tenantId);
  return ownerId === session.user.id;
}
