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

// Phase B des Checker-Flows: Snapshot + Acknowledge-Felder.
// Additiv, idempotent, keine Backfills nötig (alle bestehenden BERs behalten
// einfach NULL im Snapshot — Bildungsträger sieht dann den alten Zustand).
const statements = [
  `ALTER TABLE abschlussberichte
     ADD COLUMN IF NOT EXISTS check_snapshot jsonb`,
  `ALTER TABLE abschlussberichte
     ADD COLUMN IF NOT EXISTS soft_flags_acknowledged_at timestamptz`,
  `ALTER TABLE abschlussberichte
     ADD COLUMN IF NOT EXISTS soft_flags_acknowledged_by uuid
     REFERENCES users(id) ON DELETE SET NULL`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  console.log(
    "\n✓ abschlussberichte.check_snapshot + ack-Felder hinzugefügt",
  );
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
