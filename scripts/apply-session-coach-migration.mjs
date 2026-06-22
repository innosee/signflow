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

// Migration: sessions.coach_id (Kompetenzteams, Phase 1). Additiv + idempotent
// + Backfill auf den Lead-Coach (courses.coach_id).
const statements = [
  `ALTER TABLE sessions
     ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES users(id) ON DELETE RESTRICT`,
  `CREATE INDEX IF NOT EXISTS sessions_coach_id_idx ON sessions (coach_id)`,
  `UPDATE sessions s
     SET coach_id = c.coach_id
     FROM courses c
     WHERE s.course_id = c.id
       AND s.coach_id IS NULL`,
  `ALTER TABLE signatures
     ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES users(id) ON DELETE RESTRICT`,
  `UPDATE signatures sig
     SET coach_id = c.coach_id
     FROM sessions s
     JOIN courses c ON c.id = s.course_id
     WHERE sig.session_id = s.id
       AND sig.signer_type = 'coach'
       AND sig.coach_id IS NULL`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'signatures_participant_no_coach'
     ) THEN
       ALTER TABLE signatures
         ADD CONSTRAINT signatures_participant_no_coach
         CHECK (signer_type = 'coach' OR coach_id IS NULL);
     END IF;
   END $$`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  const [{ total, unassigned }] = (
    await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE coach_id IS NULL)::int AS unassigned
       FROM sessions
       WHERE deleted_at IS NULL`,
    )
  ).rows;
  const [{ sigTotal, sigUnattributed }] = (
    await client.query(
      `SELECT count(*)::int AS "sigTotal",
              count(*) FILTER (WHERE coach_id IS NULL)::int AS "sigUnattributed"
       FROM signatures
       WHERE signer_type = 'coach'`,
    )
  ).rows;
  console.log(
    `\n✓ sessions.coach_id + signatures.coach_id angelegt + Backfill` +
      `\n  Termine: ${total} (${unassigned} ohne Coach)` +
      `\n  Coach-Signaturen: ${sigTotal} (${sigUnattributed} ohne coach_id)`,
  );
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
