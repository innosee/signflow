# Datenschutz-TODO vor Go-Live (DSGVO)

> Stand: 2026-06-29. Technische Zuarbeit, **keine Rechtsberatung** — finale Abnahme über die DSGVO-Beratung.

## Wo liegen die Daten (Ist-Stand)

**ANW (Anwesenheitsnachweise):**
- Strukturdaten (Kurse, Termine, Signatur-Metadaten, Audit-Log): **Neon Postgres** — EU, `eu-central-1`, AWS Frankfurt
- Signaturbilder (PNG) + finale PDFs: **Cloudflare R2** (`R2_JURISDICTION=eu`), Fallback **Vercel Blob**
- Compute / PDF-Rendering: **Vercel**
- Mailversand: **Resend** (EU)

**BER (Abschlussbericht-Checker):**
- Entwürfe: nur im **Browser** (localStorage), kein Transfer
- „Final prüfen": Klartext → **IONOS-VM Frankfurt** (Anonymisierung, RAM-transient)
- Regelprüfung: nur pseudonymisierter Text → **Azure OpenAI EU** (Sweden Central / Germany West Central); Mapping bleibt im Browser
- Bestandener Bericht (anonymisiert): **Neon** EU-Frankfurt

→ Alles in der EU; BER-Klartext verlässt Deutschland nie.

## Was vor Rechtssicherheit erledigt sein muss

AVVs allein reichen **nicht**. Erforderlich:

- [ ] **AVVs (Art. 28)** mit allen Auftragsverarbeitern:
  - [ ] Neon
  - [ ] Vercel
  - [ ] Cloudflare (R2)
  - [ ] IONOS
  - [ ] Microsoft Azure
  - [ ] Resend
  - [ ] Vercel Blob (nur falls noch aktiv — siehe Storage-Punkt unten)
- [ ] **Drittlandtransfer USA absichern:** Vercel + Azure sind US-Konzerne → Standardvertragsklauseln (SCC) + Prüfung Data Privacy Framework. (Azure sieht nur Pseudonyme; Vercel verarbeitet ANW-Klartext-Metadaten.)
- [ ] **Eigenes AVV Bildungsträger ↔ innosee GmbH** (innosee ist deren Auftragsverarbeiter)
- [ ] **DSFA (Art. 35)** wegen Verarbeitung im AfA-/Sozialkontext
- [ ] **Datenschutzerklärung aktualisieren** — nennt noch FES/„gesiegelte PDFs" + alte Provider; muss zu Bridge-Modus (einfache Signatur) + R2/IONOS/Azure passen
- [ ] **TOMs dokumentieren** (Verschlüsselung at-rest/transit, Zugriffskontrolle, Löschkonzept, Backup, Incident-Response)

## Offene technische Punkte mit Datenschutz-Bezug

- [ ] **R2 vs. Vercel Blob in Prod prüfen:** Code fällt auf Vercel Blob (public + random suffix) zurück, wenn `R2_ACCOUNT_ID` leer ist. Verifizieren, dass Prod auf R2 (privat, signierte URLs) läuft — sonst liegen Signaturen public erreichbar.
- [ ] **Azure-Region verifizieren:** `AZURE_OPENAI_ENDPOINT` in Prod muss wirklich auf Sweden Central / Germany West Central zeigen (keine Nicht-EU-Region).
- [ ] **FES:** am Launch gemockt/aus (Bridge-Modus) → kein externer Siegel-Dienstleister sieht Daten. Bei `FES_MODE=live`: D-Trust via PSW, self-hosted PAdES (PDF verlässt Infrastruktur nicht) — AVV/Konstellation dann nachziehen.
