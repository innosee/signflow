# AVV-Status (Auftragsverarbeitungsverträge)

Interne Tracking-Liste über den Stand der AVVs nach Art. 28 DSGVO für alle
Auftragsverarbeiter, die im Signflow-Betrieb personenbezogene Daten im
Auftrag der innosee GmbH (bzw. der jeweiligen Bildungsträger) verarbeiten.

**Diese Datei ist NICHT öffentlich.** Sie wandert ggf. in einen privaten
Doku-Bereich, wenn das Repo später öffentlich wird. Bis dahin liegt sie
hier, weil sie sich gut neben Code + Datenschutzerklärung pflegen lässt.

## Status-Legende

- ✅ **Signiert** — Vertrag unterschrieben, Kopie in den Unterlagen
- 🟡 **Online-AVV ausreichend** — Provider stellt AVV digital bereit
  und Akzeptanz im Account erfolgt (üblich bei US-SaaS mit EU-SCCs)
- 📋 **Vorbereitet** — AVV-Text vorhanden, noch nicht final unterschrieben
- ❌ **Offen** — noch zu beschaffen / zu unterzeichnen
- ⚪ **Nicht erforderlich** — kein AV-Verhältnis (z.B. Zertifikats-
  Aussteller, der keine Nutzungsdaten sieht)

## Provider-Liste

### Signatur-Modul

| Provider | Rolle | Region | Status | Anmerkung |
|---|---|---|---|---|
| **Vercel Inc.** | Hosting | EU (Frankfurt) + US (Sitz) | ❌ Offen | Online-DPA über Vercel-Dashboard akzeptieren; SCCs für US-Sitz prüfen |
| **Neon Inc.** | Datenbank-Hosting | EU (AWS Frankfurt) + US (Sitz) | ❌ Offen | Online-DPA über Neon-Konsole; SCCs für US-Sitz prüfen |
| **Cloudflare, Inc.** | Objekt-Storage (R2) | EU-Jurisdiction + US (Sitz) | ❌ Offen | Cloudflare DPA online verfügbar; SCCs prüfen |
| **Resend Inc.** | Transaktions-E-Mails | EU + US (Sitz) | ❌ Offen | Online-DPA über Resend-Dashboard |
| **Sieben Communications GmbH (seven.io / sms77)** | SMS-Versand | Deutschland | ✅ Signiert (2026-06-05) | Online-Signatur via dashboard.seven.io → Settings → Legal. PDF im seven.io-Kundenkonto dauerhaft abrufbar. ISO 27001 zertifiziertes RZ in Köln, keine SCCs nötig. |
| **D-Trust GmbH (Bundesdruckerei)** | FES-Zertifikats-Aussteller (geplant) | Deutschland | ⚪ Nicht erforderlich | D-Trust sieht weder PDFs noch deren Inhalte. Reines Cert-Issuance-Verhältnis, AV nach Art. 28 nicht einschlägig. Doku-Hinweis statt AVV in Datenschutzerklärung §4.4. |

### Abschlussbericht-Checker

| Provider | Rolle | Region | Status | Anmerkung |
|---|---|---|---|---|
| **IONOS SE** | Compute-VM + AI Model Hub (Anonymisierung) | Deutschland | ❌ Offen | AVV liegt bei IONOS standardmäßig vor; im Kunden-Portal akzeptieren |
| **Microsoft Ireland Operations Ltd. (Azure OpenAI)** | Regelprüfung auf anonymisiertem Text | EU (Sweden Central / Germany West Central) + US (MS Corp) | ❌ Offen | Microsoft Products and Services DPA + EU Standard Contractual Clauses |

### Sonstige (Operations / Tooling)

| Provider | Rolle | Region | Status | Anmerkung |
|---|---|---|---|---|
| **GitHub, Inc.** | Source-Hosting (kein Production-Datenverkehr) | US | ⚪ Nicht erforderlich | Quellcode + Issues — keine TN-/Coach-Daten. AVV nur relevant wenn produktive Logs/Daten dort landen würden, was nicht der Fall ist. |

## Nächste Schritte

1. **Vercel + Neon + Cloudflare + Resend** Online-DPAs akzeptieren —
   alle vier haben dafür ein Self-Service-Verfahren in den jeweiligen
   Dashboards. Sammelvorgang, kalkuliere ~30 Minuten.
2. **IONOS + Azure**: AVV-Status bei IONOS prüfen (Kunden-Portal),
   Microsoft-DPA über Azure-Subscription akzeptieren.
3. **Sammlung ablegen** — empfohlen: ein einziger Doku-Vault (z.B.
   Vercel-Drive, oder ein privates Repo `innosee/compliance` mit
   Subordnern pro Provider) mit den signierten PDF-Kopien.

## Verbindung zur Datenschutzerklärung

Die öffentliche Datenschutzerklärung (`app/(legal)/datenschutz/page.tsx`)
listet alle aktiven Auftragsverarbeiter in Abschnitt 6. Beim Hinzufügen
eines neuen Providers gilt: erst hier dokumentieren + AVV einholen,
DANN in die Datenschutzerklärung aufnehmen — sonst stehen Provider in
der Erklärung, mit denen formal noch kein AV-Verhältnis besteht.
