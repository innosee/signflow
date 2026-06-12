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

const dbHint = process.env.DATABASE_URL.replace(/:[^@]+@/, ":<pw>@");
console.log("DATABASE_URL =", dbHint, "\n");

if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

// Migration: Bildungsträger-Prüfung als FES-Gate (3/3) — Enums +
// courses-Review-Felder + course_review_notes-Thread. Idempotent, rein additiv.
const statements = [
  `DO $$ BEGIN
     CREATE TYPE course_review_status AS ENUM (
       'none', 'pending', 'changes_requested', 'approved'
     );
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `DO $$ BEGIN
     CREATE TYPE course_review_note_author AS ENUM ('coach', 'bildungstraeger');
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `DO $$ BEGIN
     CREATE TYPE course_review_note_kind AS ENUM (
       'submit', 'approve', 'changes', 'comment'
     );
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `ALTER TABLE courses
     ADD COLUMN IF NOT EXISTS review_status course_review_status NOT NULL DEFAULT 'none',
     ADD COLUMN IF NOT EXISTS review_requested_at timestamptz,
     ADD COLUMN IF NOT EXISTS review_decided_at timestamptz,
     ADD COLUMN IF NOT EXISTS review_decided_by uuid REFERENCES users(id) ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS course_review_notes (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
     author_type course_review_note_author NOT NULL,
     author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
     kind course_review_note_kind NOT NULL,
     body text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS course_review_notes_course_idx
     ON course_review_notes (course_id, created_at)`,
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].trim().slice(0, 80);
    console.log("→", first);
    await client.query(stmt);
  }
  console.log("\n✓ BT-Prüfung: Enums + courses-Review-Felder + course_review_notes angelegt");
} catch (err) {
  console.error("\n✗ Migration fehlgeschlagen:");
  console.error(err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
