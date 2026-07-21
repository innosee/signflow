-- Kunde-Dokumente (digitalisierte erango-Formulare, einfache Signatur)
-- Additiv + idempotent. Reihenfolge auf Prod: erst Migration, dann Deploy
-- (neuer Code liest die Tabellen/Spalten beim Rendern der Kursseite).
--
-- Enthält:
--   1. Enums document_type / document_status
--   2. participants: erweiterte Stammdatenfelder (alle nullable)
--   3. documents  (ein Dokument je Kurs×Typ, formData-Snapshot)
--   4. document_signatures (coach + participant, je Dokument genau eine)

-- 1. Enums ------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
    CREATE TYPE document_type AS ENUM ('f04_ds', 'f08_tnv', 'f21_stv');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status') THEN
    CREATE TYPE document_status AS ENUM ('draft', 'active', 'completed');
  END IF;
END $$;

-- 2. Teilnehmer-Stammdaten (Pflicht auf Dokument-Ebene, nicht in der DB) -----
ALTER TABLE participants ADD COLUMN IF NOT EXISTS vorname text;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS nachname text;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS strasse text;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS plz text;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS ort text;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS geburtsdatum date;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS geburtsort text;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS festnetz text;

-- 3. documents --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  type document_type NOT NULL,
  status document_status NOT NULL DEFAULT 'draft',
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS documents_course_idx ON documents (course_id);
CREATE INDEX IF NOT EXISTS documents_participant_idx ON documents (participant_id);

-- 4. document_signatures ----------------------------------------------------
CREATE TABLE IF NOT EXISTS document_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  signer_type signer_type NOT NULL,
  coach_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  participant_id uuid REFERENCES participants(id) ON DELETE RESTRICT,
  signature_url text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS document_signatures_doc_signer_uq
  ON document_signatures (document_id, signer_type);
CREATE INDEX IF NOT EXISTS document_signatures_document_idx
  ON document_signatures (document_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_signatures_signer_consistency'
  ) THEN
    ALTER TABLE document_signatures
      ADD CONSTRAINT document_signatures_signer_consistency
      CHECK (
        (signer_type = 'coach' AND coach_id IS NOT NULL AND participant_id IS NULL)
        OR (signer_type = 'participant' AND participant_id IS NOT NULL AND coach_id IS NULL)
      );
  END IF;
END $$;
