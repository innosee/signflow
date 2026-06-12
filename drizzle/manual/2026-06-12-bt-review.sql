-- Bildungsträger-Prüfung als FES-Gate (3/3). Der BT muss jede vom Kunden
-- freigegebene Anwesenheitsliste prüfen, bevor der Coach mit FES siegeln darf.
-- Rein additiv + idempotent. Bestandskurse bekommen review_status = 'none'
-- (Default) und durchlaufen die Prüfung beim nächsten Abschluss ganz normal.

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE course_review_status AS ENUM (
    'none', 'pending', 'changes_requested', 'approved'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE course_review_note_author AS ENUM ('coach', 'bildungstraeger');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE course_review_note_kind AS ENUM (
    'submit', 'approve', 'changes', 'comment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. courses: Review-Status-Felder
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS review_status course_review_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS review_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_decided_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- 3. Notiz-Thread der Prüfung
CREATE TABLE IF NOT EXISTS course_review_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_type course_review_note_author NOT NULL,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind course_review_note_kind NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_review_notes_course_idx
  ON course_review_notes (course_id, created_at);
