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

// session_tokens (per-Session) → participant_access_tokens (per-Kurs × Teilnehmer).
// Kein Daten-Preserve: in Pre-Prod keine echten Tokens unterwegs, Refactor nur
// strukturell.
const statements = [
  // 1. Tabelle umbenennen, falls noch alter Name
  `DO $$ BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_name='session_tokens'
     ) AND NOT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_name='participant_access_tokens'
     ) THEN
       ALTER TABLE "session_tokens" RENAME TO "participant_access_tokens";
     END IF;
   END $$`,

  // 2. Inhalte leeren — Plaintext-Session-Tokens sind nicht kurs-scoped migrierbar.
  //    Jetzt nach dem Rename ausführen, damit wir immer die finale Tabelle treffen
  //    und das Script idempotent re-runbar ist.
  `DELETE FROM "participant_access_tokens"`,

  // 3. Alten session_id-FK auf sessions droppen (verhindert sauberen Rename der Spalte)
  `ALTER TABLE "participant_access_tokens"
     DROP CONSTRAINT IF EXISTS "session_tokens_session_id_sessions_id_fk"`,

  // 4. Spalte session_id → course_id umbenennen (nur falls noch session_id heißt)
  `DO $$ BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name='participant_access_tokens' AND column_name='session_id'
     ) AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name='participant_access_tokens' AND column_name='course_id'
     ) THEN
       ALTER TABLE "participant_access_tokens"
         RENAME COLUMN "session_id" TO "course_id";
     END IF;
   END $$`,

  // 5. Neuer FK auf courses
  `ALTER TABLE "participant_access_tokens"
     DROP CONSTRAINT IF EXISTS "participant_access_tokens_course_id_courses_id_fk"`,
  `ALTER TABLE "participant_access_tokens"
     ADD CONSTRAINT "participant_access_tokens_course_id_courses_id_fk"
     FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade`,

  // 6. Indizes anpassen
  `DROP INDEX IF EXISTS "session_tokens_token_uq"`,
  `DROP INDEX IF EXISTS "session_tokens_token_hash_uq"`,
  `DROP INDEX IF EXISTS "participant_access_tokens_hash_uq"`,
  `DROP INDEX IF EXISTS "participant_access_tokens_course_participant_idx"`,
  `CREATE UNIQUE INDEX "participant_access_tokens_hash_uq"
     ON "participant_access_tokens" ("token_hash")`,
  `CREATE INDEX "participant_access_tokens_course_participant_idx"
     ON "participant_access_tokens" ("course_id", "participant_id")`,

  // 7. Alten Participant-FK-Constraint-Name an neue Tabelle angleichen
  `ALTER TABLE "participant_access_tokens"
     DROP CONSTRAINT IF EXISTS "session_tokens_participant_id_participants_id_fk"`,
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name = 'participant_access_tokens_participant_id_participants_id_fk'
     ) THEN
       ALTER TABLE "participant_access_tokens"
         ADD CONSTRAINT "participant_access_tokens_participant_id_participants_id_fk"
         FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE restrict;
     END IF;
   END $$`,
];

// Alle Statements in EINER Postgres-Transaktion — halbmigrierte Zustände bei
// Abbruch werden so vermieden. Braucht eine echte WS-Connection via Pool,
// weil HTTP-Neon-Client keine Session-State kennt.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const stmt of statements) {
    console.log("→", stmt.split("\n")[0].trim().slice(0, 80));
    await client.query(stmt);
  }
  await client.query("COMMIT");
  console.log("\n✓ Course-scoped participant access tokens applied");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("\n✗ Migration abgebrochen, ROLLBACK durchgeführt:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
