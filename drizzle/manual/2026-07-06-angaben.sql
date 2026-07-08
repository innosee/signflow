-- Freies Angaben-/Begründungsfeld, das der Coach jederzeit füllen kann
-- (z. B. genehmigter Urlaub des Kunden, sonstige Anmerkungen). Erscheint auf
-- dem Stundennachweis unter „Ergänzende Angaben" + im PDF. Additiv + idempotent.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS angaben_text text;
