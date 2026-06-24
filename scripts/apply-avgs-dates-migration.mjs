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

// Migration: AVGS-Datumslogik. Drei zeitlich gestaffelte Datums-Konzepte:
//  - avgs_gueltig_von/bis: Gutschein-Gültigkeit (Pflicht, bei Anlage bekannt)
//  - start_date: Startdatum (nach Erstgespräch vereinbart) → wird nullable
//  - end_date: Bewilligungsende (kommt von AA/JC) → wird nullable
// Additiv + idempotent. Bestandskurse: Gutschein-Fenster = bisheriger Zeitraum
// (beste Annahme), DANN NOT NULL auf den neuen Spalten erzwingen.
const statements = [
  `ALTER TABLE courses ADD COLUMN IF NOT EXISTS avgs_gueltig_von date`,
  `ALTER TABLE courses ADD COLUMN IF NOT EXISTS avgs_gueltig_bis date`,
  `UPDATE courses SET avgs_gueltig_von = start_date WHERE avgs_gueltig_von IS NULL`,
  `UPDATE courses SET avgs_gueltig_bis = end_date   WHERE avgs_gueltig_bis IS NULL`,
  `ALTER TABLE courses ALTER COLUMN avgs_gueltig_von SET NOT NULL`,
  `ALTER TABLE courses ALTER COLUMN avgs_gueltig_bis SET NOT NULL`,
  `ALTER TABLE courses ALTER COLUMN start_date DROP NOT NULL`,
  `ALTER TABLE courses ALTER COLUMN end_date   DROP NOT NULL`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  const [{ total, ohneStart, ohneEnd }] = (
    await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE start_date IS NULL)::int AS "ohneStart",
              count(*) FILTER (WHERE end_date IS NULL)::int   AS "ohneEnd"
       FROM courses
       WHERE deleted_at IS NULL`,
    )
  ).rows;
  console.log(
    `\n✓ courses.avgs_gueltig_von/bis angelegt + Backfill; start/end nullable` +
      `\n  Kurse: ${total} (${ohneStart} ohne Startdatum, ${ohneEnd} ohne Bewilligungsende)`,
  );
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
