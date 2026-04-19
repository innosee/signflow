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

// Migration: Preview/Freigabe + FES-Seal + AfA-Submission + Audit-Log.
// - participant_approvals: finale TN-Freigabe nach Preview (ohne FES).
// - audit_log: generisches Log für Impersonation / Approval / Seal / Submit.
// - final_documents: sealed_by, afa_status, submitted_to_afa_at, submitted_by.
const statements = [
  // 1. Neue Enums
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'afa_submission_status') THEN
       CREATE TYPE "afa_submission_status" AS ENUM ('pending', 'submitted');
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_actor_type') THEN
       CREATE TYPE "audit_actor_type" AS ENUM ('agency', 'coach', 'participant', 'system');
     END IF;
   END $$`,

  // 2. final_documents um FES-/AfA-Felder erweitern
  `ALTER TABLE "final_documents"
     ADD COLUMN IF NOT EXISTS "sealed_by" uuid
       REFERENCES "users"("id") ON DELETE RESTRICT`,

  `ALTER TABLE "final_documents"
     ADD COLUMN IF NOT EXISTS "afa_status" afa_submission_status
       NOT NULL DEFAULT 'pending'`,

  `ALTER TABLE "final_documents"
     ADD COLUMN IF NOT EXISTS "submitted_to_afa_at" timestamp with time zone`,

  `ALTER TABLE "final_documents"
     ADD COLUMN IF NOT EXISTS "submitted_by" uuid
       REFERENCES "users"("id") ON DELETE RESTRICT`,

  // 3. participant_approvals
  `CREATE TABLE IF NOT EXISTS "participant_approvals" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "course_id" uuid NOT NULL
       REFERENCES "courses"("id") ON DELETE CASCADE,
     "participant_id" uuid NOT NULL
       REFERENCES "participants"("id") ON DELETE RESTRICT,
     "approved_at" timestamp with time zone NOT NULL DEFAULT now(),
     "ip_address" text NOT NULL,
     "user_agent" text
   )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "participant_approvals_course_participant_uq"
     ON "participant_approvals" ("course_id", "participant_id")`,

  `CREATE INDEX IF NOT EXISTS "participant_approvals_course_idx"
     ON "participant_approvals" ("course_id")`,

  // 4. audit_log — Actor-ID bewusst ohne FK (polymorph: users ODER participants).
  `CREATE TABLE IF NOT EXISTS "audit_log" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "actor_type" audit_actor_type NOT NULL,
     "actor_id" uuid,
     "impersonator_id" uuid
       REFERENCES "users"("id") ON DELETE SET NULL,
     "action" text NOT NULL,
     "resource_type" text NOT NULL,
     "resource_id" uuid NOT NULL,
     "metadata" jsonb,
     "ip_address" text,
     "user_agent" text,
     "created_at" timestamp with time zone NOT NULL DEFAULT now()
   )`,

  `CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx"
     ON "audit_log" ("created_at" DESC)`,

  // Kein Expression-Index auf date_trunc('month', ...), weil date_trunc auf
  // timestamptz STABLE statt IMMUTABLE ist (Ergebnis hängt von session TZ
  // ab → Postgres verweigert den Index). Monatsweise Reports laufen
  // stattdessen als Range-Query ("created_at >= start AND < end") und
  // nutzen dafür audit_log_created_at_idx.
  `CREATE INDEX IF NOT EXISTS "audit_log_resource_idx"
     ON "audit_log" ("resource_type", "resource_id")`,

  `CREATE INDEX IF NOT EXISTS "audit_log_actor_idx"
     ON "audit_log" ("actor_id", "created_at")`,
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
  console.log("\n✓ Approval + FES + AfA + Audit-Log migration applied");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("\n✗ Migration abgebrochen, ROLLBACK durchgeführt:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
