# Datenschutz-Audit Signflow — 2026-07-16 (intern)

Selbst-Audit aus DSB-Perspektive („Datenschutzbeauftragter mit IT-Kenntnis").
Vollständige PII-Kartierung des Codes (Schema, externe Übermittlungen, Cookies/
Browser-Storage, Retention, Zugriffsschutz, Logging) + Abgleich mit der
öffentlichen Datenschutzerklärung. **Kein Ersatz für die externe DSGVO-Beratung**
— dieses Dokument ist deren Arbeitsgrundlage.

## A. Befunde nach Priorität

### 🔴 P1 — zeitnah beheben

1. **Support-Chat sendet ungefilterten Text an Azure OpenAI.**
   `src/lib/support/azure-chat.ts` schickt Coach-Chatverläufe OHNE
   vorgeschaltete Anonymisierung an Azure — im Widerspruch zum Checker-Design
   (IONOS-Anonymizer davor). Tippt ein Coach Teilnehmernamen/Kunden-Nr. ein,
   gehen sie im Klartext raus. Zusätzlich eskaliert `src/lib/support/notify.ts`
   den kompletten Transcript per Resend-Mail.
   **Empfehlung:** Anonymizer-Pass auch für den Support-Chat, mindestens aber
   deutlicher UI-Hinweis „keine Klarnamen" + PII-Regex-Filter. Verarbeitung ist
   jetzt in der Datenschutzerklärung offengelegt (Azure-Zweck erweitert).

2. **Alt-Bestand Signaturbilder liegt auf öffentlichen URLs.**
   Neue Uploads gehen nach Cloudflare R2 (privater EU-Bucket, signierte URLs,
   24 h TTL) — der Bestand aus der Vercel-Blob-Zeit ist weiterhin
   `access: "public"` (Schutz nur durch nicht erratbare Random-Suffix-URLs).
   Das in `storage.ts` referenzierte Migrationsskript
   (`scripts/migrate-blobs-to-r2.mjs`) existiert inzwischen (Dry-Run-Default,
   Refuse-Guards, idempotent; Runbook im Skript-Header). Staging-Dry-Run
   verifiziert. **Blocker für den Execute-Lauf:** die `R2_*`-Env-Vars sind in
   Vercel als „Sensitive" markiert und lassen sich nicht pullen — die Creds
   müssen manuell bereitgestellt werden (Cloudflare-Dashboard bzw. Ablage,
   siehe `scripts/test-r2-upload.mjs`).
   **Empfehlung:** Skript auf Staging mit `--execute` durchspielen, dann
   Prod-Lauf (nach Backup) inkl. `--delete-blobs`, danach Blob-Store leeren.

3. **Retention ist textlich versprochen, aber technisch nicht umgesetzt.**
   Kein Cron, keine Löschroutinen: abgelaufene `participant_access_tokens`
   bleiben unbegrenzt liegen; `audit_log` wächst unbegrenzt (Erklärung nannte
   „in der Regel 12 Monate" — nicht implementiert, Text jetzt korrigiert);
   verwaiste Storage-Blobs ohne Cleanup.
   **Empfehlung:** Vercel-Cron einführen: (a) Token-Rows >30 Tage nach Ablauf
   löschen, (b) Audit-Log-Policy festlegen (signaturbezogene Events = wie
   Nachweise aufbewahren, Rest z.B. 12 Monate) + umsetzen.
   **✅ Behoben (2026-07-17):** täglicher Vercel-Cron (`vercel.json` →
   `/api/cron/cleanup`, `CRON_SECRET`-geschützt) löscht Token-Rows 30 Tage
   nach `expires_at` sowie nicht-signaturbezogene `audit_log`-Einträge nach
   12 Monaten. Abgrenzung der signaturbezogenen Actions (Allowlist +
   Compile-Time-Vollständigkeitscheck): `src/lib/retention.ts`. §7 der
   Datenschutzerklärung entsprechend konkretisiert. Restpunkt „verwaiste
   Storage-Blobs" bleibt offen (hängt an der Blob→R2-Migration, P1-2).

### 🟡 P2 — mittelfristig

4. **`participants` haben kein Löschkonzept.** Keine `deleted_at`-Spalte, kein
   Lösch-Flow; Löschung nur via Hard-Delete/Cascade durch Entwickler. Für
   Art.-17-Anfragen (Recht auf Löschung) fehlt ein definierter Prozess — auch
   im Konflikt mit der 10-Jahres-Aufbewahrung der Nachweise (Löschung vs.
   Einschränkung der Verarbeitung sauber trennen).

5. **Checker-Entwürfe liegen un-anonymisiert im Browser-localStorage** (Klartext
   Namen/Kunden-Nr., ohne Verfallsdatum; Schnell-Check, BT-Checker, BER-Editor).
   Auf geteilten Rechnern ein Restrisiko. **Empfehlung:** TTL (z.B. 30 Tage)
   beim Laden prüfen + verwerfen; UI-Hinweis existiert bereits teilweise.

6. **IP-Adressen im gerenderten Nachweis-PDF** (Audit-Trail auf dem
   Stundennachweis). Bewusste Design-Entscheidung zur Beweissicherung der
   einfachen Signatur — vertretbar, aber der DSGVO-Beratung zur Bestätigung
   vorlegen (Erforderlichkeit/Verhältnismäßigkeit, Art. 5 Abs. 1 lit. c).

7. **Kein Idle-Timeout** (nur 12h-Hard-Cap + stündlicher Refresh). Für
   Sozialdaten-Kontext okay, aber Auto-Logout bei Inaktivität wäre besser.

### 🟢 P3 — Beobachten / kleinere Punkte

8. `src/lib/fes.ts:67` loggt den Kurstitel — seit Titel=Maßnahmentyp unkritisch,
   bei Freitext-Rückkehr PII-Risiko. Log auf Kurs-ID umstellen, wenn berührt.
9. Dev-Fallback-Logs (E-Mail-Body inkl. Magic-Link, SMS inkl. Nummer) sind in
   Production hart geblockt — so lassen, Guard nicht aufweichen.
10. Bedarfsträger-Kontaktdaten (`kontakt_person`) sind PII von Behörden-
    Mitarbeitenden — in der Erklärung unter Stammdaten subsumierbar, niedrig.

## B. Was positiv auffällt (beibehalten)

- **Anonymisierungs-Pipeline des Checkers** (Browser → IONOS DE → erst dann
  Azure EU), fail-closed in Production, Reverse-Mapping nur im Browser.
- **Magic-Link-Design**: 32-Byte-Zufall, nur SHA-256-Hash in der DB, kurs- und
  personengebunden, 7-Tage-TTL, aktive Bestätigung + Audit.
- **Analytics privacy-first**: selbst gehostet, cookielos, kein Laden auf
  `/sign/<token>`-Seiten (Token-Leak-Schutz), Suchstrings nie übertragen (nur
  Länge). PR #135.
- **Session-Härtung**: 12h-Hard-Cap statt 7-Tage-Rolling, Login-Rate-Limits,
  Impersonation mit Schreib-Block + Doppel-Logging.
- **Storage-Neuausrichtung**: R2 privat + signierte URLs; Prod wirft hart,
  statt still auf Public-Blob zurückzufallen (PR #134).
- **Cookie-Minimalismus**: genau 1 technisch notwendiger Cookie, kein Banner
  nötig, sauber begründet (§ 25 Abs. 2 Nr. 2 TTDSG).

## C. Korrekturen an den Rechtstexten (mit diesem Audit umgesetzt)

1. **§5.2 Checker**: Behauptung „harter Freigabe-Gate / eingereichte Berichte
   ohne besondere Kategorien" entfernt — seit dem Zwei-Kategorien-Umbau sind
   Sensibel-Funde mit dokumentierter Fehlalarm-Begründung überschreibbar
   (BT sieht die Begründung). Text beschreibt jetzt den echten Mechanismus.
2. **Azure-Zweck erweitert**: Support-Assistent (Chat-Eingaben) offengelegt.
3. **Cloudflare-Zweck**: „gesiegelte PDFs" → „finale PDF-Nachweise"
   (Bridge-Modus, kein Siegel); Hinweis auf laufende Bestands-Migration.
4. **Neu: Abschnitt Reichweitenmessung + Bot-Schutz** (selbst gehostetes,
   cookieloses Analytics; Cloudflare Turnstile auf /register + Warteliste mit
   IP-Übermittlung an Cloudflare, Art. 6 Abs. 1 lit. f).
5. **§7 Audit-Log**: „12 Monate"-Behauptung ersetzt durch ehrliche Regelung
   (signaturbezogen = wie Nachweise; Rest: Löschroutine als Platzhalter, bis
   technisch umgesetzt).
6. **Cookie-Seite**: „keine Analyse-Dienste" präzisiert (cookielose eigene
   Reichweitenmessung; Turnstile ohne eigene Cookies auf unserer Domain).
7. **AVV-Liste**: Storage-Realität korrigiert — R2 ist in Production AKTIV
   (Env seit ~Mai), Cloudflare-DPA damit doch erforderlich (jetzt; nicht
   „erst bei Nutzung").

## D. Offene Punkte für die externe DSGVO-Beratung (unverändert gelb markiert)

- Joint Controllership vs. AV je Bildungsträger (Multi-Tenant) + AVV-Template
  innosee ↔ Bildungsträger.
- Benennungspflicht DSB (Art.-9-Berührung durch Checker).
- Art.-9-Rechtsgrundlagen-Formulierung §5.3 bestätigen.
- IP im PDF-Audit-Trail absegnen (B.6).
- Aufbewahrungsfristen final festlegen (10 Jahre? je Datenart).
