-- Feature „Kunde-Dokumente" — Bildungsträger-Rollen-Umbau.
-- Geteilte Organisations-Unterschrift des Bildungsträgers (EINE pro Tenant).
-- Additiv + idempotent. Kein Backfill nötig — NULL = „noch nicht gesetzt".
-- Reihenfolge Prod: erst diese Migration, DANN Deploy (neuer Code liest die
-- Spalte auf der BT-Signatur- und BT-Dokument-Release-Seite).
-- Spiegel zu scripts/apply-tenant-signature-migration.mjs.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS signature_url text;
