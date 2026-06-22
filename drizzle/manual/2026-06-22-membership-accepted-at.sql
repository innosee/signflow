-- Membership „Annehmen"-Flow: accepted_at auf tenant_memberships.
--
-- NULL = offene Einladung (kein Zugriff), gesetzt = angenommen (aktiv).
-- Rein additiv. Der Backfill (alle bestehenden Zeilen gelten als angenommen,
-- damit niemand ausgesperrt wird) läuft NUR beim ersten Anlegen der Spalte —
-- die Idempotenz steuert das Apply-Script über einen Spalten-Existenz-Check,
-- damit ein erneuter Lauf NICHT versehentlich offene Einladungen annimmt.

ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- Einmaliger Backfill (nur wenn die Spalte gerade neu ist — siehe Apply-Script):
-- UPDATE tenant_memberships SET accepted_at = created_at WHERE accepted_at IS NULL;
