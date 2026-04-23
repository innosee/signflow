import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

// Migration: interne Rolle "agency" → "bildungstraeger" umbenennen.
// Betroffen: zwei Enums — user_role (users.role) und audit_actor_type
// (audit_log.actor_type). PG ≥10 erlaubt direkten Rename.
//
// Postgres erlaubt `ALTER TYPE ... RENAME VALUE` ausschließlich außerhalb
// einer Transaction — deswegen ohne BEGIN/COMMIT, Idempotenz per
// IF-Exists-Check.
const statements = [
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = 'user_role' AND e.enumlabel = 'agency'
     ) THEN
       EXECUTE 'ALTER TYPE user_role RENAME VALUE ''agency'' TO ''bildungstraeger''';
     END IF;
   END $$`,

  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = 'audit_actor_type' AND e.enumlabel = 'agency'
     ) THEN
       EXECUTE 'ALTER TYPE audit_actor_type RENAME VALUE ''agency'' TO ''bildungstraeger''';
     END IF;
   END $$`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  console.log("\n✓ Enum-Rename angewendet (user_role + audit_actor_type)");
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
