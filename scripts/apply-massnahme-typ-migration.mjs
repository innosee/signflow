import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// override: false ist dotenv-Default, hier explizit — sonst überschreibt
// `.env.local` einen aus der Shell gesetzten DATABASE_URL und die Migration
// landet versehentlich auf der falschen DB (siehe Memory `project_neonctl_permission`,
// Vorfall 2026-06-05).
config({ path: ".env.local", override: false });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Transparenz, gegen welchen Endpoint die Migration läuft. Maskiert das
// Passwort, zeigt aber Host + DB-Name — so erkennt der User sofort, ob's
// Staging oder Production ist.
const dbHint = process.env.DATABASE_URL.replace(/:[^@]+@/, ":<pw>@");
console.log("DATABASE_URL =", dbHint, "\n");

if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

// Migration: massnahme_typ Enum + courses.massnahme_typ-Spalte für den
// ANW-Compliance-Check. Bestandskurse bekommen den Default `EKC` —
// User-Entscheidung am 2026-06-05: EKC ist die historisch häufigste
// Maßnahme und ihre Phasen (Standortbestimmung → Strategie → Umsetzung)
// überlappen weitgehend mit ESC, sodass ein Backfill auf EKC selbst dann
// nicht völlig daneben liegt, wenn der Kurs eigentlich ESC war. Bei EGC/
// ESCA-Kursen muss der Coach beim nächsten Bearbeiten umstellen.
//
// Idempotent, rein additiv. Kein Rollback nötig — Enum-Wert lässt sich
// später ohnehin nur additiv erweitern (Postgres-Limitation).
const statements = [
  `DO $$ BEGIN
     CREATE TYPE massnahme_typ AS ENUM ('EKC', 'ESC', 'EGC', 'ESCA');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `ALTER TABLE courses
     ADD COLUMN IF NOT EXISTS massnahme_typ massnahme_typ NOT NULL DEFAULT 'EKC'`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  console.log("\n✓ massnahme_typ-Enum + courses.massnahme_typ angelegt (default 'EKC')");
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
