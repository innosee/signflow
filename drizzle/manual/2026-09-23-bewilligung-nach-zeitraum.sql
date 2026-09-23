-- Bewilligung nach Maßnahmenzeitraum (AA Regensburg, Feedback 09/2026).
--
-- Additiv + idempotent. Alle Defaults sind so gewählt, dass sich Bestands-
-- kurse und -Träger EXAKT wie vorher verhalten:
--   * courses.bewilligungsbasis = 'ue'            → bisheriges Verhalten
--   * tenants.bewilligung_zeitraum_enabled = false → Option bleibt unsichtbar
--
-- Reihenfolge: Migration VOR dem Deploy (der neue Code liest die Spalten).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bewilligungsbasis') THEN
    CREATE TYPE bewilligungsbasis AS ENUM ('ue', 'zeitraum');
  END IF;
END $$;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS bewilligungsbasis bewilligungsbasis NOT NULL DEFAULT 'ue';

-- Interne Mindest-UE-Vereinbarung. Bewusst NULLABLE und ohne Default: sie ist
-- keine Bewilligung, blockiert nichts und steht nie auf dem Nachweis.
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS mindest_ue integer;

-- Zertifizierte Obergrenzen je Träger (AZAV-Zulassung). Nicht im Code, weil
-- Zertifikate auslaufen und ein zweiter Träger andere Grenzen hat.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS bewilligung_zeitraum_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS zert_max_ue integer NOT NULL DEFAULT 80;
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS zert_max_wochen integer NOT NULL DEFAULT 16;
