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

// Migration: Abschlussberichte (BER) auf Bildungsträger-Ebene.
// - ber_status Enum: draft | submitted
// - abschlussberichte Tabelle: 1 BER pro (course, participant), geschrieben vom zuständigen Coach
const statements = [
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ber_status') THEN
       CREATE TYPE "ber_status" AS ENUM ('draft', 'submitted');
     END IF;
   END $$`,

  `CREATE TABLE IF NOT EXISTS "abschlussberichte" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "course_id" uuid NOT NULL
       REFERENCES "courses"("id") ON DELETE CASCADE,
     "participant_id" uuid NOT NULL
       REFERENCES "participants"("id") ON DELETE RESTRICT,
     "coach_id" uuid NOT NULL
       REFERENCES "users"("id") ON DELETE RESTRICT,
     "teilnahme" text NOT NULL DEFAULT '',
     "ablauf" text NOT NULL DEFAULT '',
     "fazit" text NOT NULL DEFAULT '',
     "status" ber_status NOT NULL DEFAULT 'draft',
     "last_check_passed" boolean NOT NULL DEFAULT false,
     "submitted_at" timestamp with time zone,
     "created_at" timestamp with time zone NOT NULL DEFAULT now(),
     "updated_at" timestamp with time zone NOT NULL DEFAULT now()
   )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "abschlussberichte_course_participant_uq"
     ON "abschlussberichte" ("course_id", "participant_id")`,

  `CREATE INDEX IF NOT EXISTS "abschlussberichte_course_idx"
     ON "abschlussberichte" ("course_id")`,

  `CREATE INDEX IF NOT EXISTS "abschlussberichte_coach_idx"
     ON "abschlussberichte" ("coach_id")`,

  `CREATE INDEX IF NOT EXISTS "abschlussberichte_status_idx"
     ON "abschlussberichte" ("status")`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const stmt of statements) {
    console.log("→", stmt.split("\n")[0].trim().slice(0, 80));
    await client.query(stmt);
  }
  await client.query("COMMIT");
  console.log("\n✓ Abschlussberichte migration applied");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("\n✗ Migration abgebrochen, ROLLBACK durchgeführt:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
