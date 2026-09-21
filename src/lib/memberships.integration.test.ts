import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { makeCoach, makeTenant, makeUser } from "@/test/factories";

// memberships.ts ist server-only und zieht @/db (Neon). Für den Test:
// server-only stubben und @/db auf die In-Process-Test-DB umleiten.
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

const { getTenantCoachesByIds } = await import("@/lib/memberships");

/**
 * Integrationstest zum Fall „Hermina Laktos" (09/2026): ein deaktivierter
 * Coach blieb im Kompetenzteam stehen, war im Multiselect aber unsichtbar —
 * der Kunde ließ sich dadurch überhaupt nicht mehr speichern. Der Helper muss
 * genau solche Teammitglieder auflösen (inkl. deaktivierter), ohne dabei
 * Namen aus fremden Mandanten preiszugeben.
 */
describe("getTenantCoachesByIds (deaktivierte Teammitglieder auflösen)", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    (dbHolder as { current: unknown }).current = db;
  });

  it("liefert deaktivierte Coaches mit inactive=true", async () => {
    const t = await makeTenant(db, "Alpha");
    const weg = await makeUser(db, {
      tenantId: t.id,
      role: "coach",
      name: "Natalya Symonova",
      deletedAt: new Date("2026-07-17T08:07:52Z"),
    });

    const [row] = await getTenantCoachesByIds(t.id, [weg.id]);
    expect(row).toMatchObject({ id: weg.id, name: "Natalya Symonova" });
    expect(row.inactive).toBe(true);
  });

  it("markiert aktive Coaches als inactive=false", async () => {
    const t = await makeTenant(db, "Alpha");
    const aktiv = await makeCoach(db, t.id);

    const [row] = await getTenantCoachesByIds(t.id, [aktiv.id]);
    expect(row.inactive).toBe(false);
  });

  it("gibt keine Coaches fremder Mandanten preis", async () => {
    const alpha = await makeTenant(db, "Alpha");
    const beta = await makeTenant(db, "Beta");
    const fremd = await makeCoach(db, beta.id);

    expect(await getTenantCoachesByIds(alpha.id, [fremd.id])).toEqual([]);
  });

  it("findet Coaches über die Mitgliedschaft, nicht nur über den Heimat-Tenant", async () => {
    const heimat = await makeTenant(db, "Heimat");
    const gast = await makeTenant(db, "Gast");
    const coach = await makeCoach(db, heimat.id);
    await db.insert(schema.tenantMemberships).values({
      userId: coach.id,
      tenantId: gast.id,
      role: "coach",
      acceptedAt: new Date(),
    });

    const [row] = await getTenantCoachesByIds(gast.id, [coach.id]);
    expect(row?.id).toBe(coach.id);
  });

  it("ignoriert Nicht-Coaches und leere Eingaben", async () => {
    const t = await makeTenant(db, "Alpha");
    const bt = await makeUser(db, { tenantId: t.id, role: "bildungstraeger" });

    expect(await getTenantCoachesByIds(t.id, [bt.id])).toEqual([]);
    expect(await getTenantCoachesByIds(t.id, [])).toEqual([]);
  });
});
