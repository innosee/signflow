import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/test/db";
import {
  makeBedarfstraeger,
  makeCoach,
  makeCourse,
  makeParticipant,
  makeTenant,
} from "@/test/factories";
import * as schema from "@/db/schema";

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

const { geleisteteUeForCourse } = await import("@/lib/course-ue");

/**
 * Integrationstest: die geleisteten UE sind die Zahl, die auf Abschlussbericht
 * und Teilnahmebescheinigung steht. Ein vorzeitig beendetes Coaching (17 von 80
 * bewilligten UE) darf dort NIE die Bewilligungsmenge ausweisen.
 */
describe("geleisteteUeForCourse", () => {
  let db: TestDb;

  async function seedCourse() {
    const t = await makeTenant(db, "Alpha");
    const coach = await makeCoach(db, t.id);
    const participant = await makeParticipant(db, { tenantId: t.id });
    const bt = await makeBedarfstraeger(db, { tenantId: t.id });
    return makeCourse(db, {
      coachId: coach.id,
      participantId: participant.id,
      bedarfstraegerId: bt.id,
    });
  }

  type SessionOpts = {
    anzahlUe: string;
    status?: "pending" | "coach_signed" | "completed";
    isErstgespraech?: boolean;
    geeignet?: boolean;
    abgesagt?: boolean;
    deletedAt?: Date;
  };

  async function addSession(
    courseId: string,
    date: string,
    opts: SessionOpts,
  ) {
    await db.insert(schema.sessions).values({
      courseId,
      sessionDate: date,
      topic: "Thema",
      anzahlUe: opts.anzahlUe,
      modus: "online",
      isErstgespraech: opts.isErstgespraech ?? false,
      geeignet: opts.geeignet ?? null,
      abgesagt: opts.abgesagt ?? false,
      status: opts.status ?? "completed",
      deletedAt: opts.deletedAt ?? null,
    });
  }

  beforeEach(async () => {
    db = await createTestDb();
    (dbHolder as { current: unknown }).current = db;
  });

  afterAll(() => {
    (dbHolder as { current: unknown }).current = undefined;
  });

  it("summiert nur vollständig signierte Termine", async () => {
    const course = await seedCourse();
    await addSession(course.id, "2026-07-01", { anzahlUe: "8" });
    await addSession(course.id, "2026-07-02", { anzahlUe: "9" });
    // Noch offen bzw. nur vom Coach signiert → zählt (noch) nicht.
    await addSession(course.id, "2026-07-03", {
      anzahlUe: "4",
      status: "coach_signed",
    });
    await addSession(course.id, "2026-07-06", {
      anzahlUe: "4",
      status: "pending",
    });

    // 17 statt der 80 bewilligten UE — genau der Fall „vorzeitig beendet".
    expect(await geleisteteUeForCourse(course.id)).toBe(17);
    expect(course.anzahlBewilligteUe).toBe(80);
  });

  it("zählt Erstgespräch, Absagen und gelöschte Termine nicht mit", async () => {
    const course = await seedCourse();
    await addSession(course.id, "2026-07-01", {
      anzahlUe: "0",
      isErstgespraech: true,
      geeignet: true,
    });
    await addSession(course.id, "2026-07-02", { anzahlUe: "0", abgesagt: true });
    await addSession(course.id, "2026-07-03", {
      anzahlUe: "6",
      deletedAt: new Date(),
    });
    await addSession(course.id, "2026-07-06", { anzahlUe: "2.5" });

    expect(await geleisteteUeForCourse(course.id)).toBe(2.5);
  });

  it("liefert 0 für einen Kurs ohne Termine", async () => {
    const course = await seedCourse();
    expect(await geleisteteUeForCourse(course.id)).toBe(0);
  });
});
