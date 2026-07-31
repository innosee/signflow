-- Teilnahmebescheinigung (erango F 05-x) als neuer Kunde-Dokumenttyp.
-- Coach klickt Inhalte aus dem maßnahmentyp-Katalog zusammen; die Bescheinigung
-- wird mit der erango-Org-Signatur generiert (KEINE Teilnehmer-Signatur).
-- Speicherung nutzt die bestehende documents-Tabelle (form_data JSONB); nur ein
-- neuer document_type-Enum-Wert ist nötig.
--
-- Additiv + idempotent. ALTER TYPE ... ADD VALUE läuft NICHT in einer
-- Transaction — daher einzeln ausführen. Reihenfolge Prod: erst Migration,
-- dann Deploy (neuer Code liest/schreibt den Wert).

ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'tnb_cert';
