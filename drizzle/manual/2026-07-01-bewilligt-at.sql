-- Feature: "Bewilligt" manuell setzen, entkoppelt vom end_date.
-- Additiv + idempotent. Backfill: Bestandskurse mit gesetztem end_date galten
-- unter der alten Logik (avgs-stage.ts: end_date IS NOT NULL => "Bewilligt") als
-- bewilligt. Damit nichts zurückspringt, bekommen genau diese ein bewilligt_at.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS bewilligt_at timestamptz;

UPDATE courses
   SET bewilligt_at = COALESCE(updated_at, now())
 WHERE end_date IS NOT NULL
   AND bewilligt_at IS NULL;
