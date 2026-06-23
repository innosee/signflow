-- Kompetenzteam pro Maßnahme (BT-definiert) — Phase „BT-Team".
-- Rein ADDITIV + idempotent. Backfill: jeder Bestandskurs bekommt seinen
-- bisherigen courses.coach_id als (einziges) Team-Mitglied — damit ändert sich
-- für Single-Coach-Kurse nichts.

-- 1. Team-Tabelle.
CREATE TABLE IF NOT EXISTS course_coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Eine Coach-Zuordnung je (Kurs × Coach) + Lookup-Indizes.
CREATE UNIQUE INDEX IF NOT EXISTS course_coaches_course_coach_uq
  ON course_coaches (course_id, coach_id);
CREATE INDEX IF NOT EXISTS course_coaches_course_idx ON course_coaches (course_id);
CREATE INDEX IF NOT EXISTS course_coaches_coach_idx ON course_coaches (coach_id);

-- 3. Backfill: bisheriger Einzel-Coach wird Team-Mitglied. Idempotent über
--    NOT EXISTS. Nur nicht-gelöschte Kurse.
INSERT INTO course_coaches (course_id, coach_id)
SELECT c.id, c.coach_id
FROM courses c
WHERE c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM course_coaches cc
    WHERE cc.course_id = c.id AND cc.coach_id = c.coach_id
  );
