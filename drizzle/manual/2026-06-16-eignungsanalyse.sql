-- Eignungsanalyse beim Erstgespräch: 4 Kriterien (Motivation, Bedarfe,
-- Sprachniveau, Kompetenzen) je Bewertung ++/O/--, als JSONB. Rein additiv +
-- idempotent. Alt-Erstgespräche bleiben gültig (NULL); die bestehende
-- CHECK-Constraint sessions_erstgespraech_consistency wird NICHT angefasst.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS eignungsanalyse jsonb;
