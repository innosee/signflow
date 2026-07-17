# AVV-Status (Auftragsverarbeitungsverträge)

Interne Tracking-Liste über den Stand der AVVs nach Art. 28 DSGVO für alle
Auftragsverarbeiter, die im Signflow-Betrieb personenbezogene Daten im
Auftrag der innosee GmbH (bzw. der jeweiligen Bildungsträger) verarbeiten.

**Zuletzt geprüft: 2026-07-16.**
- **Vercel (Hosting + Blob)** und **Resend**: DPA gilt automatisch über die
  Nutzungsbedingungen (SCCs enthalten), keine Unterschrift nötig → erledigt.
- **Neon**: Legal-URL nach neon.tech→neon.com-Umzug 404, Mechanismus offen → prüfen/anfragen.
- **Azure/Microsoft**: DPA gilt automatisch über die Product Terms (SCCs enthalten) → erledigt, nur PDF ablegen.
- **IONOS (Cloud-Konto!)**: AVV per AGB eingebunden; Nachweis (PDF + Support-Bestätigung) ausstehend — siehe Provider-Zeile.
- **seven.io**: signiert (05.06.).
- Storage-Realität korrigiert (Vercel Blob aktiv, R2 aktuell nicht genutzt).
- FES/PSW: gesondert klären, sobald `FES_MODE=live` (Bridge-Modus → kein
  Datenfluss zu D-Trust/PSW).

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
| **Vercel Inc.** | Hosting | EU (Frankfurt) + US (Sitz) | 🟡 Online-AVV, in Kraft | **Geprüft 2026-07-16:** DPA (vercel.com/legal/dpa) ist automatisch über die Nutzungsbedingungen bindend, keine separate Unterschrift. EU SCCs (2021, Schedule 3) enthalten. To-do: DPA-PDF ablegen + Subprozessoren-Liste security.vercel.com im Blick behalten. |
| **Neon Inc.** | Datenbank-Hosting | EU (AWS Frankfurt) + US (Sitz) | 📋 Zu prüfen | **2026-07-16:** Legal-URL nach Umzug neon.tech→neon.com aktuell 404 (Databricks-Übernahme), Mechanismus nicht verifizierbar. To-do: in der Neon-Console (Org-Settings) nach DPA suchen oder per Support anfragen; SCCs bestätigen. |
| **Cloudflare, Inc. (R2 + Turnstile)** | Objekt-Storage (privater EU-Bucket, signierte URLs) + Bot-Schutz auf /register + Warteliste | EU-Jurisdiction + US (Sitz) | ❌ Offen — DPA nötig | **KORREKTUR 2026-07-16 (Audit):** R2 ist in Production AKTIV (R2-Env-Vars seit ~Mai in Prod, `selectStorageProvider` wählt R2). Cloudflare-DPA (`cloudflare.com/cloudflare-customer-dpa`, in die Terms eingebunden — verifizieren + PDF ablegen) ist damit JETZT erforderlich, nicht „erst bei Nutzung". |
| **Vercel Inc. (Blob)** | Objekt-Storage NUR für Alt-Bestand (Migration nach R2 ausstehend) | EU + US (Sitz) | 🟡 Über Vercel-DPA gedeckt | Bestands-Dateien aus der Zeit vor R2 liegen noch auf public Vercel-Blob-URLs (Random-Suffix). To-do: Migrationsskript bauen + Bestand nach R2 überführen (Audit-Befund P1-2). |
| **Resend Inc.** | Transaktions-E-Mails | EU + US (Sitz) | 🟡 Online-AVV, in Kraft | **Geprüft 2026-07-16:** DPA (resend.com/legal/dpa) ist automatisch über die Nutzungsbedingungen bindend, keine separate Unterschrift. EU SCCs (Section 6) enthalten. Ausgeführte Version jederzeit im Resend-Dashboard abrufbar. |
| **Sieben Communications GmbH (seven.io / sms77)** | SMS-Versand | Deutschland | ✅ Signiert (2026-06-05) | Online-Signatur via dashboard.seven.io → Settings → Legal. PDF im seven.io-Kundenkonto dauerhaft abrufbar. ISO 27001 zertifiziertes RZ in Köln, keine SCCs nötig. |
| **D-Trust GmbH (Bundesdruckerei)** | FES-Zertifikats-Aussteller (geplant) | Deutschland | ⚪ Nicht erforderlich | D-Trust sieht weder PDFs noch deren Inhalte. Reines Cert-Issuance-Verhältnis, AV nach Art. 28 nicht einschlägig. Doku-Hinweis statt AVV in Datenschutzerklärung §4.4. |

### Abschlussbericht-Checker

| Provider | Rolle | Region | Status | Anmerkung |
|---|---|---|---|---|
| **IONOS SE** | Compute-VM + AI Model Hub (Anonymisierung) | Deutschland | 📋 Per AGB eingebunden — Nachweis ausstehend | **Korrektur 2026-07-16: Wir haben ein reines IONOS-Cloud-Konto** (DCD), NICHT das klassische Mein-IONOS — dort gibt es die „AVV abschließen"-Kachel nicht. Bei IONOS Cloud ist die AVV per Verweis in die AGB Teil des Vertrags (IONOS als Auftragsverarbeiter „auf Weisung des Kunden"). **Nachweis-Weg:** (1) AVV-PDF von `ionos.de/terms-gtc/avv` + Cloud-Security-Doku von `cloud.ionos.com/protection` herunterladen und in die DSGVO-Akte legen; (2) beim IONOS-Cloud-Support schriftliche Bestätigung einholen, dass die AVV nach Art. 28 DSGVO unter unserer Cloud-Vertragsnummer in Kraft ist und die genutzten Produkte (Compute-VM/Anonymizer, AI Model Hub) abdeckt — idealerweise gegengezeichnete Ausfertigung. Formulierungsvorschlag: „Bitte bestätigen Sie den Abschluss/die Geltung der Auftragsverarbeitungsvereinbarung nach Art. 28 DSGVO für Vertrag <Nr.> und nennen Sie die abgedeckten Produkte; idealerweise als gegengezeichnete Ausfertigung." **Relevanz:** Diese VM ist der Anonymizer-Proxy, über den die PII läuft, bevor sie zu Azure geht — die AVV trägt die gesamte Checker-Datenschutz-Architektur. |
| **Microsoft Ireland Operations Ltd. (Azure OpenAI)** | Regelprüfung auf anonymisiertem Text | EU (Sweden Central / Germany West Central) + US (MS Corp) | 🟡 Über Product Terms in Kraft | **Geprüft 2026-07-16:** Der „Microsoft Products and Services DPA" gilt **automatisch** über die Product Terms mit dem Azure-Abo, keine separate Unterschrift. EU SCCs enthalten. To-do: aktuelle Version bei **microsoft.com/licensing/docs** herunterladen + für die Akte ablegen. |

### Sonstige (Operations / Tooling)

| Provider | Rolle | Region | Status | Anmerkung |
|---|---|---|---|---|
| **GitHub, Inc.** | Source-Hosting (kein Production-Datenverkehr) | US | ⚪ Nicht erforderlich | Quellcode + Issues — keine TN-/Coach-Daten. AVV nur relevant wenn produktive Logs/Daten dort landen würden, was nicht der Fall ist. |

## Nächste Schritte (Stand 2026-07-16)

**Erledigt (gilt automatisch über die Terms, SCCs enthalten, nur PDF ablegen):**
Vercel (+ Blob), Resend, Azure/Microsoft.

**Noch aktiv zu erledigen:**
1. **IONOS (Cloud-Konto)** — kein UI-Klick möglich: AVV-PDF von
   `ionos.de/terms-gtc/avv` + Doku von `cloud.ionos.com/protection` sichern und
   beim Cloud-Support die schriftliche Geltungs-Bestätigung für unsere
   Cloud-Vertragsnummer einholen (Details + Formulierung in der Provider-Zeile).
2. **Neon** — DPA-Mechanismus verifizieren: in der Neon-Console (Org-Settings)
   nach der DPA suchen oder per Support anfragen (Legal-URL aktuell 404).

3. **Cloudflare** — DPA verifizieren + PDF ablegen (R2 ist in Prod aktiv,
   dazu Turnstile auf /register; DPA unter `cloudflare.com/cloudflare-customer-dpa`,
   in die Terms eingebunden — analog Vercel/Resend vermutlich ohne Unterschrift).

**Sammlung ablegen** — ein privater Doku-Vault (empfohlen: Repo
`innosee/compliance`, Subordner pro Provider) mit den DPA-/AVV-Kopien.

**Nicht jetzt:**
- **Cloudflare R2** — erst wenn produktiv genutzt (aktuell Vercel Blob).
- **FES via PSW Group / D-Trust** — erst mit `FES_MODE=live`. Im Bridge-Modus
  ist FES gemockt, es fließen keine Daten zu PSW/D-Trust. Beim Live-Schalten:
  klären, ob PSW als reiner Zertifikats-/Siegel-Lieferant überhaupt ein
  AV-Verhältnis begründet (self-hosted PAdES → PDF verlässt die Infra nie).

## Verbindung zur Datenschutzerklärung

Die öffentliche Datenschutzerklärung (`app/(legal)/datenschutz/page.tsx`)
listet alle aktiven Auftragsverarbeiter in Abschnitt 6. Beim Hinzufügen
eines neuen Providers gilt: erst hier dokumentieren + AVV einholen,
DANN in die Datenschutzerklärung aufnehmen — sonst stehen Provider in
der Erklärung, mit denen formal noch kein AV-Verhältnis besteht.
