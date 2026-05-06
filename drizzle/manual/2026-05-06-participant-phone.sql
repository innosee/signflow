-- SMS-Channel: optionale Telefonnummer pro Teilnehmer
-- Anzuwenden vor Deploy. Idempotent durch IF NOT EXISTS.
--
-- Anwenden via Neon-Konsole oder:
--   psql "$DATABASE_URL" -f drizzle/manual/2026-05-06-participant-phone.sql

BEGIN;

-- E.164-Format wird nicht im DB-Constraint erzwungen, sondern in der
-- Coach-UI/Action validiert — so bleiben Backfill-Imports und Bestand
-- unkritisch. Spalte ist nullable; NULL = nur E-Mail-Channel verfügbar.
ALTER TABLE participants ADD COLUMN IF NOT EXISTS phone text;

COMMIT;
