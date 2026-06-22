-- Kompetenzteams (mehrere Coaches je Maßnahme, Variante A) — Phase 1.
-- Rein ADDITIV + idempotent. Kein Verhalten ändert sich: Bestands-Termine
-- werden auf courses.coach_id (= bisheriger Einzel-Coach = Lead) gebackfillt,
-- die App liest weiter denselben Coach pro Termin. courses.coach_id BLEIBT als
-- Lead-Coach. Die Spalte ist nullable (additiv); die Zuweisung ist app-seitig
-- Pflicht (Default = Lead).

-- 1. Spalte: Coach, der den Termin hält & signiert. restrict parallel zu
--    courses.coach_id (Coaches werden soft-deleted, nicht hart entfernt).
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES users(id) ON DELETE RESTRICT;

-- 2. Index für die Dashboard-Sichtbarkeit ("welche Termine gehören diesem Coach").
CREATE INDEX IF NOT EXISTS sessions_coach_id_idx ON sessions (coach_id);

-- 3. Backfill: jeder Bestands-Termin bekommt den Lead-Coach seines Kurses.
--    Nur dort setzen, wo noch NULL (idempotent, mehrfach ausführbar).
UPDATE sessions s
SET coach_id = c.coach_id
FROM courses c
WHERE s.course_id = c.id
  AND s.coach_id IS NULL;

-- 4. signatures.coach_id: WER hat die Coach-Signatur geleistet (durable fürs
--    Audit, unabhängig von späterer Termin-Zuweisung). Nur bei Coach-Signaturen
--    gesetzt; Teilnehmer-Signaturen lassen NULL. restrict parallel zu
--    sessions.coach_id.
ALTER TABLE signatures
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES users(id) ON DELETE RESTRICT;

-- 5. Backfill: jede Bestands-Coach-Signatur bekommt den damaligen Einzel-Coach
--    (= Lead-Coach des Kurses des Termins). Idempotent über coach_id IS NULL.
UPDATE signatures sig
SET coach_id = c.coach_id
FROM sessions s
JOIN courses c ON c.id = s.course_id
WHERE sig.session_id = s.id
  AND sig.signer_type = 'coach'
  AND sig.coach_id IS NULL;

-- 6. Consistency-Check: Teilnehmer-Signaturen tragen keinen coach_id.
--    Coach-Signaturen dürfen (vor Phase 4) noch NULL sein. ADD CONSTRAINT ist
--    nicht idempotent → DO-Block, der nur anlegt, wenn noch nicht vorhanden.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'signatures_participant_no_coach'
  ) THEN
    ALTER TABLE signatures
      ADD CONSTRAINT signatures_participant_no_coach
      CHECK (signer_type = 'coach' OR coach_id IS NULL);
  END IF;
END $$;
