# Signflow – Offene Punkte

Was nach dem Preview/FES/AfA-Build (April 2026) noch ansteht. Reihenfolge ≈ Priorität.

## Vor Production

- [ ] **Firma.dev Live-Integration** — aktuell gemockt in [src/lib/firma.ts](src/lib/firma.ts). Account anlegen → API-Key in Env → `FIRMA_DEV_MODE=live` → Real-Branch füllen (Envelope-POST + Signed-PDF-Download + Storage-Upload).
- [ ] **Final-PDF über alle Teilnehmer** — der Seal-Flow speichert aktuell nur den PDF-URL des ersten TN. Optionen: Per-TN-PDFs serverseitig konkatenieren (z. B. `pdf-lib`) oder Schema auf "ein PDF pro (Kurs × TN)" umbauen. Entscheidung sobald Firma.dev-Flow steht (eine Envelope = ein PDF).
- [ ] **Storage-Privatisierung** — Vercel Blob ist aktuell `public` mit Random-Suffix-Obfuskation. Vor Prod: auf privaten Bucket (R2/S3) mit signierten URLs migrieren. TODO steht in [src/lib/storage.ts](src/lib/storage.ts).
- [ ] **Neon DB-Passwort-Rotation** — letzter Schritt vor Prod-Cutover, siehe Memory.
- [ ] **Data-Isolation-Audit** — systematisch alle Coach-Queries durchsehen, dass `coach_id = session.user.id` serverseitig erzwungen wird. UI-Filter alleine reichen nicht.
- [ ] **Audit-Log für Impersonation start/stop** — Helper in [src/lib/audit.ts](src/lib/audit.ts) ist da, aber [app/bildungstraeger/actions.ts](app/bildungstraeger/actions.ts) (`impersonateCoach` / `stopImpersonating`) loggt noch nicht. Einbinden, sobald Real-Compliance-Anforderung greift.

## Backup & Disaster Recovery (vor Go-Live klären)

- [ ] **Neon PITR-Retention verifizieren** — aktueller Plan + PITR-Fenster checken (Free: 24h, Launch: 7d, Scale: 30d). Bei Bedarf hochstufen. Wichtig für TOM-Dokument.
- [ ] **Wöchentlicher pg_dump auf externen EU-Storage** — GitHub Actions oder Vercel Cron → R2/S3 in EU, 30-Tage-Retention. Unabhängig von Neon-Ausfall/Account-Lock.
- [ ] **Blob-Off-Site-Kopie** (Signaturen, gesiegelte PDFs) — inkrementelles Sync zu R2/S3. Signaturen + gesiegelte PDFs sind Beweismittel für AfA, Verlust wäre rechtlich kritisch.
- [ ] **IONOS-Snapshot einmalig** — aktuelle anon-proxy-VM einfrieren, falls Kernel-Update oder Config-Drift die Maschine ruiniert. VM ist zwar stateless (Rebuild aus `proxy/` in ~15 min), Snapshot spart die 15 min im Incident.
- [ ] **Azure-Config als Bicep / Terraform** — aktuell Deployment + Endpoint + Key per Portal geklickt. Bei Account-Verlust oder Region-Migration sind die Klicks zu reproduzieren. Infra-as-Code in den Repo legen.
- [ ] **GitHub-Repo-Mirror** — Push zusätzlich zu GitLab/Codeberg. Single-Point-of-Failure GitHub auflösen.

## Tech-Debt / nice to have

- [x] ~~"Agency" umbenennen~~ → **erledigt 2026-04-23**: Rolle heißt jetzt `bildungstraeger`, Routen `/bildungstraeger/*`, Enum migriert.
- [ ] **Auto-Notify nach Coach-Sign debouncen** — aktuell Mail pro Sign, bei Batch-Signing entstehen mehrere Mails in Folge. Hinweis steht in [app/coach/courses/[id]/actions.ts](app/coach/courses/[id]/actions.ts) (autoNotifyAllParticipants).
- [ ] **Coach-Print Toolbar-CSS extrahieren** — lebt aktuell als String-Konstante in der Page; ggf. nach `globals.css` verschieben falls weitere Print-Wrapper dazukommen.

## Phase 2 (bewusst deferred)

- [ ] **Bildungsträger-Monatsreport** (`/bildungstraeger/reports`) — pro-Coach kumulierte UE, Fortschritt vs. Bewilligung, rein Query-Arbeit auf bestehenden Tabellen.
- [ ] **Rechnungswesen + Mahnwesen** — Rechnung pro abgeschlossenem Kurs (UE × variabler Stundensatz), automatischer Reminder nach 14 Tagen. Eigenes Schema, an AfA-Übermittlung gekoppelt.
- [ ] **Kurs-Modell-Redesign** — Kurse als Maßnahme-Templates + TN-Bibliothek; zurückgestellt bis 1:1- vs. Gruppen-Coaching klar ist (siehe Memory).
