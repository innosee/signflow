import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/test/db";
import { makeBildungstraeger, makeCoach, makeTenant } from "@/test/factories";

// dal.ts ist server-only und importiert @/db und @/lib/auth. getTenantOwnerId
// braucht nur die DB — auth wird gestubbt, damit der Import nicht scheitert.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: {} } }));
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

const { getTenantOwnerId } = await import("@/lib/dal");

const D = (iso: string) => new Date(iso);

/**
 * Integrationstest — Katalog §C (docs/test-plan-access-control.md):
 * Owner eines Mandanten ist der ÄLTESTE aktive Bildungsträger-User. Nur er
 * darf später Coaches impersonaten. Coaches zählen nicht, soft-gelöschte
 * BT-User zählen nicht, und Owner ist streng pro Mandant.
 */
describe("getTenantOwnerId (Owner = ältester aktiver BT)", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    (dbHolder as { current: unknown }).current = db;
  });

  afterAll(() => {
    (dbHolder as { current: unknown }).current = undefined;
  });

  it("wählt den ältesten aktiven BT-User als Owner", async () => {
    const t = await makeTenant(db, "Alpha");
    const older = await makeBildungstraeger(db, t.id, {
      createdAt: D("2026-01-01T00:00:00Z"),
    });
    await makeBildungstraeger(db, t.id, {
      createdAt: D("2026-02-01T00:00:00Z"),
    });

    expect(await getTenantOwnerId(t.id)).toBe(older.id);
  });

  it("ignoriert Coaches — nur BT-User kommen als Owner infrage", async () => {
    const t = await makeTenant(db, "Alpha");
    // Coach ist älter, darf aber NICHT Owner sein.
    await makeCoach(db, t.id);
    const bt = await makeBildungstraeger(db, t.id, {
      createdAt: D("2026-03-01T00:00:00Z"),
    });

    expect(await getTenantOwnerId(t.id)).toBe(bt.id);
  });

  it("rückt zum nächst-ältesten BT nach, wenn der älteste soft-gelöscht ist", async () => {
    const t = await makeTenant(db, "Alpha");
    await makeBildungstraeger(db, t.id, {
      createdAt: D("2026-01-01T00:00:00Z"),
      deletedAt: D("2026-04-01T00:00:00Z"),
    });
    const next = await makeBildungstraeger(db, t.id, {
      createdAt: D("2026-02-01T00:00:00Z"),
    });

    expect(await getTenantOwnerId(t.id)).toBe(next.id);
  });

  it("ist streng pro Mandant getrennt", async () => {
    const alpha = await makeTenant(db, "Alpha");
    const beta = await makeTenant(db, "Beta");
    const ownerA = await makeBildungstraeger(db, alpha.id, {
      createdAt: D("2026-01-01T00:00:00Z"),
    });
    const ownerB = await makeBildungstraeger(db, beta.id, {
      createdAt: D("2026-01-15T00:00:00Z"),
    });

    expect(await getTenantOwnerId(alpha.id)).toBe(ownerA.id);
    expect(await getTenantOwnerId(beta.id)).toBe(ownerB.id);
  });

  it("gibt null zurück, wenn es keinen BT im Mandanten gibt", async () => {
    const t = await makeTenant(db, "Leer");
    await makeCoach(db, t.id); // nur ein Coach
    expect(await getTenantOwnerId(t.id)).toBeNull();
  });
});
