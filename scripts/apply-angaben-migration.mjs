import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// override: false — sonst überschreibt .env.local einen aus der Shell
// gesetzten DATABASE_URL und die Migration landet auf der falschen DB
// (siehe Memory project_neonctl_permission). Host vor dem Ausführen prüfen.
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

// Migration: freies Angaben-/Begründungsfeld `angaben_text` auf courses.
// Additiv, nullable, idempotent — kein Backfill nötig.
const statements = [
  `ALTER TABLE courses ADD COLUMN IF NOT EXISTS angaben_text text`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    console.log("→", stmt);
    await client.query(stmt);
  }
  const [{ exists }] = (
    await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_name = 'courses' AND column_name = 'angaben_text'
       ) AS exists`,
    )
  ).rows;
  console.log(
    exists
      ? `\n✓ courses.angaben_text angelegt (oder existierte bereits).`
      : `\n✗ Spalte fehlt weiterhin — bitte prüfen.`,
  );
  if (!exists) process.exit(1);
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
