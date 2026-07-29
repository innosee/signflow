import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { eq } from "drizzle-orm";

import * as schema from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { makeBildungstraeger, makeCoach, makeTenant } from "@/test/factories";

// branding.ts ist server-only und importiert @/db + @/lib/storage. getBranding
// braucht nur die DB — storage.resolveAssetUrl wird durchgereicht gestubbt,
// damit der Logo-Key unverändert zurückkommt.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({
  resolveAssetUrl: async (v: string | null | undefined) => v ?? null,
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

const { getBranding } = await import("@/lib/branding");

const D = (iso: string) => new Date(iso);

/**
 * Regression: Branding ist org-weit, wird aber (Legacy) auf einer BT-User-Zeile
 * gespeichert. getBranding MUSS deterministisch die Owner-Zeile (ältester
 * aktiver BT) lesen — dieselbe, auf die updateBrandingAction schreibt. Sonst
 * trifft `.limit(1)` bei mehreren BT-Usern eine beliebige Zeile und die
 * gespeicherte Adresse/Logo „haften" scheinbar nicht.
 */
describe("getBranding (liest deterministisch die Owner-Zeile)", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
    (dbHolder as { current: unknown }).current = db;
  });

  afterAll(() => {
    (dbHolder as { current: unknown }).current = undefined;
  });

  it("liefert das Branding des Owners, nicht das eines jüngeren BT-Users", async () => {
    const t = await makeTenant(db, "Alpha");
    const owner = await makeBildungstraeger(db, t.id, {
      createdAt: D("2026-01-01T00:00:00Z"),
    });
    const younger = await makeBildungstraeger(db, t.id, {
      createdAt: D("2026-02-01T00:00:00Z"),
    });

    await db
      .update(schema.users)
      .set({ pdfAddress: "OWNER-ADR", pdfLogoUrl: "owner-logo.png" })
      .where(eq(schema.users.id, owner.id));
    await db
      .update(schema.users)
      .set({ pdfAddress: "OTHER-ADR", pdfLogoUrl: "other-logo.png" })
      .where(eq(schema.users.id, younger.id));

    const branding = await getBranding(t.id);
    expect(branding.address).toBe("OWNER-ADR");
    expect(branding.logoUrl).toBe("owner-logo.png");
  });

  it("ist streng pro Mandant getrennt", async () => {
    const a = await makeTenant(db, "Alpha");
    const b = await makeTenant(db, "Beta");
    const ownerA = await makeBildungstraeger(db, a.id, {
      createdAt: D("2026-01-01T00:00:00Z"),
    });
    await makeBildungstraeger(db, b.id, {
      createdAt: D("2026-01-01T00:00:00Z"),
    });
    await db
      .update(schema.users)
      .set({ pdfAddress: "NUR-ALPHA" })
      .where(eq(schema.users.id, ownerA.id));

    expect((await getBranding(a.id)).address).toBe("NUR-ALPHA");
    expect((await getBranding(b.id)).address).toBe("");
  });

  it("ignoriert Coaches als Branding-Quelle", async () => {
    const t = await makeTenant(db, "Alpha");
    // Coach ist älter, ist aber keine Branding-/Owner-Quelle.
    await makeCoach(db, t.id);
    const owner = await makeBildungstraeger(db, t.id, {
      createdAt: D("2026-03-01T00:00:00Z"),
    });
    await db
      .update(schema.users)
      .set({ pdfAddress: "BT-ADR" })
      .where(eq(schema.users.id, owner.id));

    expect((await getBranding(t.id)).address).toBe("BT-ADR");
  });
});
