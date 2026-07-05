import * as schema from "@/db/schema";

import type { TestDb } from "./db";

/**
 * Factories zum Aufbau einer bekannten Test-Welt. Jede Funktion füllt die
 * Pflichtfelder mit sinnvollen Defaults und lässt sich pro Test überschreiben.
 * Ein Zähler sorgt für kollisionsfreie Unique-Werte (E-Mail, slug, Kunden-Nr) —
 * deterministisch, ohne Zufall.
 */
let seq = 0;
const next = () => ++seq;

export async function makeTenant(db: TestDb, name = "Tenant") {
  const [row] = await db
    .insert(schema.tenants)
    .values({ name, slug: `${name.toLowerCase()}-${next()}` })
    .returning();
  return row;
}

export async function makeUser(
  db: TestDb,
  opts: {
    tenantId: string;
    role?: "coach" | "bildungstraeger";
    email?: string;
    name?: string;
    /** Explizit setzbar für Owner-Tests (Owner = ältester aktiver BT-User). */
    createdAt?: Date;
    deletedAt?: Date;
  },
) {
  const n = next();
  const [row] = await db
    .insert(schema.users)
    .values({
      tenantId: opts.tenantId,
      role: opts.role ?? "coach",
      email: opts.email ?? `user-${n}@example.com`,
      name: opts.name ?? `User ${n}`,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      ...(opts.deletedAt ? { deletedAt: opts.deletedAt } : {}),
    })
    .returning();
  return row;
}

export const makeCoach = (db: TestDb, tenantId: string, email?: string) =>
  makeUser(db, { tenantId, role: "coach", email });

export const makeBildungstraeger = (
  db: TestDb,
  tenantId: string,
  opts: { email?: string; createdAt?: Date; deletedAt?: Date } = {},
) => makeUser(db, { tenantId, role: "bildungstraeger", ...opts });

export async function makeParticipant(
  db: TestDb,
  opts: { tenantId: string; email?: string; name?: string; kundenNr?: string },
) {
  const n = next();
  const [row] = await db
    .insert(schema.participants)
    .values({
      tenantId: opts.tenantId,
      name: opts.name ?? `Kunde ${n}`,
      email: opts.email ?? `kunde-${n}@example.com`,
      kundenNr: opts.kundenNr ?? `KD-${n}`,
    })
    .returning();
  return row;
}

export async function makeBedarfstraeger(
  db: TestDb,
  opts: { tenantId: string; name?: string; type?: "JC" | "AA" },
) {
  const [row] = await db
    .insert(schema.bedarfstraeger)
    .values({
      tenantId: opts.tenantId,
      name: opts.name ?? `Jobcenter ${next()}`,
      type: opts.type ?? "JC",
    })
    .returning();
  return row;
}

export async function makeCourse(
  db: TestDb,
  opts: {
    coachId: string;
    participantId: string;
    bedarfstraegerId: string;
    title?: string;
  },
) {
  const [row] = await db
    .insert(schema.courses)
    .values({
      coachId: opts.coachId,
      participantId: opts.participantId,
      bedarfstraegerId: opts.bedarfstraegerId,
      title: opts.title ?? `Maßnahme ${next()}`,
      avgsNummer: `AVGS-${next()}`,
      durchfuehrungsort: "Online",
      anzahlBewilligteUe: 80,
      avgsGueltigVon: "2026-01-01",
      avgsGueltigBis: "2026-12-31",
    })
    .returning();
  return row;
}

/** Fügt einen Coach dem Kompetenzteam eines Kurses hinzu. */
export async function addToTeam(db: TestDb, courseId: string, coachId: string) {
  await db.insert(schema.courseCoaches).values({ courseId, coachId });
}
