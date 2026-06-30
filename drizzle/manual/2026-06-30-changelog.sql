-- Produkt-Changelog („Neu"-Seite, Phase 1).
-- Additiv + idempotent. Erst anwenden, DANN deployen — die Layouts lesen
-- changelog_entries + users.changelog_last_seen_at bei jedem Request.

-- Lesemarke pro User (null = noch nie geöffnet → alles ungelesen).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS changelog_last_seen_at timestamptz;

-- Globale, vom Operator verfasste Einträge (kein Tenant-/User-Bezug).
CREATE TABLE IF NOT EXISTS changelog_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  body         text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS changelog_entries_published_idx
  ON changelog_entries (published_at DESC);
