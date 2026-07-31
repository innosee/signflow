-- Integrationsergebnis am Ende des TN-bezogenen Berichts (BER).
-- Ein nullable JSONB-Feld { erfolg, datum, firma } auf abschlussberichte.
-- Variante ergibt sich zur Laufzeit aus courses.massnahme_typ
-- (EKC/ESC = Vermittlung, EGC = Gründung; ESCA hat keins).
-- Additiv + idempotent, kein Backfill (NULL = noch nicht erfasst).
-- Reihenfolge Prod: erst Migration, DANN Deploy (neuer Code liest die Spalte
-- beim Rendern der Print-Seite und schreibt sie im BER-Editor).

ALTER TABLE abschlussberichte
  ADD COLUMN IF NOT EXISTS integrationsergebnis jsonb;
