import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// override: false — sonst überschreibt .env.local einen aus der Shell
// gesetzten DATABASE_URL und die Migration landet auf der falschen DB
// (siehe Memory project_neonctl_permission).
config({ path: ".env.local", override: false });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const dbHint = process.env.DATABASE_URL.replace(/:[^@]+@/, ":<pw>@");
console.log("DATABASE_URL =", dbHint, "\n");

if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

// Migration: tenant_memberships (Phase 0). Rein additiv + idempotent + Backfill.
const statements = [
  `CREATE TABLE IF NOT EXISTS tenant_memberships (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     role user_role NOT NULL DEFAULT 'coach',
     signing_enabled boolean NOT NULL DEFAULT false,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     deleted_at timestamptz
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_user_tenant_active_uq
     ON tenant_memberships (user_id, tenant_id)
     WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS tenant_memberships_user_idx
     ON tenant_memberships (user_id)`,
  `CREATE INDEX IF NOT EXISTS tenant_memberships_tenant_idx
     ON tenant_memberships (tenant_id)`,
  `INSERT INTO tenant_memberships (user_id, tenant_id, role, signing_enabled)
     SELECT u.id, u.tenant_id, u.role, u.signing_enabled
     FROM users u
     WHERE u.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM tenant_memberships m
         WHERE m.user_id = u.id
           AND m.tenant_id = u.tenant_id
           AND m.deleted_at IS NULL
       )`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  const [{ count }] = (
    await client.query(
      "SELECT count(*)::int AS count FROM tenant_memberships WHERE deleted_at IS NULL",
    )
  ).rows;
  console.log(`\n✓ tenant_memberships angelegt + Backfill — ${count} aktive Mitgliedschaft(en)`);
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
