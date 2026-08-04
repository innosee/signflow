-- Feature „Analoger Unterschrifts-Modus" (Papier) pro Kunde.
-- Der Bildungsträger schaltet einen Kurs auf `analog`: ANW/F08/F21 werden mit
-- leeren Unterschriftsfeldern gedruckt, händisch unterschrieben, als Scan wieder
-- hochgeladen; der Scan wird das finale PDF (AfA). Default `digital` backfillt
-- alle Bestandskurse → Verhalten unverändert.
--
-- Additiv + idempotent. Reihenfolge Prod: erst diese Migration, DANN Deploy.
-- Spiegel zu scripts/apply-analog-signing-migration.mjs.

BEGIN;

DO $$ BEGIN
  CREATE TYPE signature_mode AS ENUM ('digital', 'analog');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS signature_mode signature_mode NOT NULL DEFAULT 'digital';
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS analog_scan_url text;
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS analog_confirmed_at timestamptz;
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS analog_confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS analog_scan_url text;
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS analog_confirmed_at timestamptz;

COMMIT;
