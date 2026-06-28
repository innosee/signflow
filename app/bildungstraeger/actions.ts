"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db, schema } from "@/db";
import { logAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { AFA_SUBMISSION_ENABLED } from "@/lib/feature-flags";
import {
  assertNotImpersonating,
  getCurrentSession,
  getTenantId,
  getTenantOwnerId,
  isImpersonating,
  isTenantOwner,
  requireBildungstraeger,
} from "@/lib/dal";
import {
  ensureMembership,
  getActiveMemberships,
  getPendingInvitations,
} from "@/lib/memberships";
import { sendCoachInvitationToAccept } from "@/lib/email";

export type InviteFormState =
  | { error?: string; success?: string }
  | undefined;

export async function inviteCoach(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const session = await requireBildungstraeger();
  assertNotImpersonating(session);
  const tenantId = getTenantId(session);

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();

  if (!email || !name) {
    return { error: "Name und E-Mail sind erforderlich." };
  }

  // Cross-Tenant-Invite (Membership-Modell): existiert die E-Mail bereits als
  // AKTIVES Konto (irgendwo), legen wir KEINEN zweiten User an — Better Auth
  // meldet global per E-Mail an, das ginge gar nicht. Stattdessen bekommt die
  // bestehende Identität eine zusätzliche Coach-Mitgliedschaft in DIESEM Tenant.
  // Eine Person, mehrere Bildungsträger.
  const [activeUser] = await db
    .select({
      id: schema.users.id,
      tenantId: schema.users.tenantId,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
    .limit(1);

  if (activeUser) {
    const accepted = await getActiveMemberships(activeUser.id);
    const pending = await getPendingInvitations(activeUser.id);

    // Schon ANGENOMMENES Mitglied dieses Tenants? (Heimat-Tenant ODER
    // angenommene Membership) → echtes Duplikat.
    const alreadyMember =
      activeUser.tenantId === tenantId ||
      accepted.some((m) => m.tenantId === tenantId);
    if (alreadyMember) {
      return { error: "Diese Person ist bereits Mitglied dieses Bildungsträgers." };
    }

    const reInvite = pending.some((m) => m.tenantId === tenantId);

    try {
      await db.transaction(async (tx) => {
        // Heimat-Mitgliedschaft materialisieren, falls noch keine ANGENOMMENE
        // existiert — sonst verlöre die Identität nach dem Annehmen ihren
        // bisherigen Kontext (Kollaps auf die neue Coach-Mitgliedschaft).
        if (accepted.length === 0) {
          await ensureMembership(tx, {
            userId: activeUser.id,
            tenantId: activeUser.tenantId,
            role:
              activeUser.role === "bildungstraeger"
                ? "bildungstraeger"
                : "coach",
            // Heimat gilt als angenommen (bestehender Kontext).
          });
        }
        // Coach-Einladung als OFFEN anlegen (accepted_at = null). ensureMembership
        // ist idempotent — ein bestehender pending-Eintrag wird nicht dupliziert,
        // wir verschicken nur die Mail erneut.
        await ensureMembership(tx, {
          userId: activeUser.id,
          tenantId,
          role: "coach",
          acceptedAt: null,
        });
      });
    } catch {
      return { error: "Einladung konnte nicht erstellt werden." };
    }

    // Bestehendes Konto → kein Passwort-Reset, sondern eine Einladung zum
    // Annehmen. Mail-Fehler soll die Einladung nicht zurückrollen.
    try {
      const [tenant] = await db
        .select({ name: schema.tenants.name })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      const base =
        process.env.BETTER_AUTH_URL ??
        process.env.NEXT_PUBLIC_APP_URL ??
        "http://localhost:3000";
      await sendCoachInvitationToAccept({
        to: email,
        name,
        tenantName: tenant?.name ?? "einem Bildungsträger",
        url: `${base}/konto/einladungen`,
      });
    } catch {
      // non-fatal — Einladung besteht; Mail kann manuell folgen.
    }

    return {
      success: reInvite
        ? `Einladung an ${email} erneut versendet.`
        : `${email} wurde als Coach eingeladen — die Person muss die Einladung nach dem Anmelden annehmen.`,
    };
  }

  // Random placeholder password. The coach sets their real one via the reset
  // email that goes out immediately after user creation.
  const placeholderPassword = crypto.randomBytes(32).toString("hex");

  const h = await headers();

  // Wenn dieselbe E-Mail schon mal als Coach existierte und soft-gelöscht
  // wurde, bleibt die `users`-Zeile in der DB stehen (mit `deletedAt`).
  // Better Auth's createUser checkt nur die E-Mail ohne unseren
  // deletedAt-Filter und schmeißt deshalb „User already exists" — obwohl
  // der Partial-Unique-Index ein Re-Insert technisch erlauben würde.
  // Statt zu re-inserten beleben wir die alte Zeile wieder: deletedAt +
  // banned werden zurückgesetzt, der Name aktualisiert. Audit-History
  // (gleiche user_id) bleibt erhalten. Better Auth's reset-flow setzt
  // dann das Passwort.
  // Existence-Check tenant-scoped — sonst könnte ein Bildungsträger eine
  // E-Mail-Adresse einladen, die im Tenant eines anderen BT bereits aktiv
  // ist, was zu einer überraschenden Resurrect-Kollision führen würde.
  const [existing] = await db
    .select({
      id: schema.users.id,
      deletedAt: schema.users.deletedAt,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.email, email),
        eq(schema.users.tenantId, tenantId),
      ),
    )
    .limit(1);

  let createdUserId: string | null = null;
  if (existing && existing.deletedAt) {
    // Resurrect-Pfad — beim Wiederbeleben wird der User dem Tenant des
    // einladenden Bildungsträgers zugeschlagen, auch wenn die alte Zeile
    // ggf. einem anderen Tenant gehörte (in der Praxis Single-Tenant zur
    // Migrations-Zeit, aber sauber für Multi-Tenant ab jetzt).
    await db
      .update(schema.users)
      .set({
        tenantId,
        deletedAt: null,
        banned: false,
        banReason: null,
        banExpires: null,
        emailVerified: false, // Einladung ausstehend bis Coach das Passwort setzt
        name,
        role: "coach",
        signingEnabled: false,
      })
      .where(eq(schema.users.id, existing.id));
    createdUserId = existing.id;
  } else if (existing && !existing.deletedAt) {
    // Aktive Zeile — wirklich Duplikat
    return { error: "Einladung fehlgeschlagen: Diese E-Mail-Adresse ist bereits registriert." };
  } else {
    try {
      const result = await auth.api.createUser({
        body: {
          email,
          name,
          password: placeholderPassword,
          role: "coach",
          // Tenant des einladenden Bildungsträgers — Better Auth reicht das
          // Feld via additionalFields.tenantId (input: true) durch.
          data: { tenantId },
        },
        headers: h,
      });
      createdUserId = result.user?.id ?? null;
    } catch (err) {
      if (err instanceof APIError) {
        return { error: `Einladung fehlgeschlagen: ${err.message}` };
      }
      throw err;
    }
  }

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: h,
    });
  } catch (err) {
    // Mail-Versand fehlgeschlagen → den gerade angelegten/wiederbelebten
    // User soft-deleten, damit (a) keine aktive Zeile mit zufälligem
    // Passwort existiert und (b) die E-Mail-Adresse für eine erneute
    // Einladung wieder frei ist (Partial-Unique-Index auf email WHERE
    // deletedAt IS NULL).
    if (createdUserId) {
      await db
        .update(schema.users)
        .set({ deletedAt: new Date(), banned: true })
        .where(eq(schema.users.id, createdUserId))
        .catch(() => {
          // Cleanup best-effort — in der Fehlermeldung steht, dass die
          // Bildungsträger sich ggf. manuell kümmern muss.
        });
    }
    if (err instanceof APIError) {
      return {
        error: `Einladungs-E-Mail fehlgeschlagen (${err.message}). Der User wurde rückgängig gemacht, bitte erneut einladen.`,
      };
    }
    throw err;
  }

  // Coach-Mitgliedschaft im einladenden Tenant materialisieren (Membership-
  // Modell). Best-effort: schlägt das fehl, bleibt der Coach über
  // users.tenant_id/role als Fallback voll funktionsfähig — kein Grund, die
  // bereits versendete Einladung scheitern zu lassen.
  if (createdUserId) {
    try {
      await ensureMembership(db, {
        userId: createdUserId,
        tenantId,
        role: "coach",
      });
    } catch {
      // non-fatal — Fallback auf users.tenant_id/role greift.
    }
  }

  return { success: `Einladung an ${email} versendet.` };
}

function backToBildungstraegerWithError(code: string): never {
  redirect(`/bildungstraeger?imp_error=${encodeURIComponent(code)}`);
}

export async function impersonateCoach(formData: FormData): Promise<void> {
  const session = await requireBildungstraeger();
  const tenantId = getTenantId(session);
  // Owner-Gate: nur der älteste aktive BT-User des Tenants darf Coaches
  // impersonaten. Eingeladene Kolleg:innen kriegen sonst zwar Datenbank-
  // Zugriff auf Berichte, aber keinen Coach-Identitäts-Wechsel — der ist
  // beweisrechtlich sensibel und bleibt am Owner.
  if (!(await isTenantOwner(session))) {
    backToBildungstraegerWithError("not_owner");
  }
  const userId = String(formData.get("userId") ?? "");
  if (!userId) backToBildungstraegerWithError("invalid");

  // Tenant-Filter ist hart Pflicht: ohne den könnte ein BT durch einfache
  // UUID-Manipulation einen Coach eines anderen Mandanten impersonaten —
  // direkter Datenleak und Beweiskraft kaputt.
  const [target] = await db
    .select({
      id: schema.users.id,
      banned: schema.users.banned,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.tenantId, tenantId),
        eq(schema.users.role, "coach"),
        isNull(schema.users.deletedAt),
      ),
    )
    .limit(1);

  if (!target) backToBildungstraegerWithError("unknown");
  if (target.banned) backToBildungstraegerWithError("banned");

  try {
    await auth.api.impersonateUser({
      body: { userId: target.id },
      headers: await headers(),
    });
  } catch (err) {
    // redirect() wirft intern NEXT_REDIRECT — nicht abfangen
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    if (err instanceof APIError) backToBildungstraegerWithError("api");
    throw err;
  }
  redirect("/coach");
}

export async function stopImpersonating(): Promise<void> {
  const session = await getCurrentSession();
  if (!session || !isImpersonating(session)) return;

  await auth.api.stopImpersonating({ headers: await headers() });
  redirect("/bildungstraeger");
}

/**
 * Freigabe eines BERs trotz offener soft_flag-Hinweise. Der Bildungsträger
 * hat die Hinweise gesehen und entschieden, dass sie akzeptabel sind.
 * Setzt `softFlagsAcknowledgedAt` + `softFlagsAcknowledgedBy` auf der BER-
 * Zeile und loggt den Vorgang. Blockiert während Impersonation, damit die
 * Ack rechtlich klar dem Bildungsträger zuzuordnen ist.
 */
export async function acknowledgeSoftFlags(
  formData: FormData,
): Promise<void> {
  const session = await requireBildungstraeger();
  if (isImpersonating(session)) {
    redirect("/bildungstraeger?imp_error=invalid");
  }
  const tenantId = getTenantId(session);
  const berId = String(formData.get("berId") ?? "").trim();
  if (!berId) return;

  // BER über Coach-Join tenant-scopen — sonst könnte ein BT die soft-flags
  // einer fremden Bildungsträger-BER acknowledgen, was im Audit-Log
  // zu „BT von Tenant A hat BER von Tenant B freigegeben" führt.
  const [existing] = await db
    .select({
      id: schema.abschlussberichte.id,
      alreadyAckAt: schema.abschlussberichte.softFlagsAcknowledgedAt,
    })
    .from(schema.abschlussberichte)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.abschlussberichte.coachId),
    )
    .where(
      and(
        eq(schema.abschlussberichte.id, berId),
        eq(schema.users.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!existing) return;
  if (existing.alreadyAckAt) {
    // Ack ist idempotent — nichts tun, aber revalidate damit der UI-State
    // konsistent ist, falls es eine Race war.
    revalidatePath(`/bildungstraeger/abschlussberichte/${berId}`);
    return;
  }

  const now = new Date();
  await db
    .update(schema.abschlussberichte)
    .set({
      softFlagsAcknowledgedAt: now,
      softFlagsAcknowledgedBy: session.user.id,
    })
    .where(eq(schema.abschlussberichte.id, berId));

  await logAudit({
    actorType: "bildungstraeger",
    actorId: session.user.id,
    action: "ber.soft_flags.acknowledged",
    resourceType: "abschlussbericht",
    resourceId: berId,
  });

  revalidatePath(`/bildungstraeger/abschlussberichte/${berId}`);
  revalidatePath("/bildungstraeger");
}

/**
 * Soft-Delete eines Coaches durch den Bildungsträger. Blockiert, wenn der
 * Coach noch nicht-archivierte Kurse hat — sonst würde der Kurs-Besitz
 * plötzlich auf eine „gelöschte" User-ID verweisen und die Bildungsträger-
 * Übersicht kann nicht mehr sauber filtern. Dank des Partial-Unique-Index
 * auf `email WHERE deleted_at IS NULL` kann dieselbe E-Mail danach wieder
 * eingeladen werden. Während Impersonation hart blockiert — role-mutierende
 * Aktionen laufen nie unter Coach-Identität.
 */
export async function deleteCoach(formData: FormData): Promise<void> {
  const session = await requireBildungstraeger();
  if (isImpersonating(session)) {
    redirect("/bildungstraeger?imp_error=invalid");
  }
  const tenantId = getTenantId(session);

  const coachId = String(formData.get("coachId") ?? "").trim();
  if (!coachId) {
    redirect("/bildungstraeger?imp_error=invalid");
  }

  const [target] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, coachId),
        eq(schema.users.tenantId, tenantId),
        eq(schema.users.role, "coach"),
        isNull(schema.users.deletedAt),
      ),
    )
    .limit(1);
  if (!target) {
    redirect("/bildungstraeger?imp_error=unknown");
  }

  const [activeCourses] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.courses)
    .where(
      and(
        eq(schema.courses.coachId, coachId),
        isNull(schema.courses.deletedAt),
        ne(schema.courses.status, "archived"),
      ),
    );
  if ((activeCourses?.count ?? 0) > 0) {
    redirect("/bildungstraeger?imp_error=has_courses");
  }

  await db
    .update(schema.users)
    .set({ deletedAt: new Date(), banned: true })
    .where(eq(schema.users.id, coachId));

  await logAudit({
    actorType: "bildungstraeger",
    actorId: session.user.id,
    action: "coach.delete",
    resourceType: "user",
    resourceId: coachId,
  });

  revalidatePath("/bildungstraeger");
}

export type SubmitAfaState =
  | { error?: string; submitted?: boolean }
  | undefined;

/**
 * Firma/Bildungsträger markiert den (bereits vom Coach gesiegelten) Stundennachweis
 * als an die AfA übermittelt. Aktuell rein dokumentarisch — die tatsächliche
 * Übermittlung (E-Mail-Anhang an den Bedarfsträger, Portal-Upload, o.ä.)
 * bleibt manueller Prozess, bis der Rechnungs-Flow in Phase 2 das koppelt.
 *
 * Nur `role=bildungstraeger` darf das sehen/auslösen — Coaches haben auf AfA-
 * Übermittlung keinen Zugriff. Während Impersonation hart blockiert, weil
 * AfA-Übermittlung eine Firmen-Aktion ist und nicht unter Coach-Identität
 * laufen darf.
 */
export async function submitCourseToAfa(
  _prev: SubmitAfaState,
  formData: FormData,
): Promise<SubmitAfaState> {
  const session = await requireBildungstraeger();
  // Feature vorübergehend deaktiviert (Coming soon) — harter Server-Guard,
  // damit auch ein direkter Form-POST keinen Datensatz mehr als „übermittelt"
  // markieren kann.
  if (!AFA_SUBMISSION_ENABLED) {
    return {
      error:
        "Die AfA-Übermittlung ist derzeit deaktiviert (Coming soon) und wird in Kürze freigeschaltet.",
    };
  }
  if (isImpersonating(session)) {
    return { error: "Während Impersonation nicht möglich." };
  }
  const bildungstraegerUserId = session.user.id;
  const tenantId = getTenantId(session);

  const courseId = String(formData.get("courseId") ?? "").trim();
  if (!courseId) return { error: "Kurs fehlt." };

  // Tenant-Filter über Coach-Join — sonst könnte ein BT durch courseId-
  // Manipulation einen Kurs eines fremden Mandanten als „an AfA übermittelt"
  // markieren und damit die Beweiskette stören.
  const [doc] = await db
    .select({
      id: schema.finalDocuments.id,
      fesStatus: schema.finalDocuments.fesStatus,
      afaStatus: schema.finalDocuments.afaStatus,
    })
    .from(schema.finalDocuments)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.finalDocuments.courseId))
    .innerJoin(schema.users, eq(schema.users.id, schema.courses.coachId))
    .where(
      and(
        eq(schema.finalDocuments.courseId, courseId),
        eq(schema.users.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!doc) return { error: "Kurs ist noch nicht abgeschlossen." };
  if (doc.fesStatus !== "completed") {
    return { error: "Abschluss fehlt — erst muss der Coach den Nachweis abschließen." };
  }
  if (doc.afaStatus === "submitted") {
    return { error: "Kurs wurde bereits an die AfA übermittelt." };
  }

  // Atomares Submit: WHERE afa_status='pending' verhindert, dass zwei
  // parallele Requests beide `submitted` setzen. Wir prüfen danach ob
  // wirklich eine Zeile geschrieben wurde — nur dann das Audit-Log
  // schreiben, sonst doppeltes Log bei Concurrent-Submit.
  const now = new Date();
  const submittedByAction = await db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.finalDocuments)
      .set({
        afaStatus: "submitted",
        submittedToAfaAt: now,
        submittedBy: bildungstraegerUserId,
      })
      .where(
        and(
          eq(schema.finalDocuments.id, doc.id),
          eq(schema.finalDocuments.afaStatus, "pending"),
        ),
      )
      .returning({ id: schema.finalDocuments.id });

    if (updated.length === 0) return false;

    await logAudit(
      {
        actorType: "bildungstraeger",
        actorId: bildungstraegerUserId,
        action: "course.submit_afa",
        resourceType: "course",
        resourceId: courseId,
      },
      tx,
    );
    return true;
  });

  if (!submittedByAction) {
    return { error: "Kurs wurde zwischenzeitlich bereits übermittelt." };
  }

  revalidatePath("/bildungstraeger/submissions");
  return { submitted: true };
}

/**
 * Lädt eine weitere Person als BT-Mitarbeiter:in in den eigenen Tenant ein.
 * Eingeladene haben dieselben Rechte wie der einladende User (Coaches
 * verwalten, Berichte prüfen, weitere BT-Personen einladen) — Ausnahme
 * ist Impersonation, die per Owner-Gate nur dem ältesten aktiven BT-User
 * vorbehalten ist (siehe `impersonateCoach`).
 *
 * Während Impersonation hart blockiert: ein Coach-Account, das gerade
 * impersonated wird, darf keine neuen BT-Personen ins System holen.
 */
export async function inviteBildungstraeger(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const session = await requireBildungstraeger();
  if (isImpersonating(session)) {
    return { error: "Während Impersonation nicht möglich." };
  }
  const tenantId = getTenantId(session);

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();

  if (!email || !name) {
    return { error: "Name und E-Mail sind erforderlich." };
  }

  const placeholderPassword = crypto.randomBytes(32).toString("hex");

  const h = await headers();

  // Existence-Check tenant-scoped — siehe `inviteCoach` für die ausführliche
  // Begründung. Resurrect-Pfad analog, nur dass die wiederbelebte Zeile als
  // `bildungstraeger` markiert wird.
  const [existing] = await db
    .select({
      id: schema.users.id,
      deletedAt: schema.users.deletedAt,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.email, email),
        eq(schema.users.tenantId, tenantId),
      ),
    )
    .limit(1);

  let createdUserId: string | null = null;
  if (existing && existing.deletedAt) {
    await db
      .update(schema.users)
      .set({
        tenantId,
        deletedAt: null,
        banned: false,
        banReason: null,
        banExpires: null,
        emailVerified: false,
        name,
        role: "bildungstraeger",
        // BT-User brauchen den signing-Flag nicht — der gilt nur für
        // Coaches und steuert dort den Signatur-Modus.
        signingEnabled: false,
      })
      .where(eq(schema.users.id, existing.id));
    createdUserId = existing.id;
  } else if (existing && !existing.deletedAt) {
    return {
      error:
        "Einladung fehlgeschlagen: Diese E-Mail-Adresse ist bereits in deinem Tenant aktiv.",
    };
  } else {
    try {
      const result = await auth.api.createUser({
        body: {
          email,
          name,
          password: placeholderPassword,
          role: "bildungstraeger",
          data: { tenantId },
        },
        headers: h,
      });
      createdUserId = result.user?.id ?? null;
    } catch (err) {
      if (err instanceof APIError) {
        return { error: `Einladung fehlgeschlagen: ${err.message}` };
      }
      throw err;
    }
  }

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: h,
    });
  } catch (err) {
    // Reset-Mail fehlgeschlagen → Cleanup analog `inviteCoach`.
    if (createdUserId) {
      await db
        .update(schema.users)
        .set({ deletedAt: new Date(), banned: true })
        .where(eq(schema.users.id, createdUserId))
        .catch(() => {
          /* best-effort */
        });
    }
    if (err instanceof APIError) {
      return {
        error: `Einladungs-E-Mail fehlgeschlagen (${err.message}). Der User wurde rückgängig gemacht, bitte erneut einladen.`,
      };
    }
    throw err;
  }

  await logAudit({
    actorType: "bildungstraeger",
    actorId: session.user.id,
    action: "bildungstraeger.invite",
    resourceType: "user",
    resourceId: createdUserId ?? "unknown",
  });

  revalidatePath("/bildungstraeger/team");
  return { success: `Einladung an ${email} versendet.` };
}

/**
 * Deaktiviert (soft-delete) eine BT-Kolleg:in. Mehrere Sicherheits-Schranken:
 *
 * - Impersonation blockiert (rollen-mutierende Aktion)
 * - Eigener Account kann nicht deaktiviert werden → kein Self-Lockout
 * - Owner-Account kann nicht deaktiviert werden → schützt vor versehentlichem
 *   Verlust des Impersonation-Rechts. Owner-Übergabe geht implizit: wenn der
 *   Owner sich selber löschen wollte, müsste vorher manuell jemand anderes
 *   älter werden (heute nicht über die UI möglich — bewusst).
 */
export async function deactivateBildungstraeger(
  formData: FormData,
): Promise<void> {
  const session = await requireBildungstraeger();
  if (isImpersonating(session)) {
    redirect("/bildungstraeger/team?team_error=invalid");
  }
  const tenantId = getTenantId(session);

  const targetUserId = String(formData.get("userId") ?? "").trim();
  if (!targetUserId) {
    redirect("/bildungstraeger/team?team_error=invalid");
  }
  if (targetUserId === session.user.id) {
    redirect("/bildungstraeger/team?team_error=self");
  }

  const ownerId = await getTenantOwnerId(tenantId);
  if (ownerId === targetUserId) {
    redirect("/bildungstraeger/team?team_error=owner_locked");
  }

  const [target] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, targetUserId),
        eq(schema.users.tenantId, tenantId),
        eq(schema.users.role, "bildungstraeger"),
        isNull(schema.users.deletedAt),
      ),
    )
    .limit(1);
  if (!target) {
    redirect("/bildungstraeger/team?team_error=unknown");
  }

  await db
    .update(schema.users)
    .set({ deletedAt: new Date(), banned: true })
    .where(eq(schema.users.id, targetUserId));

  await logAudit({
    actorType: "bildungstraeger",
    actorId: session.user.id,
    action: "bildungstraeger.deactivate",
    resourceType: "user",
    resourceId: targetUserId,
  });

  revalidatePath("/bildungstraeger/team");
}
