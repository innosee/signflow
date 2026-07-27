-- Kunde-Dokumente: 4. Variante „TNV + DS kombiniert" (document_type-Wert).
-- Additiv + idempotent. ALTER TYPE ... ADD VALUE läuft NICHT in einer
-- Transaction — daher einzeln ausführen.
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'tnv_ds_merge';
