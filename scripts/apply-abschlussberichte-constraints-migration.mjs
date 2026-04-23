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

// Follow-up-Migration nach CodeRabbit-Review PR #9:
// 1. composite FK (course_id, participant_id) → course_participants, damit
//    BERs nur für tatsächlich im Kurs eingeschriebene TN existieren können.
// 2. CHECK-Constraint, dass submitted-Status immer submitted_at + last_check_passed=true impliziert.
const statements = [
  `ALTER TABLE "abschlussberichte"
     ADD CONSTRAINT "abschlussberichte_course_participant_enrollment_fk"
     FOREIGN KEY ("course_id", "participant_id")
     REFERENCES "course_participants" ("course_id", "participant_id")
     ON DELETE CASCADE`,

  `ALTER TABLE "abschlussberichte"
     ADD CONSTRAINT "abschlussberichte_submit_invariants"
     CHECK (
       status = 'draft'
       OR (status = 'submitted' AND submitted_at IS NOT NULL AND last_check_passed = true)
     )`,
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
  console.log("\n✓ Constraints angewendet");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("\n✗ Migration abgebrochen, ROLLBACK durchgeführt:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
