-- Bundesland des Kunden für die Feiertags-Warnung bei der Termin-Anlage.
-- Rein additiv + idempotent. Spalte ist NULLABLE (kein Default): Bestandskurse
-- ohne Bundesland bekommen schlicht keine Feiertags-Hinweise — ein geratener
-- Default würde flächendeckend falsche Warnungen erzeugen. Neue Kunden setzen
-- das Feld im BT-Anlageformular als Pflicht.
DO $$ BEGIN
  CREATE TYPE bundesland AS ENUM (
    'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV',
    'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS bundesland bundesland;
