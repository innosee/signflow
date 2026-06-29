# HANDOVER — Signflow (Stand 2026-06-29, Launch-Tag)

> Für eine **neue Claude-Session**. Lies zuerst `CLAUDE.md` + `AGENTS.md`. Die
> Auto-Memory unter `~/.claude/projects/.../memory/` lädt die referenzierten
> `[[…]]`-Einträge automatisch. Dieses Dokument ist der „Start here"-Überblick.
> **Scratch-Dokument** (untracked, nicht committet).

## ⚠️ Launch Montag 2026-06-29 — aktuell Feature-Freeze-Fenster
Echter Go-Live ist Montag. Ab jetzt **keine neuen Features** mehr, nur noch
Launch-kritische Fixes + Verifikation. Aktuell Testphase ohne echte Daten
([[project_launch_and_envs]], [[project_prod_testenv_reset]]).

## Letzte Sessions — alles gemergt in `main` + auf Prod (Vercel auto-deploy)

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
