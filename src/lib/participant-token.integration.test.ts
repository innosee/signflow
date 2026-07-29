import crypto from "node:crypto";

import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import {
  makeBedarfstraeger,
  makeCoach,
  makeCourse,
  makeParticipant,
  makeTenant,
} from "@/test/factories";

// participant-tokens.ts ist server-only und importiert @/db, @/lib/email,
// @/lib/sms. resolveParticipantToken braucht nur die DB — Mail/SMS werden
// gestubbt, damit der Import nicht scheitert.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/email", () => ({
  sendParticipantMagicLink: vi.fn(),
}));
vi.mock("@/lib/sms", () => ({
  composeMagicLinkSms: vi.fn(),
  isSmsEnabled: () => false,
  isValidE164: () => false,
  sendSms: vi.fn(),
}));
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

const { createParticipantMagicLink, resolveParticipantToken } = await import(
  "@/lib/participant-tokens"
);

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

/**
 * Integrationstest — Katalog §E (docs/test-plan-access-control.md):
 * Ein Magic-Link-Token löst NUR seine eigene (Kurs × Kunde)-Paarung auf. Er
 * darf keine fremden Kurse/Kunden preisgeben, muss die 1:1-Bindung erzwingen
 * und nach Ablauf ungültig sein.
 */
describe("resolveParticipantToken (Magic-Link-Isolation)", () => {
  let db: TestDb;
  let kA1: string; // Kurs mit Kunde pa1
  let kA2: string; // Kurs mit Kunde pa2
  let pa1Id: string;
  let pa2Id: string;
  let pa1Name: string;

  beforeEach(async () => {
    db = await createTestDb();
    (dbHolder as { current: unknown }).current = db;

    const t = await makeTenant(db, "Alpha");
    const coach = await makeCoach(db, t.id);
    const bt = await makeBedarfstraeger(db, { tenantId: t.id });
    const pa1 = await makeParticipant(db, { tenantId: t.id, name: "Max Muster" });
    const pa2 = await makeParticipant(db, { tenantId: t.id, name: "Erika Beispiel" });
    pa1Id = pa1.id;
    pa2Id = pa2.id;
    pa1Name = pa1.name;

    const courseA1 = await makeCourse(db, {
      coachId: coach.id,
      participantId: pa1.id,
      bedarfstraegerId: bt.id,
    });
    const courseA2 = await makeCourse(db, {
      coachId: coach.id,
      participantId: pa2.id,
      bedarfstraegerId: bt.id,
    });
    kA1 = courseA1.id;
    kA2 = courseA2.id;
  });

  afterAll(() => {
    (dbHolder as { current: unknown }).current = undefined;
  });

  it("löst einen gültigen Token auf die richtige Paarung auf", async () => {
    const { token } = await createParticipantMagicLink({
      courseId: kA1,
      participantId: pa1Id,
    });
    const resolved = await resolveParticipantToken(token);
    expect(resolved).not.toBeNull();
    expect(resolved!.courseId).toBe(kA1);
    expect(resolved!.participantId).toBe(pa1Id);
    expect(resolved!.participantName).toBe(pa1Name);
  });

  it("gibt nur den EIGENEN Kurs preis, nicht einen fremden", async () => {
    const { token } = await createParticipantMagicLink({
      courseId: kA1,
      participantId: pa1Id,
    });
    const resolved = await resolveParticipantToken(token);
    expect(resolved!.courseId).toBe(kA1);
    expect(resolved!.courseId).not.toBe(kA2);
  });

  it("erzwingt die 1:1-Bindung: Token mit falschem Kunden → null", async () => {
    // Token für Kurs kA1, aber mit pa2 (kA1 gehört pa1) → 1:1-Defense greift.
    const { token } = await createParticipantMagicLink({
      courseId: kA1,
      participantId: pa2Id,
    });
    expect(await resolveParticipantToken(token)).toBeNull();
  });

  it("verwirft einen abgelaufenen Token", async () => {
    const raw = "abgelaufener-token";
    await db.insert(schema.participantAccessTokens).values({
      courseId: kA1,
      participantId: pa1Id,
      tokenHash: hashToken(raw),
      expiresAt: new Date("2020-01-01T00:00:00Z"), // Vergangenheit
    });
    expect(await resolveParticipantToken(raw)).toBeNull();
  });

  it("verwirft einen unbekannten Token", async () => {
    expect(await resolveParticipantToken("gibt-es-nicht")).toBeNull();
  });
});
