-- Schema-Erweiterung für Schnell-Check-Submission (Ad-hoc-BERs)
-- Anzuwenden vor Deploy auf Production. Idempotent durch IF (NOT) EXISTS-Wrapping.
--
-- Anwenden via Neon-Konsole (SQL Editor) oder:
--   psql "$DATABASE_URL" -f drizzle/manual/2026-04-28-adhoc-ber.sql

BEGIN;

-- 1. courseId / participantId nullable machen, damit Schnell-Check-Submits
-- ohne persistente Stammdaten möglich sind.
ALTER TABLE abschlussberichte ALTER COLUMN course_id DROP NOT NULL;
ALTER TABLE abschlussberichte ALTER COLUMN participant_id DROP NOT NULL;

-- 2. Denormalisierter TN-Snapshot (für Ad-hoc-BERs Pflicht, für Kurs-gebundene
-- BERs Kopie zum Submit-Zeitpunkt — ermöglicht stabile PDF-Namen + einheitliche
-- Suche im Bildungsträger-View).
ALTER TABLE abschlussberichte ADD COLUMN IF NOT EXISTS tn_vorname text NOT NULL DEFAULT '';
ALTER TABLE abschlussberichte ADD COLUMN IF NOT EXISTS tn_nachname text NOT NULL DEFAULT '';
ALTER TABLE abschlussberichte ADD COLUMN IF NOT EXISTS tn_kunden_nr text NOT NULL DEFAULT '';
ALTER TABLE abschlussberichte ADD COLUMN IF NOT EXISTS tn_avgs_nummer text NOT NULL DEFAULT '';
ALTER TABLE abschlussberichte ADD COLUMN IF NOT EXISTS tn_zeitraum text NOT NULL DEFAULT '';
ALTER TABLE abschlussberichte ADD COLUMN IF NOT EXISTS tn_ue text NOT NULL DEFAULT '';
ALTER TABLE abschlussberichte ADD COLUMN IF NOT EXISTS coach_name_snapshot text NOT NULL DEFAULT '';

-- 3. Indizes für die BT-Liste-Suche (TN-Name, Kd-Nr).
CREATE INDEX IF NOT EXISTS abschlussberichte_tn_nachname_idx ON abschlussberichte (tn_nachname);
CREATE INDEX IF NOT EXISTS abschlussberichte_tn_kunden_nr_idx ON abschlussberichte (tn_kunden_nr);

-- 4. Konsistenz-Constraints.
DO $$
BEGIN
  -- Entweder beide FKs gesetzt oder beide null — kein halb-konsistenter Zustand.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'abschlussberichte_course_participant_paired'
  ) THEN
    ALTER TABLE abschlussberichte ADD CONSTRAINT abschlussberichte_course_participant_paired CHECK (
      (course_id IS NULL AND participant_id IS NULL)
      OR (course_id IS NOT NULL AND participant_id IS NOT NULL)
    );
  END IF;

  -- Ad-hoc-BERs (kein course_id) brauchen mindestens TN-Vor- und Nachname.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'abschlussberichte_adhoc_requires_tn_snapshot'
  ) THEN
    ALTER TABLE abschlussberichte ADD CONSTRAINT abschlussberichte_adhoc_requires_tn_snapshot CHECK (
      (course_id IS NOT NULL)
      OR (length(trim(tn_vorname)) > 0 AND length(trim(tn_nachname)) > 0)
    );
  END IF;
END $$;

-- 5. Optional: Backfill der Snapshot-Spalten für bestehende Kurs-gebundene
-- BERs. Macht die Liste sofort durchsuchbar, ohne dass Coaches den Bericht
-- erst neu speichern müssen. Sicher idempotent (überschreibt nur Leereinträge).
UPDATE abschlussberichte ab
SET
  tn_vorname = COALESCE((
    SELECT split_part(p.name, ' ', 1) FROM participants p WHERE p.id = ab.participant_id
  ), ''),
  tn_nachname = COALESCE((
    SELECT
      CASE
        WHEN position(' ' IN p.name) > 0 THEN substr(p.name, position(' ' IN p.name) + 1)
        ELSE p.name
      END
    FROM participants p WHERE p.id = ab.participant_id
  ), ''),
  tn_kunden_nr = COALESCE((
    SELECT p.kunden_nr FROM participants p WHERE p.id = ab.participant_id
  ), ''),
  coach_name_snapshot = COALESCE((
    SELECT u.name FROM users u WHERE u.id = ab.coach_id
  ), '')
WHERE ab.course_id IS NOT NULL
  AND (ab.tn_vorname = '' OR ab.tn_nachname = '');

COMMIT;
