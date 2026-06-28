@AGENTS.md


# Signflow – Projektkontext für Claude

## Was ist Signflow?
Eine SaaS-Anwendung zur Digitalisierung von Unterschriften für Coaches und Kursteilnehmer im Kontext der Agentur für Arbeit (AfA). Coaches und Teilnehmer unterschreiben digitale Anwesenheitsnachweise, die am Ende als A4-PDF an die AfA übermittelt werden.

> **Stand Launch (Bridge-Modus):** Produktiv läuft die **einfache elektronische Signatur** (Canvas + Zeitstempel + Audit-Protokoll) als ehrlicher Standard — **kein Siegel**. Das fortgeschrittene **FES-Siegel** (D-Trust) ist gebaut, aber gemockt und wird später per `FES_MODE=live` scharf geschaltet. Details: Abschnitt „FES" unten + Memory `project_einfache_signatur_bridge`.

---

## Tech Stack
- **Framework:** Next.js (App Router, TypeScript, Tailwind CSS)
- **Auth:** Better Auth (Magic Links für Teilnehmer, E-Mail/PW für Coaches)
- **Datenbank:** Neon (PostgreSQL, serverless)
- **ORM:** Drizzle ORM
- **Signatur:** Stand Launch **einfache elektronische Signatur** (Canvas + Zeitstempel + Audit), kein Siegel. Das **FES-Siegel** (D-Trust AES via PSW, self-hosted PAdES, Cert auf innosee GmbH) liegt in `src/lib/fes.ts` **gemockt** und wird später per `FES_MODE=live` aktiviert (Bridge-Modus → Memory `project_einfache_signatur_bridge`; Anbieter-Entscheidung → `project_fes_provider_decision`; firma.dev/Skribble verworfen).
- **Canvas-Signatur:** signature_pad
- **PDF-Generierung:** Puppeteer (Headless Chromium rendert die React-Komponente via `@media print` → A4-PDF; HTML-as-Source-of-Truth, siehe unten)
- **Storage:** Cloudflare R2 oder ähnlich (für Signaturbilder als URL, nicht base64 in DB)
- **E-Mail:** Resend.com

---

## Rollen
| Rolle | Beschreibung |
|---|---|
| **bildungstraeger** | Super Admin (die Firma / der Bildungsträger) – verwaltet (lädt ein/deaktiviert) Coaches, hat Gesamtübersicht, kann Coaches impersonaten (Support) |
| **coach** | Wird von Bildungsträger per Einladung angelegt, setzt Passwort über Invite-Token. Legt **Termine/Einheiten** zu zugewiesenen Kunden an (Kurs-Anlage selbst macht der BT) und unterschreibt. **Kompetenzteam:** mehrere Coaches je Maßnahme möglich (`course_coaches` + `sessions.coach_id`); jeder zugewiesene Coach signiert seine eigenen Termine. Zugriffs-Check überall via `courseVisibleToCoach` (primär ODER Team), nicht nur `courses.coach_id` (Memory `project_multi_coach_per_course`). |
| **participant** | Kein eigener Account – erhält Magic Link per E-Mail (24h gültig), unterschreibt nur |

---

## Kern-Workflow
1. **Bildungsträger** legt den Kunden (= Maßnahme, **1:1**) an und weist ihn einem Coach zu — Coaches legen NICHT mehr selbst an. Der **Titel ist der Maßnahmentyp** (EKC/ESC/EGC/ESCA, `src/lib/massnahme-typ.ts`), kein Freitext mehr.
2. Coach erstellt Termine laufend – Datum (**Mo–Sa**; Sonntag gesperrt, Feiertage = weiche Warnung), UE, Modus, Themen. Beim **Erstgespräch** zusätzlich die **Eignungsanalyse** (4 Kriterien je ++/O/–- + Gesamtergebnis „geeignet Ja/Nein").
3. Coach unterschreibt jeden Termin inline (Canvas, aktive Bestätigung + Zeitstempel). Der Themen-Text lässt sich später per **„Inhalt korrigieren"** ändern, **ohne** Signaturen/Freigabe zu verlieren (Datum/UE/Erstgespräch nur über „Bearbeiten (Signaturen zurücksetzen)").
4. Coach triggert **"Teilnehmer benachrichtigen"** → **Kurs-scoped Magic Link** (24 h gültig). Alte Links werden **nicht** invalidiert — mehrere gleichzeitig gültig, eine ältere Mail funktioniert weiter.
5. Teilnehmer öffnet den Link, signiert alle offenen Termine inline.
6. **ANW-Compliance-Check** (KI gegen AZAV) – empfohlen vor der Freigabe. Soft-Warnungen (`status="nacharbeit"`) sind **quittierbar** („Hinweise gesehen — trotzdem freigeben", audit-geloggt) → **kein Hard-Block** durch die KI.
7. Coach **„Maßnahme als abgeschlossen markieren"** – bei weniger als voll geleisteten UE mit **Pflicht-Begründung** (vorzeitiges Ende).
8. Coach **„Preview an Teilnehmer senden"** → Teilnehmer sieht das **pixel-identische** Enddokument und klickt **„Freigeben"** (Audit + Timestamp, keine FES).
9. **Bildungsträger-Prüfung (Abschluss-Gate 3/3):** Coach reicht die freigegebene Liste beim BT zur Prüfung ein → BT **gibt frei** oder fordert **Nachbesserung** an (Notiz-Thread, `/bildungstraeger/reviews`). Bei Nachbesserung kann der Coach auf seiner Kursseite **antworten** (Re-Submit mit Notiz → Status zurück auf `pending`, BT entscheidet erneut); alle zugewiesenen Coaches werden per Mail informiert + Dashboard-Badge. Erst nach BT-Freigabe ist der Abschluss frei.
10. Coach **„Nachweis abschließen"** → System rendert HTML → PDF (Puppeteer). **Stand Launch: einfache elektronische Signatur** (kein Siegel). Das **FES-Siegel** (`src/lib/fes.ts`, gemockt → später `FES_MODE=live`) wird hier appliziert, sobald live.
11. **Bildungsträger** übermittelt das abgeschlossene PDF an die AfA (`/bildungstraeger/submissions`).

### HTML-as-Source-of-Truth
Die Seite, die Coach/Teilnehmer zum Unterschreiben sehen, ist **exakt** die Seite, die als PDF gedruckt wird – derselbe React-Baum in zwei Modi (`@media screen` interaktiv, `@media print` → Puppeteer-Render nach A4). Kein separates PDF-Layout, keine Design-Drift.

---

## Wichtige Architektur-Entscheidungen

### Unterschriften
- Coach und Teilnehmer **erstellen ihre Unterschrift einmalig** (Canvas/signature_pad)
- Die Unterschrift wird als Bild in Storage gespeichert, URL in DB
- Pro Session **aktive Bestätigung** erforderlich ("Ich bestätige für heute") + Zeitstempel
- Das gibt rechtliche Absicherung ohne 30–50x neu unterschreiben zu müssen

### Signatur & FES (Bridge-Modus)
- **Stand Launch: einfache elektronische Signatur** ist der produktive Standard. Coach + Teilnehmer signieren per Canvas, abgesichert durch Zeitstempel + IP + aktive Bestätigung + Audit-Protokoll. Das finale PDF trägt **kein Siegel**. Rechtlich tragfähig (AZAV-Anwesenheitsnachweise haben keine Schriftform). Öffentliche Claims sagen ehrlich „FES in Vorbereitung".
- **FES-Siegel später:** `src/lib/fes.ts` (`sealWithFes`) ist **gemockt**. Live = **D-Trust-Siegel (AES) via PSW Group, self-hosted PAdES** (Cert auf innosee GmbH) — das PDF verlässt unsere Infrastruktur nie. Aktiviert per `FES_MODE=live` (Memory `project_einfache_signatur_bridge`; Anbieter `project_fes_provider_decision`; firma.dev/Skribble verworfen). Nur **1 Siegel pro Kurs**, Coach-seitig ausgelöst.
- **Abschluss-Gates (alle drei müssen erfüllt sein, Nummerierung wie im Schema unten):** (1) Maßnahme als abgeschlossen markiert (`abgeschlossen_at`), (2) ANW-Compliance-Check freigegeben/quittiert (`anw_check_passed_at`), (3) **Bildungsträger-Prüfung freigegeben** (`review_status`) + alle Termine signiert + Teilnehmer-Freigabe. Bei jeder Termin-Änderung werden die Gates zurückgesetzt. (Gaten heute den „Nachweis abschließen"-Schritt; mit `FES_MODE=live` gaten sie das Siegel.)
- FES reicht für die AfA – QES wird nicht benötigt.

### Teilnehmer-Flow
- Kein Account für Teilnehmer – nur E-Mail-Adresse im System
- Magic Link **pro Kurs × Teilnehmer** (`participant_access_tokens`-Tabelle, siehe Schema), 24 h gültig ab Versand
- Nicht one-shot: Innerhalb der 24 h kann der Teilnehmer so viele Sessions signieren wie gerade offen sind. Vom Coach bei neuen Sessions neu ausgelöst → ein zusätzlicher Token wird ausgestellt; alte Links werden **nicht** invalidiert, sie laufen einfach nach ihren eigenen 24 h ab (mehrere gleichzeitig gültig, alle zeigen auf dieselbe Sign-Seite).
- Mobile-optimierte Webseite mit Canvas – keine React Native App (Phase 2)

### Auth & Berechtigungen
- **Coach-Signup: nur per Einladung**, kein offener `/signup`-Endpoint. Bildungsträger legt Coach an (Name + E-Mail) → System schickt Setup-Mail mit einmaligem Invite-Token → Coach setzt Passwort + erstellt Unterschrift.
- **Bildungsträger-Onboarding (live seit 2026-06-22)**: drei Wege, alle über den geteilten Helper `provisionBildungstraeger` ([src/lib/bildungstraeger-onboarding.ts](src/lib/bildungstraeger-onboarding.ts)) — legt Tenant + Admin-User + Credential-Account atomar an und verschickt den Better-Auth-Passwort-Reset-Link (Klick = E-Mail-Verifikation). Der offene Better-Auth-Signup bleibt aus (`disableSignUp: true`).
  1. **`/register`** — öffentlicher Self-Service, abgesichert über den Warteliste-Bot-Schutz (Honeypot + Min-Time + Turnstile + IP-Rate-Limit).
  2. **`/operator/onboard`** — betreiber-interne Freischaltung aus der Warteliste, geschützt per `OPERATOR_ONBOARD_SECRET` (404 ohne Secret).
  3. **`/setup`** — einmaliger Bootstrap des Default-Tenants (unverändert).
- **Impersonation (Bildungsträger → Coach)**: Bildungsträger kann in die Sicht eines Coaches wechseln. Session führt `impersonated_by`-Feld (DB-Spalte) / `impersonatedBy` (Drizzle/TS). Jede Aktion wird im Audit-Log mit beiden IDs geloggt.
- **Schreibende Aktionen während Impersonation sind hart blockiert** – insbesondere das Leisten von Unterschriften. Sonst ist die Beweiskraft der digitalen Unterschrift kaputt (Coach könnte behaupten, Bildungsträger habe in seinem Namen signiert).
- **Data-Isolation**: jede Coach-Query serverseitig scopen – nicht auf UI verlassen. Im Kompetenzteam-Modell **nicht** stumpf `coach_id = session.user.id`, sondern den Helper `courseVisibleToCoach(coachId)` (primärer Coach ODER `course_coaches`-Mitglied) verwenden — sonst sehen Team-Coaches „ihre" Kurse nicht.
- **Multi-Tenant (live seit 2026-05)**: mehrere Bildungsträger pro Deployment, je ein `tenants`-Eintrag. `users`, `participants` und `bedarfstraeger` tragen `tenant_id`; jede Query ist tenant-scoped (nicht nur `coach_id`). Neue Tenants entstehen über das Bildungsträger-Onboarding oben.

---

## Datenbankschema (Drizzle ORM)

> **Source of Truth ist `src/db/schema.ts`** — die Skizze unten ist vereinfacht und kann hinterherhinken. Vor dem Verlassen darauf immer gegen `schema.ts` prüfen.

### Tabellen

#### `users`
```ts
id: uuid PK
email: string (unique)
name: string
role: enum('bildungstraeger', 'coach')
signature_url: string | null  // einmalig gesetzt beim Onboarding
created_at: timestamp
updated_at: timestamp
deleted_at: timestamp | null  // soft delete
```

#### `courses`  (= eine Maßnahme = **ein** Kunde, 1:1)
```ts
id: uuid PK
coach_id: uuid FK -> users.id
participant_id: uuid FK -> participants.id  // 1:1-Bindung (Kurs = Kunde)
title: string                 // = Maßnahmentyp-Label (kein Freitext mehr)
avgs_nummer: string
durchfuehrungsort: string
anzahl_bewilligte_ue: integer
bedarfstraeger_id: uuid FK -> bedarfstraeger.id
massnahme_typ: enum('EKC','ESC','EGC','ESCA')
bundesland: enum | null       // Feiertags-Warnung
start_date: date
end_date: date
status: enum('active', 'completed', 'archived')
flag_unter_2_termine: boolean
flag_vorzeitiges_ende: boolean
begruendung_text: string | null    // Pflicht bei vorzeitigem Abschluss
abgeschlossen_at: timestamp | null    // Abschluss-Gate 1: "Maßnahme abgeschlossen"
anw_check_passed_at: timestamp | null // Abschluss-Gate 2: ANW-Check freigegeben/quittiert
review_status: enum('none','pending','changes_requested','approved')  // Abschluss-Gate 3: BT-Prüfung
review_requested_at / review_decided_at: timestamp | null
review_decided_by: uuid | null
created_at / updated_at / deleted_at
```
Alle drei `*_at`/`review_status`-Gates werden bei jeder Session-Änderung zurückgesetzt.

#### `participants`
```ts
id: uuid PK
name: string
email: string (unique)
signature_url: string | null  // einmalig beim ersten Magic Link gesetzt
created_at: timestamp
updated_at: timestamp
```

#### `course_participants` / `session_participants` — **ENTFALLEN**
Durch das 1:1-Modell (2026-06-12) gedroppt. Die Bindung läuft jetzt direkt über `courses.participant_id`.

#### `course_coaches`  (Kompetenzteam: mehrere Coaches je Maßnahme)
Verknüpft `course_id × coach_id` für zusätzlich zugewiesene Team-Coaches (zusätzlich zum primären `courses.coach_id`). `sessions.coach_id` hält fest, welcher Coach einen Termin verantwortet. Zugriffs-Checks nutzen den korrelierten SQL-Helper `courseVisibleToCoach(coachId)` ([src/lib/course-access.ts](src/lib/course-access.ts)) — primärer Coach ODER `course_coaches`-Mitglied. Migration: `apply-session-coach-migration.mjs` (Status vor Prod prüfen). Memory `project_multi_coach_per_course`.

#### `sessions`
```ts
id: uuid PK
course_id: uuid FK -> courses.id
session_date: date
topic: string                 // via „Inhalt korrigieren" editierbar ohne Signatur-Reset
anzahl_ue: numeric            // 0 beim Erstgespräch
modus: enum('praesenz','online')
is_erstgespraech: boolean
geeignet: boolean | null      // Erstgespräch: Gesamtergebnis „geeignet Ja/Nein"
eignungsanalyse: jsonb | null // Erstgespräch: 4 Kriterien je '++'/'o'/'--'
status: enum('pending', 'coach_signed', 'completed')
created_at: timestamp
updated_at: timestamp
deleted_at: timestamp | null  // soft delete
```
CHECK: Erstgespräch → `anzahl_ue=0` + `geeignet` gesetzt; reguläre Session → `anzahl_ue>0` + `geeignet=null`.

#### `participant_access_tokens`
```ts
id: uuid PK
course_id: uuid FK -> courses.id (cascade delete)
participant_id: uuid FK -> participants.id (restrict delete)
token_hash: string (unique, SHA-256 base64url des Klartexts)
expires_at: timestamp     // +24h ab Ausstellung
used_at: timestamp | null // null = aktiv; reserviert für späteren expliziten Revoke (Re-Issue invalidiert NICHT)
```

**Semantik:** Mehrere Links pro Kurs × Teilnehmer können gleichzeitig gültig sein — jeder läuft 24 h ab seiner Ausstellung. Re-Issue legt einfach einen neuen Datensatz an, **ohne** alte zu invalidieren (geändert 2026-06-19, damit eine ältere Mail nicht ins Leere läuft). Gültigkeit hängt nur an `expires_at`; alle aktiven Links zeigen auf dieselbe Sign-Seite. Innerhalb der 24 h kann der Teilnehmer beliebige offene Session-Zeilen signieren — der Token wird NICHT pro Session verbraucht.

#### `course_review_notes`  (Bildungsträger-Prüfung, Abschluss-Gate 3)
```ts
id: uuid PK
course_id: uuid FK -> courses.id (cascade)
author_type: enum('coach','bildungstraeger')
author_id: uuid FK -> users.id
kind: enum('submit','approve','changes','comment')
body: string | null
created_at: timestamp
```
Append-only Notiz-Thread Coach↔BT über die Prüf-Runden. Steuert zusammen mit `courses.review_status` die BT-Prüfung unter `/bildungstraeger/reviews`.

#### `signatures`
```ts
id: uuid PK
session_id: uuid FK -> sessions.id
course_participant_id: uuid FK -> course_participants.id
signer_type: enum('coach', 'participant')
signature_url: string  // URL zu Storage, nicht base64
signed_at: timestamp
ip_address: string
```

#### `final_documents`
```ts
id: uuid PK
course_id: uuid FK -> courses.id (unique – 1 pro Kurs)
pdf_url: string
firma_envelope_id: string | null   // Spaltenname historisch (firma.dev), bleibt; im Bridge-Modus eine interne Abschluss-Ref ("bridge_…"), null Siegel
fes_status: enum('pending', 'sent', 'completed')  // im Bridge-Modus 'completed' = abgeschlossen (kein echtes Siegel)
created_at: timestamp
completed_at: timestamp | null
```

### Wichtige Indizes
```ts
sessions.course_id
signatures.session_id
participant_access_tokens.token_hash (UNIQUE)
participant_access_tokens (course_id, participant_id)
course_participants.course_id
```

---

## Kosten (Produktion, 120 Coaches × 3 Teilnehmer)
| Posten | Kosten/Monat |
|---|---|
| D-Trust-Siegel via PSW (AES, Jahrespauschale ~€722/J → ~€60/Mo, volumenunabhängig) | ~€60 |
| Neon (Postgres) | €0–19 |
| Vercel (Hosting) | €20 |
| Resend (E-Mail) | €0 (Free Tier) |
| **Gesamt** | **~€30–50** |

---

## Zeitplan (MVP)
| Phase | Dauer |
|---|---|
| Setup & Auth (Better Auth) | 0.5 Tage |
| DB-Schema & Drizzle Setup | 1 Tag |
| Frontend (Stitch → Next.js) | 4–6 Tage |
| Coach Signatur Flow | 1 Tag |
| Teilnehmer Flow (Magic Link + Canvas) | 3–4 Tage |
| PDF-Generierung | 2 Tage |
| FES Integration (D-Trust/PSW, self-hosted PAdES) | 1–2 Tage |
| Testing & Polish | 3–5 Tage |
| **Gesamt** | **~2.5–3 Wochen** |

---

## Offene Punkte vor Production
(App ist live in der Testphase; Go-Live 2026-06-29.)
- **FES live schalten:** echten PAdES-Flow in `src/lib/fes.ts` + `FES_MODE=live` (hängt am D-Trust-Cert, KYB/CA läuft). Größter Restbau — bis dahin Bridge-Modus.
- **`course_coaches` auf Prod:** Migration `apply-session-coach-migration.mjs` anwenden + prüfen, dass die BT-Kunden-Zuweisung die Zeilen wirklich schreibt (sonst sehen Team-Coaches ihre Kurse nicht).
- **BER-Checker rein beratend:** der alte `lastCheckPassed`-Gate ist raus — Hinweise/Verstöße/fehlende Pflichtbausteine blockieren das Einreichen NIE. Einzige Hürde sind **Hard-Blocks** (Art-9/Gesundheit, harte Prognose) mit Override-Begründung (Client + Server-Snapshot). Offen: serverseitige Re-Validierung des Hard-Blocks gegen Azure, sobald live (Server vertraut aktuell dem mitgeschickten Snapshot).
- **Secret-Rotation-Batch** (Neon-PW + IONOS-Secret + R2-Creds) gebündelt kurz vor Prod.
- **Datenschutzerklärung** nennt noch FES-Cert + „gesiegelte PDFs" — Rechtstext, läuft mit der DSGVO-Beratung.

---

## Offene Entscheidungen
- [ ] Storage-Anbieter: Cloudflare R2 vs Vercel Blob (für Signaturbilder) — aktuell Vercel Blob (public + random suffix); TODO vor Prod auf privat-geschützt migrieren, siehe [storage.ts](src/lib/storage.ts)

---

## Deferred / Phase 2 (bewusst NICHT im MVP)

Geplant, aber erst nach Core-Flow (Kurs → Session → Signatur → PDF → FES).
Kein Schema-Vorbau nötig — wird später eigenständig gebaut.

### Monatsreport für Bildungsträger (`/bildungstraeger/reports`)
Pro-Coach-Statistik im Monat: aktive Kurse, bewilligte UE kumuliert, geleistete UE, Fortschritt in %. Rein Query-Arbeit auf bestehenden Tabellen (`courses` + `sessions` + `signatures`). Keine Schema-Änderung.

### Rechnungswesen + Mahnwesen (`/bildungstraeger/invoices`)
Nach Kursabschluss Rechnung erzeugen, per E-Mail versenden, automatische Erinnerung nach 14 Tagen wenn unbezahlt.
- **Abrechnungsmodell:** pro-UE × Stundensatz (variabel pro AVGS-Maßnahme / Bedarfsträger) — **keine** Pauschale pro Kurs
- Eigenes Domain-Schema später: `invoices`, `invoice_items`, `invoice_reminders`, evtl. `billing_addresses`
- Stripe/Mollie-Anbindung oder manuelle Reconciliation — zu entscheiden wenn Phase beginnt