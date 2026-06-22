-- Tenant-Mitgliedschaften: ein User kann bei mehreren Bildungsträgern arbeiten.
-- Phase 0 — rein ADDITIV + idempotent. Kein Verhalten ändert sich: das Scoping
-- läuft weiter über users.tenant_id/role. Diese Tabelle ist die Grundlage für
-- Phase 1 (aktiver Tenant). Der globale users_email_active_uq bleibt unangetastet
-- (ein Login pro Person).

-- 1. Tabelle (role nutzt das bestehende user_role-Enum).
CREATE TABLE IF NOT EXISTS tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'coach',
  signing_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- 2. Eine aktive Mitgliedschaft je (User × Tenant).
CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_user_tenant_active_uq
  ON tenant_memberships (user_id, tenant_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tenant_memberships_user_idx
  ON tenant_memberships (user_id);
CREATE INDEX IF NOT EXISTS tenant_memberships_tenant_idx
  ON tenant_memberships (tenant_id);

-- 3. Backfill: jede aktive User-Zeile bekommt genau eine Mitgliedschaft mit
--    ihrer aktuellen Rolle + signing-Flag. NOT EXISTS macht das idempotent
--    (mehrfaches Ausführen fügt nichts doppelt ein). Soft-gelöschte User
--    werden übersprungen — die sind inaktiv, ein Re-Invite legt die
--    Mitgliedschaft bei Bedarf neu an.
INSERT INTO tenant_memberships (user_id, tenant_id, role, signing_enabled)
SELECT u.id, u.tenant_id, u.role, u.signing_enabled
FROM users u
WHERE u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM tenant_memberships m
    WHERE m.user_id = u.id
      AND m.tenant_id = u.tenant_id
      AND m.deleted_at IS NULL
  );
