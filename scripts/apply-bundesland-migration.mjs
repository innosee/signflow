import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// override: false ist dotenv-Default, hier explizit — sonst überschreibt
// `.env.local` einen aus der Shell gesetzten DATABASE_URL und die Migration
// landet versehentlich auf der falschen DB (siehe Memory `project_neonctl_permission`).
config({ path: ".env.local", override: false });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Transparenz, gegen welchen Endpoint die Migration läuft. Maskiert das
// Passwort, zeigt aber Host + DB-Name — so erkennt man sofort, ob's Staging
// oder Production ist.
const dbHint = process.env.DATABASE_URL.replace(/:[^@]+@/, ":<pw>@");
console.log("DATABASE_URL =", dbHint, "\n");

if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

// Migration: bundesland-Enum + courses.bundesland-Spalte (NULLABLE) für die
// Feiertags-Warnung bei der Termin-Anlage. Bestandskurse bleiben NULL → keine
// Hinweise (bewusst, statt einem falschen Default). Idempotent, rein additiv.
const statements = [
  `DO $$ BEGIN
     CREATE TYPE bundesland AS ENUM (
       'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV',
       'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'
     );
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `ALTER TABLE courses
     ADD COLUMN IF NOT EXISTS bundesland bundesland`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  console.log("\n✓ bundesland-Enum + courses.bundesland angelegt (nullable)");
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
