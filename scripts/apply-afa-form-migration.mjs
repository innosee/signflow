import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// Tabellen leeren, weil die neuen Pflichtspalten keine sinnvollen Defaults
// für Legacy-Testdaten haben. In Pre-Prod akzeptabel.
const purge = [
  `DELETE FROM "signatures"`,
  `DELETE FROM "session_tokens"`,
  `DELETE FROM "sessions"`,
  `DELETE FROM "course_participants"`,
  `DELETE FROM "final_documents"`,
  `DELETE FROM "courses"`,
  `DELETE FROM "participants"`,
];

const statements = [
  // --- ENUMs ---
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bedarfstraeger') THEN
       CREATE TYPE "bedarfstraeger" AS ENUM ('JC', 'AA');
     END IF;
   END $$`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_modus') THEN
       CREATE TYPE "session_modus" AS ENUM ('praesenz', 'online');
     END IF;
   END $$`,

  // --- courses: AfA-Header-Felder + Footer-Begründungen ---
  `ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "avgs_nummer" text NOT NULL`,
  `ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "durchfuehrungsort" text NOT NULL`,
  `ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "anzahl_bewilligte_ue" integer NOT NULL`,
  `ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "bedarfstraeger" "bedarfstraeger" NOT NULL`,
  `ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "flag_unter_2_termine" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "flag_vorzeitiges_ende" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "begruendung_text" text`,

  // --- participants: AfA-Kunden-Nr. ---
  `ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "kunden_nr" text NOT NULL`,

  // --- sessions: UE, Modus, Erstgespräch ---
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "anzahl_ue" numeric(3, 1) NOT NULL`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "modus" "session_modus" NOT NULL`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "is_erstgespraech" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "geeignet" boolean`,

  // --- Check-Constraint: Erstgespräch ↔ UE/geeignet ---
  `ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_erstgespraech_consistency"`,
  `ALTER TABLE "sessions" ADD CONSTRAINT "sessions_erstgespraech_consistency"
     CHECK (
       (is_erstgespraech = true AND anzahl_ue = 0 AND geeignet IS NOT NULL)
       OR (is_erstgespraech = false AND anzahl_ue > 0 AND geeignet IS NULL)
     )`,
];

for (const stmt of purge) {
  console.log("⌫", stmt.slice(0, 60));
  await sql.query(stmt);
}
for (const stmt of statements) {
  console.log("→", stmt.split("\n")[0].trim().slice(0, 80));
  await sql.query(stmt);
}
console.log("\n✓ AfA-Formular-Migration angewendet");
