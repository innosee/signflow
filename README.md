# Signflow

SaaS für die Digitalisierung von Coach-/Teilnehmer-Unterschriften und AVGS-Abschlussberichten gegenüber der **Agentur für Arbeit (AfA)**. Zwei nebeneinander laufende Module, die sich denselben Auth- und PDF-Stack teilen:

- **Signatur-Modul** — Stundennachweis-Flow: Coach legt Kurs an, Teilnehmer signieren via Magic-Link, Coach siegelt das Final-PDF mit FES (Firma.dev) und übermittelt an die AfA.
- **Abschlussbericht-Checker** — TN-bezogener Bericht-Editor mit AMDL-Regelprüfung über Azure OpenAI EU. Personenbezogene Daten werden vor jedem LLM-Call durch einen Anonymizer in Frankfurt gepipt; Klartext verlässt nie Deutschland.

Production läuft unter **`https://signflow.coach`**. Betreiber: **innosee GmbH** (HRB 731688 AG Freiburg).

---

## Onboarding für neue Devs / KIs

**Zuerst lesen, in dieser Reihenfolge** — wer das überspringt, baut sich Bugs ein:

1. **[CLAUDE.md](CLAUDE.md)** — fachlicher Kontext, Rollen, DB-Schema, FES, Auth-/Berechtigungs-Modell, Deferred Features
2. **[AGENTS.md](AGENTS.md)** — Hinweis: dieses Next.js (16.x App-Router + Turbopack) hat Breaking Changes ggü. dem, was in den Trainingsdaten steht. **Vor jeder Code-Änderung** die einschlägige Doku unter `node_modules/next/dist/docs/` lesen
3. **[ROADMAP.md](ROADMAP.md)** — Strategiestand: was fertig, was offen, was Phase 2
4. **[TODO.md](TODO.md)** — Pre-Prod-Checkliste (Firma.dev live, Storage-Privatisierung, Backups, …)
5. **[STAGING.md](STAGING.md)** — Sandkasten, in dem riskante Schemata + Auth-Änderungen getestet werden, bevor sie auf `signflow.coach` gehen
6. **[docs/abschlussbericht-checker.md](docs/abschlussbericht-checker.md)** — Deepdive zum Checker-Modul (Pipeline, Pseudonymisierungs-Stages, Prompt-Design)

---

## Tech-Stack

| Layer | Technologie |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack), Tailwind v4 |
| Auth | [Better Auth](https://www.better-auth.com) — E-Mail/PW (Coach + Bildungsträger), Magic Links (TN), Admin-Plugin (Impersonation) |
| Datenbank | [Neon](https://neon.tech) (Postgres serverless, EU-Frankfurt) — pooled Connection via WS für Transactions |
| ORM | [Drizzle](https://orm.drizzle.team) — Schema in [`src/db/schema.ts`](src/db/schema.ts), Migrationen ad-hoc als `scripts/apply-*-migration.mjs` (siehe Konvention unten) |
| FES | [Firma.dev](https://firma.dev) — pay-as-you-go Envelope, ein FES-Aufruf pro Kurs (Coach siegelt) |
| PDF | Puppeteer + `@sparticuz/chromium` — Coach-/BT-Print-Pages werden vom selben React-Tree gerendert wie die Sign-UI (HTML-as-Source-of-Truth) |
| Storage | Vercel Blob (aktuell `access:public` mit Random-Suffix; Migration auf R2/S3 mit signierten URLs steht im TODO) |
| E-Mail | Resend (`onboarding@resend.dev` in Dev, eigene Domain in Prod) |
| Anonymizer | Eigene IONOS-VM in Berlin (`anon.signflow.coach`) — Fastify + GLiNER (Python) + Llama 3.3 als Residual-Pass; HMAC-Auth-Token von Vercel ausgestellt, vom Browser direkt gerufen — Vercel sieht den Klartext nie |
| LLM-Check | Azure OpenAI in **Sweden Central** (EU-Region erzwungen) |
| Hosting | Vercel (innosee-team) — `main` deployt automatisch nach Production, `staging` ist eigener Branch mit Preview-URL + branch-scoped Env-Vars |

---

## Lokales Setup

### Voraussetzungen

- **Node.js ≥ 24.0.0** (siehe `package.json#engines`) — empfohlen via [nvm](https://github.com/nvm-sh/nvm)
- **Vercel CLI** authentifiziert als `innosee-2709` (`vercel login` → Vercel Account)
- **GitHub CLI** mit dem `innosee`-Account aktiv (`gh auth login` → push-Rechte aufs Repo)
- Optional: **Neon CLI** via `npx neonctl auth` für autonomen DB-Zugriff (Branch-Connection-Strings, Branch-Lifecycle)

### Initial-Setup

```bash
git clone https://github.com/innosee/signflow.git
cd signflow
npm install
vercel link --project signflow --scope innosee-team
vercel env pull .env.local --environment=development --yes
npm run dev
```

`.env.local` enthält danach **Development-Env** (eine separate Neon-DB, eigene Resend-Sender-Adresse). Auf `http://localhost:3000` gibt's `/setup` für die einmalige Bildungsträger-Anlage, danach `/login`.

### Erste DB-Migration auf einem leeren Branch

Drizzle-Schema steht, aber Migrationen laufen aktuell **manuell als idempotente Skripte** unter `scripts/apply-*-migration.mjs`. Beispiel:

```bash
node scripts/apply-pdf-branding-migration.mjs
node scripts/apply-ber-extras-migration.mjs
# … die Liste in scripts/ ist die Migrations-Historie
```

Reihenfolge ist jeweils dokumentiert im Skript-Header. Alle Skripte sind `ADD COLUMN IF NOT EXISTS`-style → safe gegen doppelten Lauf.

### Dev-Login-Accounts

In Dev/Staging: nutze die Demo-Accounts aus dem Seeder, nicht echte Production-User. Siehe `STAGING.md` für die Staging-Credentials; in Dev legst du beim `/setup`-Schritt einen eigenen Bildungsträger an und kannst dir Coach-Invites schicken.

---

## Projektstruktur (Kurzversion)

```
app/
  (legal)/                  # Impressum, Datenschutz, Cookies
  anleitung/                # Öffentliche Coach-Anleitung
  api/
    auth/[...all]/          # Better-Auth Catch-All
    branding/logo/          # Logo-Upload (BT only)
    bildungstraeger/abschlussberichte/[berId]/pdf/
    checker/anonymize-token + check/
    courses/[id]/participants/[pid]/pdf/
    signatures/me + participant/
  bildungstraeger/          # BT-Dashboard, BER-Liste, Settings, Bedarfsträger
  coach/                    # Coach-Dashboard, Kurse, Sessions, Checker, Print-Pages, Settings
  sign/[token]/             # TN-Magic-Link-Seite (öffentlich, token-gated)
  setup/                    # Einmalige Bildungsträger-Bootstrap-Seite
  login + forgot/reset-password/
  globals.css
src/
  components/               # Shared React-Komponenten (BerDocument, AppHeader, settings/, checker/)
  db/                       # Drizzle-Schema + Connection-Pool
  lib/
    auth.ts + auth-client.ts        # Better-Auth-Setup
    branding.ts                     # PDF-Header-Logo + Adresse
    checker/                        # Anonymize, Prompt, run-check, Snapshot, Reverse-Map
    dal.ts                          # requireSession / requireCoach / requireBildungstraeger / signing-Gate
    audit.ts                        # logAudit() — generic Audit-Log
    email.ts                        # Resend-Wrapper + Templates
    pdf.ts                          # Puppeteer-Render
    storage.ts                      # Vercel Blob put/del + Branding-Upload
    settings-actions.ts             # Profile/Password/Branding Server-Actions
proxy/                      # IONOS-Anonymizer-VM (Fastify + GLiNER + Llama)
scripts/                    # Migrations + Seeder (apply-*-migration.mjs, seed-staging.mjs)
docs/                       # Modul-Deepdives, Architektur-Notizen
drizzle.config.ts           # Schema-Pfad-Config
proxy.ts                    # Next-Middleware (Pre-Auth-Redirects, NICHT die IONOS-Proxy-VM)
```

---

## Wichtige Konventionen

- **Single-Tenant heute, Multi-Tenant in Vorbereitung.** Der Code geht aktuell davon aus, dass es genau einen Bildungsträger pro Deployment gibt (`users.role='bildungstraeger'`). Multi-Tenant-Schema-Change ist committed (siehe `project_multitenant_commitment.md` im Memory) — jede neue Coach-Query schon jetzt mit `coach_id = session.user.id` serverseitig filtern.
- **DAL als Auth-Boundary.** Niemals UI-Filter als Sicherheitsschicht. Alle Auth-Checks gehen über `src/lib/dal.ts` → `requireCoach` / `requireBildungstraeger` / `requireSigningEnabled` / `assertNotImpersonating`.
- **Impersonation-Write-Block.** Während Bildungsträger-Impersonation **dürfen keine signierenden Aktionen passieren** — sonst ist die Beweiskraft der digitalen Signatur futsch. Servers-Actions prüfen das mit `assertNotImpersonating(session)`.
- **Klartext nie an US-Infrastruktur.** Vor jedem Azure-Call läuft der Text durch den IONOS-Anonymizer. Direkter LLM-Call mit Klartext ist verboten.
- **Migrationen sind idempotente Skripte**, kein `drizzle-kit push` direkt gegen Prod. Pattern: `scripts/apply-<beschreibung>-migration.mjs`. Lauf-Anweisungen stehen im PR-Body.
- **Kein FORCE-PUSH auf `main`/`staging`.** Squash-Merge via PR.
- **Commits unter dem `innosee`-GitHub-Account.** Repo-lokal ist `git config --local user.email` auf `277030340+innosee@users.noreply.github.com` gesetzt — übrige Repos auf der Maschine bleiben mit der persönlichen Identität des Devs.
- **Anführungszeichen + sensitive Vars nicht in den Chat-Transcript.** Wenn KI-Hilfe einen DB-Connection-String braucht: via `npx neonctl connection-string` direkt in eine Shell-Var (`$(...)`) — nicht über Copy-Paste durch Chat.

---

## Deployment & Branches

- **`main`** — wird von Vercel automatisch nach Production gebaut → `https://signflow.coach`. Branch ist geschützt; Merges via Squash-PR.
- **`staging`** — wird von Vercel als Preview gebaut → `https://signflow-git-staging-innosee-team.vercel.app`. Branch-scoped Env-Vars (eigene Neon-DB, eigene Auth-URLs, frisches Auth-Secret). Details in [`STAGING.md`](STAGING.md).
- **Feature-Branches** (`feat/…`, `fix/…`, `chore/…`) — Vercel deployt für jeden Branch eine eigene Preview-URL (`signflow-git-<branch>-innosee-team.vercel.app`). Erbt Preview-Env-Vars, was bei DB-Schema-Änderungen Vorsicht verlangt.

### Vor `main`-Merge

- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` läuft durch (lokale Sanity)
- [ ] Wenn DB-Migration nötig: erst auf Staging testen → dann auf Production-Neon vor dem Merge ausführen → dann mergen. Reihenfolge ist wichtig, damit nicht Prod-Code mit alten Spalten 500't.

---

## Memory & KI-Sessions

Wenn du dieses Repo mit Claude Code (oder einer anderen KI) anfasst, schreibt sie sich nach erfolgreichen Sessions Notizen unter `~/.claude/projects/-Users-…-signflow/memory/`. Diese Notizen sind **nicht im Repo**, sondern lokal pro Maschine. Wichtige laufende Memos sind dort:

- Multi-Tenant-Commitment (2-Wochen-Plan, blockt Stripe)
- Datenschutzerklärung-TODO (vor Go-Live)
- Storage-Privacy-Migration (R2 oder Auth-Proxy für Blobs)
- Shared-Secret-Rotation für IONOS_PROXY_SHARED_SECRET
- Staging-Live-Doku (URLs, Project-IDs, neonctl-Workflow)

Vor jeder größeren Session den Memory-Index (`MEMORY.md`) reinholen — die KI macht das per Default.

---

## Support

Issue-Tracker: [github.com/innosee/signflow/issues](https://github.com/innosee/signflow/issues). Production-Inzidente: direkt an benny@alm.sh.
