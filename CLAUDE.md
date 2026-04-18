@AGENTS.md


# Signflow – Projektkontext für Claude

## Was ist Signflow?
Eine SaaS-Anwendung zur Digitalisierung von Unterschriften für Coaches und Kursteilnehmer im Kontext der Agentur für Arbeit (AfA). Coaches und Teilnehmer unterschreiben digitale Anwesenheitsnachweise, die am Ende als PDF mit einer fortgeschrittenen elektronischen Signatur (FES) versehen und an die AfA übermittelt werden.

---

## Tech Stack
- **Framework:** Next.js (App Router, TypeScript, Tailwind CSS)
- **Auth:** Better Auth (Magic Links für Teilnehmer, Email/PW für Coaches)
- **Datenbank:** Neon (PostgreSQL, serverless)
- **ORM:** Drizzle ORM
- **E-Signatur (FES):** Firma.dev API (€0.029 pro Envelope, pay-as-you-go)
- **Canvas-Signatur:** signature_pad
- **PDF-Generierung:** Puppeteer (Headless Chromium rendert die React-Komponente via `@media print` → A4-PDF; HTML-as-Source-of-Truth, siehe unten)
- **Storage:** Cloudflare R2 oder ähnlich (für Signaturbilder als URL, nicht base64 in DB)
- **E-Mail:** Resend.com

---

## Rollen
| Rolle | Beschreibung |
|---|---|
| **agency** | Super Admin – verwaltet (lädt ein/deaktiviert) Coaches, hat Gesamtübersicht, kann Coaches impersonaten (Support) |
| **coach** | Wird von Agency per Einladung angelegt, setzt Passwort über Invite-Token, erstellt Kurse und Einheiten, unterschreibt als Erster |
| **participant** | Kein eigener Account – erhält Magic Link per E-Mail (24h gültig), unterschreibt nur |

---

## Kern-Workflow
1. Coach legt Kurs an (Header-Daten + Teilnehmer mit Name/Email/Kunden-Nr.)
2. Coach erstellt Sessions laufend (auch nachträglich möglich) – Datum, UE, Modus, Themen
3. Coach unterschreibt jede Session inline in der Kurs-Ansicht (Canvas, aktive Bestätigung + Zeitstempel)
4. Coach triggert manuell **"Teilnehmer benachrichtigen"** → System erzeugt einen **Kurs-scoped Magic Link pro Teilnehmer** (24 h gültig); vorheriger Token für dieselbe Paarung wird invalidiert
5. Teilnehmer öffnet den Link auf dem Handy, sieht den Kurs als Ganzes und alle noch offenen Sessions; signiert alle offenen inline
6. Nach neuen Sessions triggert der Coach einen neuen Magic Link (ersetzt den alten)
7. Wenn jeder Teilnehmer jede (nicht-gelöschte) Session des Kurses signiert hat: Coach triggert "Preview an Teilnehmer senden"
8. Teilnehmer öffnet den Preview-Link, sieht das vollständige Dokument **pixel-identisch zum späteren PDF** und klickt "Freigeben" (Audit-Log + Timestamp, keine FES)
9. Coach sieht "Teilnehmer hat freigegeben" → klickt "Mit FES versiegeln und an AfA übermitteln"
10. System rendert HTML → PDF (Puppeteer), appliziert **1× FES via Firma.dev** (Coach-seitig), übermittelt an AfA

### HTML-as-Source-of-Truth
Die Seite, die Coach/Teilnehmer zum Unterschreiben sehen, ist **exakt** die Seite, die als PDF gedruckt wird – derselbe React-Baum in zwei Modi (`@media screen` interaktiv, `@media print` → Puppeteer-Render nach A4). Kein separates PDF-Layout, keine Design-Drift.

---

## Wichtige Architektur-Entscheidungen

### Unterschriften
- Coach und Teilnehmer **erstellen ihre Unterschrift einmalig** (Canvas/signature_pad)
- Die Unterschrift wird als Bild in Storage gespeichert, URL in DB
- Pro Session **aktive Bestätigung** erforderlich ("Ich bestätige für heute") + Zeitstempel
- Das gibt rechtliche Absicherung ohne 30–50x neu unterschreiben zu müssen

### FES (Fortgeschrittene Elektronische Signatur)
- **Anbieter: Firma.dev**
- Nur **1 API-Aufruf pro Kurs** – das finale PDF bekommt die FES
- Einfache Signaturen innerhalb des Dokuments sind selbst gebaut (Canvas)
- FES reicht für die AfA – QES wird nicht benötigt

### Teilnehmer-Flow
- Kein Account für Teilnehmer – nur E-Mail-Adresse im System
- Magic Link **pro Kurs × Teilnehmer** (`participant_access_tokens`-Tabelle, siehe Schema), 24 h gültig ab Versand
- Nicht one-shot: Innerhalb der 24 h kann der Teilnehmer so viele Sessions signieren wie gerade offen sind. Vom Coach bei neuen Sessions neu ausgelöst → alter Token wird invalidiert (`used_at` gesetzt), neuer Token ersetzt ihn.
- Mobile-optimierte Webseite mit Canvas – keine React Native App (Phase 2)

### Auth & Berechtigungen
- **Coach-Signup: nur per Einladung**, kein offener `/signup`-Endpoint. Agency legt Coach an (Name + E-Mail) → System schickt Setup-Mail mit einmaligem Invite-Token → Coach setzt Passwort + erstellt Unterschrift.
- **Impersonation (Agency → Coach)**: Agency kann in die Sicht eines Coaches wechseln. Session führt `impersonated_by`-Feld (DB-Spalte) / `impersonatedBy` (Drizzle/TS). Jede Aktion wird im Audit-Log mit beiden IDs geloggt.
- **Schreibende Aktionen während Impersonation sind hart blockiert** – insbesondere das Leisten von Unterschriften. Sonst ist die Beweiskraft der digitalen Unterschrift kaputt (Coach könnte behaupten, Agency habe in seinem Namen signiert).
- **Data-Isolation**: jede Coach-Query serverseitig mit `coach_id = session.user.id` filtern – nicht auf UI verlassen.
- **Single-Tenant**: aktuell eine Agency pro Deployment (`users` hat keine `agency_id`). Multi-Tenancy wäre Schema-Change.

---

## Datenbankschema (Drizzle ORM)

### Tabellen

#### `users`
```ts
id: uuid PK
email: string (unique)
name: string
role: enum('agency', 'coach')
signature_url: string | null  // einmalig gesetzt beim Onboarding
created_at: timestamp
updated_at: timestamp
deleted_at: timestamp | null  // soft delete
```

#### `courses`
```ts
id: uuid PK
coach_id: uuid FK -> users.id
title: string
start_date: date
end_date: date
status: enum('active', 'completed', 'archived')
created_at: timestamp
updated_at: timestamp
deleted_at: timestamp | null  // soft delete
```

#### `participants`
```ts
id: uuid PK
name: string
email: string (unique)
signature_url: string | null  // einmalig beim ersten Magic Link gesetzt
created_at: timestamp
updated_at: timestamp
```

#### `course_participants`
```ts
id: uuid PK
course_id: uuid FK -> courses.id
participant_id: uuid FK -> participants.id
enrolled_at: timestamp
```

#### `sessions`
```ts
id: uuid PK
course_id: uuid FK -> courses.id
session_date: date
topic: string
status: enum('pending', 'coach_signed', 'completed')
created_at: timestamp
updated_at: timestamp
deleted_at: timestamp | null  // soft delete
```

#### `participant_access_tokens`
```ts
id: uuid PK
course_id: uuid FK -> courses.id (cascade delete)
participant_id: uuid FK -> participants.id (restrict delete)
token_hash: string (unique, SHA-256 base64url des Klartexts)
expires_at: timestamp     // +24h ab Ausstellung
used_at: timestamp | null // null = aktiv; beim Re-Issue invalidiert
```

**Semantik:** Ein Link pro Kurs × Teilnehmer gleichzeitig aktiv. Wenn der Coach einen neuen Link auslöst, bekommt der alte `used_at = now()` gesetzt (Invalidierung) und ein neuer Datensatz wird angelegt. Innerhalb der 24 h kann der Teilnehmer beliebige offene Session-Zeilen signieren — der Token wird NICHT pro Session verbraucht.

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
firma_envelope_id: string | null
fes_status: enum('pending', 'sent', 'completed')
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
| Firma.dev (360 Envelopes × €0.029) | ~€10.50 |
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
| FES Integration (Firma.dev) | 1–2 Tage |
| Testing & Polish | 3–5 Tage |
| **Gesamt** | **~2.5–3 Wochen** |

---

## Nächste Schritte
- [ ] Drizzle Schema implementieren (`src/db/schema.ts`)
- [ ] Drizzle Config anlegen (`drizzle.config.ts`)
- [ ] Better Auth konfigurieren (`src/lib/auth.ts`)
- [ ] Erste Migration pushen (`npx drizzle-kit push`)
- [ ] Frontend Design in Stitch (User Flows: Coach Dashboard, Session anlegen, Teilnehmer-Signaturseite)

---

## Offene Entscheidungen
- [ ] Storage-Anbieter: Cloudflare R2 vs Vercel Blob (für Signaturbilder) — aktuell Vercel Blob (public + random suffix); TODO vor Prod auf privat-geschützt migrieren, siehe [storage.ts](src/lib/storage.ts)

---

## Deferred / Phase 2 (bewusst NICHT im MVP)

Geplant, aber erst nach Core-Flow (Kurs → Session → Signatur → PDF → FES).
Kein Schema-Vorbau nötig — wird später eigenständig gebaut.

### Monatsreport für Agency (`/agency/reports`)
Pro-Coach-Statistik im Monat: aktive Kurse, bewilligte UE kumuliert, geleistete UE, Fortschritt in %. Rein Query-Arbeit auf bestehenden Tabellen (`courses` + `sessions` + `signatures`). Keine Schema-Änderung.

### Rechnungswesen + Mahnwesen (`/agency/invoices`)
Nach Kursabschluss Rechnung erzeugen, per E-Mail versenden, automatische Erinnerung nach 14 Tagen wenn unbezahlt.
- **Abrechnungsmodell:** pro-UE × Stundensatz (variabel pro AVGS-Maßnahme / Bedarfsträger) — **keine** Pauschale pro Kurs
- Eigenes Domain-Schema später: `invoices`, `invoice_items`, `invoice_reminders`, evtl. `billing_addresses`
- Stripe/Mollie-Anbindung oder manuelle Reconciliation — zu entscheiden wenn Phase beginnt