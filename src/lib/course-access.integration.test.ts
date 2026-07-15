import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import {
  addToTeam,
  makeBedarfstraeger,
  makeCoach,
  makeCourse,
  makeParticipant,
  makeTenant,
} from "@/test/factories";

// course-access.ts ist server-only und importiert @/db (Neon). Für den Test:
//  - server-only als No-op stubben (läuft sonst außerhalb einer RSC nicht),
//  - @/db auf die In-Process-Test-DB umleiten (nie Neon).
vi.mock("server-only", () => ({}));
const dbHolder = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/db", async () => {
  const actualSchema = await vi.importActual("@/db/schema");
  return {
    schema: actualSchema,
    get db() {
      return (dbHolder as { current: unknown }).current;
    },
  };
});

// Erst nach dem Mock importieren, damit course-access das gemockte @/db zieht.
const { coachCanAccessCourse } = await import("@/lib/course-access");

/**
 * Integrationstest gegen echtes (In-Process-)Postgres — Katalog §A
 * (docs/test-plan-access-control.md): Ein Coach darf eine Maßnahme nur
 * öffnen, wenn er im Kompetenzteam ist (course_coaches) bzw. der primäre
 * Coach. Fremde Coaches und fremde Mandanten müssen abgewiesen werden.
 */
describe("coachCanAccessCourse (Kompetenzteam-Isolation)", () => {
  let db: TestDb;

  // Zwei-Mandanten-Welt
  let ca1: string; // Coach Alpha 1 (primär + Team von ka1)
  let ca2: string; // Coach Alpha 2 (kein Team von ka1)
  let cb1: string; // Coach Beta 1 (fremder Mandant)
  let ka1: string; // Kurs Alpha 1
  let ka1Deleted: string; // soft-gelöschter Kurs

  beforeAll(async () => {
    db = await createTestDb();
    (dbHolder as { current: unknown }).current = db;

    const alpha = await makeTenant(db, "Alpha");
    const beta = await makeTenant(db, "Beta");

    const coachA1 = await makeCoach(db, alpha.id);
    const coachA2 = await makeCoach(db, alpha.id);
    const coachB1 = await makeCoach(db, beta.id);
    ca1 = coachA1.id;
    ca2 = coachA2.id;
    cb1 = coachB1.id;

    const pa1 = await makeParticipant(db, { tenantId: alpha.id });
    const pa2 = await makeParticipant(db, { tenantId: alpha.id });
    const btA = await makeBedarfstraeger(db, { tenantId: alpha.id });

    const courseA1 = await makeCourse(db, {
      coachId: coachA1.id,
      participantId: pa1.id,
      bedarfstraegerId: btA.id,
    });
    ka1 = courseA1.id;
    await addToTeam(db, courseA1.id, coachA1.id);

    // Soft-gelöschter Kurs (auch für ca1 im Team) — darf nicht sichtbar sein.
    const courseDeleted = await makeCourse(db, {
      coachId: coachA1.id,
      participantId: pa2.id,
      bedarfstraegerId: btA.id,
    });
    ka1Deleted = courseDeleted.id;
    await addToTeam(db, courseDeleted.id, coachA1.id);
    await db
      .update(schema.courses)
      .set({ deletedAt: new Date() })
      .where(eq(schema.courses.id, courseDeleted.id));
  });

  afterAll(() => {
    (dbHolder as { current: unknown }).current = undefined;
  });

  it("erlaubt dem Team-Coach den Zugriff", async () => {
    expect(await coachCanAccessCourse(ka1, ca1)).toBe(true);
  });

  it("verweigert einem Coach desselben Mandanten, der NICHT im Team ist", async () => {
    expect(await coachCanAccessCourse(ka1, ca2)).toBe(false);
  });

  it("verweigert einem Coach eines FREMDEN Mandanten (Cross-Tenant)", async () => {
    expect(await coachCanAccessCourse(ka1, cb1)).toBe(false);
  });

  it("verweigert den Zugriff auf einen soft-gelöschten Kurs", async () => {
    expect(await coachCanAccessCourse(ka1Deleted, ca1)).toBe(false);
  });
});
