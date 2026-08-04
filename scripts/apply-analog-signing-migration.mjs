import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

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

// Additive, idempotente Migration für den analogen Unterschrifts-Modus
// (Feature „Analoge Unterschrift pro Kunde"). Default `digital` backfillt alle
// Bestandskurse → Verhalten unverändert. Spiegel zu
// drizzle/manual/2026-08-04-analog-signing.sql.
const statements = [
  `DO $$ BEGIN
     CREATE TYPE signature_mode AS ENUM ('digital', 'analog');
   EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `ALTER TABLE courses ADD COLUMN IF NOT EXISTS signature_mode signature_mode NOT NULL DEFAULT 'digital'`,
  `ALTER TABLE courses ADD COLUMN IF NOT EXISTS analog_scan_url text`,
  `ALTER TABLE courses ADD COLUMN IF NOT EXISTS analog_confirmed_at timestamptz`,
  `ALTER TABLE courses ADD COLUMN IF NOT EXISTS analog_confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS analog_scan_url text`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS analog_confirmed_at timestamptz`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const sql of statements) {
    console.log("→", sql.replace(/\s+/g, " ").slice(0, 90));
    await client.query(sql);
  }
  await client.query("COMMIT");

  const { rows: courseCols } = await client.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = 'courses'
       AND column_name IN ('signature_mode', 'analog_scan_url', 'analog_confirmed_at', 'analog_confirmed_by')
     ORDER BY column_name`,
  );
  const { rows: docCols } = await client.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = 'documents'
       AND column_name IN ('analog_scan_url', 'analog_confirmed_at')
     ORDER BY column_name`,
  );
  if (courseCols.length !== 4 || docCols.length !== 2) {
    throw new Error(
      `Nach Migration fehlen Spalten (courses=${courseCols.length}/4, documents=${docCols.length}/2)`,
    );
  }
  console.log("\n✓ courses:", courseCols.map((r) => `${r.column_name}(${r.data_type})`).join(", "));
  console.log("✓ documents:", docCols.map((r) => `${r.column_name}(${r.data_type})`).join(", "));
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
