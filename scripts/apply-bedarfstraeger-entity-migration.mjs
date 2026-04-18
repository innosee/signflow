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

// Bedarfsträger-Promote: Enum (JC|AA) wird zu eigener Entität mit Adresse/
// Kontakt, courses referenziert per FK. Bestehende Kurse werden gelöscht
// (Pre-Prod-Annahme — Test-Daten, keine echten Nachweise).
const statements = [
  // 1. Alle abhängigen Daten leeren (Reihenfolge wegen FKs)
  `DELETE FROM "signatures"`,
  `DELETE FROM "participant_access_tokens"`,
  `DELETE FROM "sessions"`,
  `DELETE FROM "course_participants"`,
  `DELETE FROM "final_documents"`,
  `DELETE FROM "courses"`,

  // 2. Enum umbenennen (bedarfstraeger → bedarfstraeger_type), damit der Name
  //    für die neue Tabelle frei wird. Idempotent:
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bedarfstraeger')
        AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bedarfstraeger_type')
     THEN
       ALTER TYPE "bedarfstraeger" RENAME TO "bedarfstraeger_type";
     END IF;
   END $$`,

  // 3. Neue Tabelle bedarfstraeger
  `CREATE TABLE IF NOT EXISTS "bedarfstraeger" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "name" text NOT NULL,
     "type" "bedarfstraeger_type" NOT NULL,
     "adresse" text,
     "kontakt_person" text,
     "email" text,
     "created_at" timestamp with time zone NOT NULL DEFAULT now(),
     "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
     "deleted_at" timestamp with time zone
   )`,

  // 4. courses: alte Enum-Spalte droppen, FK-Spalte anlegen.
  //    DROP IF EXISTS und ADD IF NOT EXISTS für Idempotenz.
  `ALTER TABLE "courses" DROP COLUMN IF EXISTS "bedarfstraeger"`,
  `ALTER TABLE "courses"
     ADD COLUMN IF NOT EXISTS "bedarfstraeger_id" uuid NOT NULL`,
  `ALTER TABLE "courses"
     DROP CONSTRAINT IF EXISTS "courses_bedarfstraeger_id_bedarfstraeger_id_fk"`,
  `ALTER TABLE "courses"
     ADD CONSTRAINT "courses_bedarfstraeger_id_bedarfstraeger_id_fk"
     FOREIGN KEY ("bedarfstraeger_id") REFERENCES "bedarfstraeger"("id")
     ON DELETE restrict`,
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
  console.log("\n✓ Bedarfsträger als Entität ausgerollt");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("\n✗ Migration abgebrochen, ROLLBACK durchgeführt:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
