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

// Migration: explizites Bewilligungs-Flag `bewilligt_at`, entkoppelt vom
// `end_date`. Additiv + idempotent. Backfill: Bestandskurse mit gesetztem
// end_date (= unter alter Logik "Bewilligt") bekommen ein bewilligt_at.
const statements = [
  `ALTER TABLE courses ADD COLUMN IF NOT EXISTS bewilligt_at timestamptz`,
  `UPDATE courses
      SET bewilligt_at = COALESCE(updated_at, now())
    WHERE end_date IS NOT NULL
      AND bewilligt_at IS NULL`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  const [{ total, bewilligt, offen }] = (
    await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE bewilligt_at IS NOT NULL)::int AS bewilligt,
              count(*) FILTER (WHERE bewilligt_at IS NULL)::int     AS offen
         FROM courses
        WHERE deleted_at IS NULL`,
    )
  ).rows;
  console.log(
    `\n✓ courses.bewilligt_at angelegt + Backfill.` +
      `\n  Kurse: ${total} (${bewilligt} bewilligt, ${offen} offen)`,
  );
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
