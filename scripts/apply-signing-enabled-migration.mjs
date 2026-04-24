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

// Migration: users.signing_enabled als Feature-Flag für den Signatur-Flow.
// Rein additiv, idempotent. Default false heißt: bestehende Coaches sehen
// die Kurse/Sessions/FES-UI nach dem Deploy nicht mehr — bewusst, weil der
// Pilot-Rollout explizit 3–4 Coaches freischaltet (siehe ROADMAP.md). Um
// nach dem Deploy sofort testen zu können, entweder über die Bildungsträger-
// Admin-UI einen Coach toggeln oder per SQL:
//   UPDATE users SET signing_enabled = true WHERE email = '<coach-email>';
const statements = [
  `ALTER TABLE users
     ADD COLUMN IF NOT EXISTS signing_enabled boolean NOT NULL DEFAULT false`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  console.log("\n✓ users.signing_enabled hinzugefügt (default false)");
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
