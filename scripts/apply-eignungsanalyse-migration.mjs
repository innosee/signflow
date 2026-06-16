import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// override: false — eine aus der Shell gesetzte DATABASE_URL gewinnt gegen
// .env.local (damit gezielt staging/prod migriert werden kann).
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

// Migration: sessions.eignungsanalyse (jsonb, nullable). Additiv, idempotent.
const statements = [
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS eignungsanalyse jsonb`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    console.log("→", stmt.slice(0, 80));
    await client.query(stmt);
  }
  console.log("\n✓ sessions.eignungsanalyse (jsonb) angelegt");
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
