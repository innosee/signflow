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
- **PDF-Generierung:** react-pdf oder Puppeteer (noch zu entscheiden)
- **Storage:** Cloudflare R2 oder ähnlich (für Signaturbilder als URL, nicht base64 in DB)
- **E-Mail:** Resend.com

---

## Rollen
| Rolle | Beschreibung |
|---|---|
| **agency** | Super Admin – verwaltet Coaches, hat Gesamtübersicht |
| **coach** | Legt sich selbst an, erstellt Kurse und Einheiten, unterschreibt als Erster |
| **participant** | Kein eigener Account – erhält Magic Link per E-Mail, unterschreibt nur |

---

## Kern-Workflow
1. Coach legt Kurs an (Titel, Start-/Enddatum, Teilnehmer per Name + E-Mail)
2. Coach erstellt eine Kurseinheit (Session) – Datum, Thema
3. Coach unterschreibt die Session (gespeicherte Unterschrift wird verwendet, aktive Bestätigung + Zeitstempel)
4. System generiert Magic Link für Teilnehmer und verschickt E-Mail via Resend
5. Teilnehmer öffnet Magic Link auf dem Handy, sieht mobile Canvas-Signatur
6. Teilnehmer unterschreibt einmalig (wird gespeichert), bestätigt aktiv pro Session
7. Nach allen Sessions: PDF-Generierung mit allen Unterschriften + Zeitstempeln
8. PDF erhält **1x FES via Firma.dev** – einmalig für das gesamte Dokument
9. Finales PDF wird an die AfA übermittelt

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
- Magic Link pro Session (session_tokens Tabelle)
- Mobile-optimierte Webseite mit Canvas – keine React Native App (Phase 2)

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

#### `session_tokens`
```ts
id: uuid PK
session_id: uuid FK -> sessions.id
participant_id: uuid FK -> participants.id
token: string (unique) // INDEX!
expires_at: timestamp
used_at: timestamp | null  // null = noch nicht verwendet
```

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
session_tokens.token (UNIQUE)
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
- [ ] PDF-Library: react-pdf vs Puppeteer (entscheiden wenn PDF-Phase beginnt)
- [ ] Storage-Anbieter: Cloudflare R2 vs Vercel Blob (für Signaturbilder)