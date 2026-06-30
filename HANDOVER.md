# HANDOVER — Signflow (Stand 2026-06-30)

> Für eine **neue Claude-Session**. Lies zuerst `CLAUDE.md` + `AGENTS.md` +
> **`DEVELOPMENT.md`** (Release-Manifest). Die Auto-Memory unter
> `~/.claude/projects/.../memory/` lädt die referenzierten `[[…]]`-Einträge
> automatisch. Dieses Dokument ist der „Start here"-Überblick.

## 🚀 LIVE mit 100+ echten Usern — ab jetzt STRIKTER Prozess
Go-Live war 2026-06-29. Seit 2026-06-30 sind **100+ echte User mit echten
AfA-Daten** auf Prod. **Ab jetzt verbindlich [DEVELOPMENT.md](DEVELOPMENT.md):**
Feature-Branch → **Staging** verifizieren → PR nach `main` → Prod. **Nie** direkt
auf `main` (pre-push-Hook blockt das), **nie** Prod-DB-Schreiben/Migration ohne
frisches Backup + explizites OK ([[project_dev_discipline]],
[[project_staging_degraded]], [[project_backups_live]]).

> **Hinweis:** Die früheren Sessions unten wurden teils noch direkt auf `main`
> deployt (Testphase). Das gilt **nicht mehr** — siehe DEVELOPMENT.md.

## 2026-06-30 (Nachmittag) — Senior-Dev-Prozess scharfgeschaltet + Features

> Erstmals **alles über Branch → Staging → PR** (nicht direkt main). Migrationen
> erst auf Staging, dann Prod (Backup vorher).

**🔴 OFFENE SICHERHEITS-AKTION (nicht vergessen!):** Der **gpg-Private-Key** der
Backups liegt noch als Klartext-Datei **`~/signflow-backup-PRIVATE.asc`** auf dem
Mac. **Offline sichern (Passwortmanager/USB) und dann `rm`.** Ohne ihn ist KEIN
Backup-Restore möglich; bleibt er liegen, ist die Verschlüsselung wertlos.
Fingerprint `73C8 4F44 … 6F7B E047`.

### Prozess & Infra (PR #117/#118/#119, gemergt)
- **Release-Manifest [DEVELOPMENT.md](DEVELOPMENT.md)** (vor jedem Push lesen,
  Pointer in AGENTS.md) + **pre-push-Hook** `.githooks/pre-push` (blockt
  Direkt-Push auf `main`; aktivieren: `git config core.hooksPath .githooks`).
- **Backups LIVE & verifiziert** ([[project_backups_live]], `docs/backups.md`):
  GitHub-Actions-Cron Mo+Do → `pg_dump` via read-only Neon-Rolle `backup_ro` →
  gpg → scp auf IONOS-VM `/home/signflow/backups` (Retention 16). End-to-end
  getestet (Decrypt = gültiges PGDMP). Secrets/Vars in GitHub gesetzt.
- **Staging repariert + dauerhaft** ([[project_staging_degraded]]): alter Neon-
  staging-Branch war wegen Inaktivität **archiviert** (Neon-Org = **Launch/paid**,
  kein Free-Problem). Neuer schema-only Branch `br-long-pond-alx2tzly`, Vercel
  `DATABASE_URL` (preview/staging) gesetzt, git `staging` = `main`, geseedet, live.
  **Keepalive-Cron** `.github/workflows/keepalive-staging.yml` (alle 3 Tage
  `SELECT 1`) gegen Re-Archivierung.

### Features (alle über den neuen Prozess auf Prod)
- **Erstgespräch vor Gutscheinausstellung erlaubt** (Feedback Karen P.): harter
  „davor"-Block weg (obere Grenze bleibt), weicher Hinweis im Termin-Formular
  ([app/coach/courses/[id]/actions.ts](app/coach/courses/%5Bid%5D/actions.ts)).
- **Bedarfsträger bearbeitbar**: Edit-Route + `updateBedarfstraeger` (tenant-scoped)
  + „Bearbeiten"-Link; geteilte Anlegen/Bearbeiten-Form.
- **mini-analytics** (cookieless, kein Consent) site-weit via `next/script` +
  **Conversion-Events** `cta_signup` / `signup_completed` / `course_create_started`
  / `course_published` / `contact_clicked` / `search` (Helper
  `src/lib/analytics.ts`). Dashboard: mini-analytics-innosee-team.vercel.app/dashboard.
- **Changelog „Neu" Phase 1** (PR #120, erster Staging-first-Durchlauf): `/neu`
  (alle eingeloggten User), AppHeader „Neu" + blaue Bubble (ungelesen-Count),
  Operator-Editor `/operator/changelog` (`OPERATOR_ONBOARD_SECRET`-gated). Schema
  `changelog_entries` + `users.changelog_last_seen_at` (Migration
  `scripts/apply-changelog-migration.mjs` auf Staging UND Prod angewendet).
  **Erster Eintrag ist live.**

### Noch offen / als Nächstes
- 🔴 **gpg-Private-Key offline sichern** (siehe oben) — höchste Priorität.
- **GitHub Branch-Protection auf `main`** serverseitig aktivieren (zusätzlich zum Hook).
- Backups: **monatlicher Restore-Test** (echtes `pg_restore` auf Wegwerf-Branch).
- Optional: Staging-DB-Passwort rotieren (einmal im Output exponiert); verwaiste
  Neon-Branches `dev` + `pre-collapse` löschen.
- **Changelog Phase 2** (geplant, NICHT gebaut): E-Mail-Opt-in für News
  (vorausgefüllte Form, Consent-Logging, Versand via Resend, Opt-in sichtbar im
  BT-Backend).

## Letzte Sessions — alles gemergt in `main` + auf Prod (Vercel auto-deploy)

### 2026-06-29/30 — Checker-Überarbeitung + Abschluss-Flow gestrafft + Bug-Fixes
> Großer Block direkt-auf-`main`-deployt (Vercel auto). Prod = Testphase ohne echte Daten.
> Verifizier-Befehle: `npm run typecheck && npm run lint && npx vitest run && npm run build`.
> Deploy-Status: `gh api repos/innosee/signflow/commits/<sha>/status --jq '.statuses[]|select(.context=="Vercel").state'`.

**BER-Checker (Abschlussbericht-Checker) — Zwei-Kategorien-Modell + UX-Umbau** ([[project_checker_two_category_severity]]):
- Nur **Sensibel/hard_block** (Art-9/Gesundheit, harte Prognose) blockt das Einreichen; alles andere ist **reiner Hinweis**. Wegklicken eines Sensibel-Flags **nur mit Pflicht-Begründung** (pro Zitat, BT sieht sie). Gate adhoc+Editor identisch ([gate.ts](src/lib/checker/gate.ts)).
- **Re-Check-UX**: stabile `violation.id` (`section::normalize(quote)`), Merge statt Reset, „Neu seit letzter Prüfung"-Badge, Erledigt-Klappblock, Fortschrittsleiste, optionaler Re-Check; Reload-Persistenz des Review-States (localStorage). KI-Wiederholungs-Schleife (`previouslyAddressed`) blockt nicht mehr.
- **Soft-Hinweise** = gleichwertige Cards (Bernstein), „Passt schon" statt Checkbox.
- **Inhaltliche Hinweise** (deterministisch, [hints.ts](src/lib/checker/hints.ts)): zu dünne/floskelhafte Abschnitte + fehlende Pflichtbausteine als Cards.
- **Konkretheit**-Block erscheint nur bei aktionablen (`missing`) Proben.
- **Schnell-Check ist jetzt reines Prüf-Tool** (kein Einreichen mehr; adhoc-Submit-Pfad gelöscht). Berichte hängen nur über den **Kurs-Editor** am Kunden ([[project_ber_coupling_and_pdf]]).
- **„PDF herunterladen"** im Kurs-Editor (echter Download, coach-Route `/api/coach/abschlussberichte/[berId]/pdf`). Alter „Als Erango-PDF exportieren" entfernt. Popup-Blocker-Fix: Tab synchron im Klick öffnen.
- **Maßnahmetyp-Bug** (2-teilig): (1) Editor reicht `courses.massnahmeTyp` durch (kein Picker); (2) **`anonymize()` droppte `massnahmeTyp`** → Check fiel in Prod immer auf EKC zurück — jetzt durchgereicht. EGC/ESCA-Kunden werden korrekt geprüft.
- **„Aus Terminen vorbefüllen"** fürs ablauf-Feld (deterministisch aus `sessions.topic`) ([[project_ablauf_prefill]]).

**Abschluss-Flow auf 4 Coach-Schritte gestrafft** ([[project_abschluss_flow_4_steps]] — macht CLAUDE.md-Workflow Schritt 8+10 veraltet):
- Raus: „Preview an Teilnehmer senden" (TN gibt in-flow frei, Sign-Seite zeigt das schon bei `approvalGate=ready`) und „Nachweis abschließen" (Coach-Seal).
- **BT-Prüfungs-Freigabe = Abschluss**: `approveCourseReview` erzeugt das `final_documents` (Bridge, einfache Signatur, kein FES) → Kurs erscheint in der AfA-Übermittlung. Stale-Schutz: Übermittlungs-Liste filtert auf `reviewStatus='approved'`.
- `sealCourse`+FES bleiben im Code für später (Button kommt nur per BT-Checkbox „FES erforderlich", wenn FES live).

**Stundennachweis-Fixes:**
- Signatur-/Audit-Zeitstempel jetzt **Europe/Berlin** (vorher UTC = 1–2 h zu früh auf dem rechtlichen Dokument).
- **„Ort, Datum"-Zeile über der Coach-Unterschrift** (Ort = `course.durchfuehrungsort`).

**Offen / als Nächstes:**
- [ ] **Live gegentesten** (Prod, Testdaten): kompletter Coach→BT→AfA-Pfad (neuer 4-Schritte-Flow); „PDF herunterladen" (Popup-Fix — falls Tab mit Fehler statt PDF aufgeht → Puppeteer-Route prüfen); EGC-Kunde re-checken → Gründungs-Pflichtbausteine statt EKC.
- [ ] **„Ort" auf dem ANW bestätigen**: aktuell `Durchführungsort`. User wollte ggf. „Stadt vom Coach" — falls andere Quelle gewünscht, umstellen (kein Coach-Stadt-Feld im Schema).
- [ ] **Coach-Anleitung Modul B** (PDF/Doku) ist veraltet: beschreibt noch „aus Schnell-Check einreichen" — gibt's nicht mehr.
- [ ] **Kosmetik-Sweep**: BT-/Print-/Mail-Flächen sagen teils noch „Verstöße" statt „Hinweise/Sensibel" (Daten unverändert).
- [ ] **EGC/ESCA-eigene Konkretheits-Proben** (z.B. Tragfähigkeit/Finanzierung/Gewerbe) — fachlich vom User mitzudefinieren.
- [ ] **FES**: noch gemockt; Seal-Button kommt erst per BT-Checkbox + FES live (User gibt Bescheid).
- [ ] **DATENSCHUTZ-TODO.md** (Repo-Root, untracked): AVV-Checkliste + Drittlandtransfer + DSFA + DSGVO-Erklärung vor echtem Go-Live.

### 2026-06-28 (PRs #112–#116) — BT-Kunden-Cockpit + AfA-Marker + CI grün
> Hinweis: bewusst während des Freeze gebaut, vom User explizit gewünscht
> („BT-Dashboard nicht launch-kritisch für morgen").
- **#112** **BT-Kunden-Cockpit**: die `/bildungstraeger/courses`-Seite ist jetzt
  die zentrale Übersicht pro Kunde — `Kundenname · Maßnahmentyp` zuerst, Suche
  nach Kunde/Kd-Nr./Coach/Status, Status-Matrix **ANW** (FES-Gates+Siegel/AfA,
  abgeleitet in neuer DB-freier Lib [anw-status.ts](src/lib/anw-status.ts)) +
  **BER** (draft/submitted) + AfA-Badge, PDF-Downloads, Verwalten/Archivieren/
  Löschen. Dashboard-Widget „Abschlussberichte — Fortschritt" entfernt (eine
  Wahrheit). Löschen gehärtet: Kundenname tippen + serverseitige Namensprüfung.
- **#113** **ANW-PDF für BT herunterladbar**: der gespeicherte `pdfUrl` zeigt auf
  den coach-scoped Endpoint (`requireCoach`) und wies den BT ab. Neuer Weg analog
  zum BER-PDF: BT-Print-Seite `/bildungstraeger/courses/[id]/print/[participantId]`
  (tenant-scoped, rendert geteilte `<Stundennachweis>`) + Route
  `/api/bildungstraeger/courses/[id]/anw-pdf` (nur bei `fes_status='completed'`).
  Cockpit + Submissions verlinken jetzt diese Route.
- **#114→#115** **AfA-„übermittelt" = manueller Haken** (nicht Coming-soon).
  Erst nach versehentlichem Klick kurz via Flag gesperrt (#114), dann auf
  User-Wunsch wieder an (#115): ehrliche Beschriftung „Als übermittelt markieren"
  + zweistufiger Confirm gegen Fehlklicks. Flag `AFA_SUBMISSION_ENABLED`
  ([feature-flags.ts](src/lib/feature-flags.ts)) bleibt als Kill-Switch. Echter
  Versand erst mit Rechnungs-Feature ([[project_afa_submission_disabled]]).
  **Prod-Datensatz** (1× versehentlich „submitted") wurde direkt in der Prod-DB
  auf `pending` zurückgesetzt + verifiziert (0 offen).
- **#116** **CI wieder grün**: `main` war seit ~16:49 rot —
  `@next/next/no-html-link-for-pages` (`<a>`→`<Link>`) im „Abbrechen"-Link von
  [course-form.tsx](app/bildungstraeger/courses/new/course-form.tsx). + Unit-Tests
  für `anw-status` (7). **Achtung:** die direkt (ohne PR) auf main gepushten
  `feat(anw)`-Commits (Logo/Name auf Stundennachweis) liefen über die rote CI —
  jetzt grün.

### 2026-06-28 (direkt auf main, ohne PR) — Checker optional + Nav + ANW-Logo
> Folge-Fixes aus der Multi-Coach-Runde, direkt gepusht (liefen über die damals
> rote CI, jetzt grün via #116). Lint/Build im grünen #116-Lauf mit drin.
- **`fc80e91`** **BER-Checker rein beratend**: Einreichen ist immer möglich
  (sanfte Rückfrage bei offenen Hinweisen). Einzige Hürde = `hard_block`
  (Art-9/Gesundheit, harte Prognose) → Pflicht-Begründung (Client-Box +
  Server-Defense via Snapshot `readHardBlocks`); alter `lastCheckPassed`-Gate
  raus. Details: „Offen #4" + Memory [[project_abschlussbericht_checker]].
  **Außerdem Nav-Fix**: BER-Editor (liegt unter `/coach/courses`) wird in der
  Coach-Nav korrekt als „Berichts-Checker" statt „Signatur" markiert
  ([coach-tool-nav.tsx](src/components/coach-tool-nav.tsx), Regex-Override).
- **`eeb5d00` / `6ee8aab`** **BT-Logo auf der ANW/Stundennachweis**
  (tenant-scoped via `getBranding`), zentral in `loadStundennachweisSheet`
  geladen → Coach-/BT-Print + Sign-Seite + PDF (Puppeteer rendert Coach-Print).
  Fallback ohne Logo = **BT-/Tenant-Name als Text**; ohne beides Header
  unverändert. Erango-Logo ist hochgeladen + sichtbar (User bestätigt).

### 2026-06-28 (PRs #105–#110)
- **#105** Session-Formular verliert keine Eingaben mehr bei Validierungsfehler
  (React-19-Form-Reset → Action echot die Werte zurück, Form seedet daraus
  `defaultValue`/`defaultChecked`). + neue Stat „Geplante UE" auf der Kursseite.
- **#106** Disabled-Buttons ohne Hover-State (`hover:bg-*` → `enabled:hover:bg-*`,
  Sweep über 34 Buttons). Konvention: [[ui_no_hover_on_disabled]].
- **#107** Coach kann auf BT-**Nachbesserung antworten** (resubmit-Antwortfeld
  prominent offen, Flow zurück zum BT) + Dashboard-Banner/Badge „Nachbesserung
  angefordert". (Antwort lebt auf der **Coach**-Seite, nicht der BT-Review-Seite.)
- **#108** Review-Mail (Freigabe/Nachbesserung) geht an **ALLE** Team-Coaches
  statt nur den primären (`courseCoachRecipients`, dedupliziert).
- **#109** Eignungs-Häkchen im PDF waren unsichtbar — Unicode `☒/☐` fehlen im
  Vercel-Chromium-Font → jetzt CSS-gezeichnet. Lektion: [[pdf_no_unicode_symbols]].
  + restliche „gesiegelt"-Wordings entfernt (Bridge-Modus).
- **#110** Kompetenzteam-Zugriff für BER (Editor+Print), Checker & TN-Edit
  (`courses.coach_id` → `courseVisibleToCoach`); Ad-hoc-BER bleibt Autor-eigen.

### 2026-06-26 (PRs #102/#103) · [[project_einfache_signatur_bridge]]
- **#102** Bridge-Modus: einfache Signatur als ehrlicher Standard statt
  gemocktem FES; Switch später via `FES_MODE=live` + Live-PAdES in `sealWithFes`.
  Öffentliche Claims „FES in Vorbereitung". Coach-PDF lädt direkt herunter.
- **#103** Kunden-E-Mail-Änderung revoked alte Magic-Links + Coach-Badge/Mail.

## ⏭️ Offen vor dem Freeze

> **Stand 2026-06-29 (Launch-Tag), Klärung mit User:** #1 ✅ verifiziert
> (User: „sieht super aus"). #2 ✅ auf Prod read-only verifiziert sauber.
> Es bleiben **3 echte „vor-echten-TN-Daten"-Punkte**: #3 (Storage privat),
> #6 (Datenschutz-Wording) und aus #5 **nur das IONOS-Secret** (begründet,
> weil einmal im Screenshot exponiert) — Neon-PW/R2 sind reine Hygiene.
> Keiner davon blockiert die App-Funktion; alle drei sind noch NICHT erledigt.

1. ✅ **Eignungs-PDF visuell geprüft** (#109) — vom User am 2026-06-29 bestätigt
   („sieht super aus"). ++/O/-- + Ja/Nein-Häkchen rendern.
2. ✅ **`course_coaches`/`sessions.coach_id` auf Prod verifiziert** (2026-06-29,
   read-only gegen `ep-crimson-mode`): Tabelle + Spalte existieren, **3 aktive
   Kurse, 0 ohne Team-Zeile, 0 Sessions ohne `coach_id`**. Migration ist live,
   BT-Zuweisung schreibt die Zeilen. War überholte Sorge ([[project_multi_coach_per_course]]).
3. ⏳ **OFFEN — Vercel-Blob-Fallback** ist `access:"public"` ([storage.ts](src/lib/storage.ts)).
   Heißt: Unterschriftenbilder sind per (zufälliger, aber unsignierter) URL
   ohne Login abrufbar — für personenbezogene Signaturen DSGVO-schwach. Vor
   echten TN-Daten auf privat/signierte URLs (R2 privat) umstellen. Kein Bug,
   Härtung. *(Claude kann das als PR vorbereiten — User wollte heute entscheiden.)*
4. **BER-Checker ist jetzt rein beratend** (geändert nach #110) — der alte
   `lastCheckPassed`-Gate ist raus. Hinweise/Verstöße/fehlende Pflichtbausteine
   blockieren das Einreichen NIE; einzige Hürde sind **Hard-Blocks** (Art-9/
   Gesundheit, harte Prognose), die eine Override-Begründung verlangen
   (Client + Server-Defense-in-Depth via Snapshot,
   [bericht/actions.ts](app/coach/courses/[id]/teilnehmer/[tnId]/bericht/actions.ts)).
   Offen: serverseitige Re-Validierung des Hard-Blocks gegen Azure, sobald
   live (aktuell vertraut der Server dem mitgeschickten Snapshot).
5. ⏳ **OFFEN (priorisiert) — Secret-Rotation.** Konkret begründet ist **nur das
   `IONOS_PROXY_SHARED_SECRET`** (einmal im Screenshot exponiert →
   [[project_shared_secret_rotation]]) — das vor Echtbetrieb rotieren. Neon-PW +
   R2-Creds sind reine Hygiene, optional gebündelt
   ([[project_secret_rotation_batch]], [[project_db_password_rotation]]).
6. ⏳ **OFFEN — Datenschutzerklärung** beschreibt noch **FES-Siegel/D-Trust +
   „gesiegelte PDFs"** als laufende Verarbeitung ([datenschutz/page.tsx](app/(legal)/datenschutz/page.tsx)),
   obwohl im Bridge-Modus nur **einfache Signatur** läuft (D-Trust verarbeitet
   noch nichts). Muss beschreiben, was TATSÄCHLICH passiert → Wording auf
   „einfache elektronische Signatur" / FES „in Vorbereitung". Rechtstext, final
   mit DSGVO-Beratung. *(Claude kann den Entwurf anpassen.)*

Erledigt/getestet: PDF-Direkt-Download (#102) ✓, E-Mail-Änderung-Flow (#103) ✓,
Nachbesserung-Antwort + Multi-Coach-Mail/-Zugriff (#107/#108/#110) ✓ (User).

## CLAUDE.md-Drift
CLAUDE.md beschreibt noch „FES-Gate 3/3 → Mit FES versiegeln" als finalen
Schritt. Real ist es seit #102 „Nachweis abschließen (einfache Signatur)".
Bei größerem CLAUDE.md-Update mitziehen (Memory: [[project_einfache_signatur_bridge]]).

## Repo-Hygiene (offen, NICHT ungefragt machen)
~24 alte lokale Branches + die zugehörigen Remote-Branches (alle zu längst
squash-gemergten PRs) liegen noch rum — Remote-Branches wurden beim Merge nie
gelöscht. `staging` ist divergent (ahead 30/behind 15) — **nicht anfassen**.
Aufräumen (lokal + remote prunen) ist destruktiv → nur auf ausdrücklichen Wunsch.

## Umgebung & Ops — WICHTIG
- **`.env.local` zeigt auf Dev/Staging-Branch**, nicht Prod (`ep-crimson-mode-…`).
  Vor DB-Schreibern den Host prüfen ([[project_launch_and_envs]]).
- **Prod-DB-Schreiber nur mit explizitem User-OK** ([[project_neonctl_permission]]).
  `vercel env pull <tmp> --environment=production`, `DATABASE_URL` extrahieren,
  Host gegen `ep-crimson-mode` prüfen, `DATABASE_URL="$PRODURL" node scripts/…`,
  Temp sofort löschen. Apply-Scripts nutzen `dotenv override:false`.
- **Vercel-Env-Variablen sind „sensitive"** → `vercel env pull` zeigt sie leer,
  sie sind aber gesetzt. Nie über Pull verifizieren — über Live-Verhalten.
- **Migrations-Pattern:** SQL nach `drizzle/manual/<datum>-<name>.sql` (additiv +
  idempotent) + Apply-Script `scripts/apply-<name>-migration.mjs`.

## Workflow-Konventionen
- **Default: Branch + PR**, nicht direkt auf `main`
  (`gh pr merge <n> --squash --delete-branch`).
- Vor Commit/PR: `npm run typecheck`, `npm run lint`, `npm test` grün.
  **GitHub-Actions-CI erzwingt typecheck+lint+test** bei Push/PR auf main —
  rote CI = nicht mergen. ESLint mit zsh: Pfade direkt angeben.
- **CodeRabbit** reviewt jeden PR — Findings vor dem Merge einarbeiten.
- Tests: Vitest (`vitest run`), reine Logik in `src/**/*.test.ts` (KEINE DB-/
  `server-only`-Importe).
- Commit-Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- PR-Footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Next.js ist modifiziert — siehe `AGENTS.md`, ggf. `node_modules/next/dist/docs/`.

## Nicht vergessen
- Schreibende Aktionen während Impersonation **hart blockiert**
  (`assertNotImpersonating(session)` in jeder mutierenden Action).
- Jede Coach-Query serverseitig tenant-/coach-scoped filtern (nicht auf UI verlassen).
