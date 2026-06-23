import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// override: false — shell-gesetzter DATABASE_URL gewinnt über .env.local
// (siehe Memory project_neonctl_permission / project_launch_and_envs).
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

// Migration: course_coaches (Kompetenzteam, BT-definiert). Additiv + idempotent
// + Backfill aus courses.coach_id.
const statements = [
  `CREATE TABLE IF NOT EXISTS course_coaches (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
     coach_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS course_coaches_course_coach_uq
     ON course_coaches (course_id, coach_id)`,
  `CREATE INDEX IF NOT EXISTS course_coaches_course_idx ON course_coaches (course_id)`,
  `CREATE INDEX IF NOT EXISTS course_coaches_coach_idx ON course_coaches (coach_id)`,
  `INSERT INTO course_coaches (course_id, coach_id)
     SELECT c.id, c.coach_id
     FROM courses c
     WHERE c.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM course_coaches cc
         WHERE cc.course_id = c.id AND cc.coach_id = c.coach_id
       )`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  const [{ teams, courses }] = (
    await client.query(
      `SELECT count(*)::int AS teams,
              count(distinct course_id)::int AS courses
       FROM course_coaches`,
    )
  ).rows;
  console.log(
    `\n✓ course_coaches angelegt + Backfill — ${teams} Zuordnung(en) über ${courses} Kurs(e)`,
  );
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
