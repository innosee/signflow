# Testplan: Access-Control & Beziehung Bildungsträger → Coach → Kunde

> Ziel: sicherstellen, dass Änderungen (z. B. die Security-Fixes aus PR #133–#137)
> die Mandanten-Isolation, die Zuweisung von Kunden/Coaches und den E-Mail-/
> Magic-Link-Versand **nicht** kaputt machen. Der Fokus liegt auf der Logik, die
> heute **keine** Tests hat und gleichzeitig am gefährlichsten ist.

Stand: 2026-07-03.

---

## 1. Warum die bestehenden Tests nicht reichen

Die vorhandenen Tests (`sign-state`, `abschluss-status`, `anw-status`,
`avgs-stage`, `termine-pro-woche`, `course-form`, `checker/*`) prüfen **reine
Funktionen** ohne Datenbank. Das ist gut und soll bleiben.

Die Access-Control lebt aber woanders: in **SQL-`WHERE`-Bedingungen** in
[`src/lib/course-access.ts`](../src/lib/course-access.ts),
[`src/lib/dal.ts`](../src/lib/dal.ts),
[`src/lib/participant-tokens.ts`](../src/lib/participant-tokens.ts) und den
Server Actions unter `app/bildungstraeger/**` und `app/coach/**`. Ob ein
Bildungsträger die Kurse eines fremden Mandanten sieht, hängt an genau diesen
`WHERE`-Klauseln, und die kann man **nur gegen ein echtes Postgres** testen.
Beispiele:

- `courseVisibleToCoach()` = korrelierte `EXISTS`-Subquery auf `course_coaches`.
- BT-Isolation = Filter über `getTenantId(session)`, wobei `courses` **keine**
  eigene `tenant_id` hat, sondern der Mandant sich über den Coach ableitet.
- `resolveParticipantToken()` = 3 Joins mit 1:1-Defense.

Diese Ableitungen sind die realen Bruchstellen. Ein Unit-Test mit gemocktem
`db` würde nur den Mock testen, nicht die Wahrheit.

---

## 2. Teststrategie: drei Ebenen

| Ebene | Was | Womit | Läuft |
|---|---|---|---|
| **L1 – Unit** | Reine Logik (Datum, Status, Gates, Formvalidierung) | vitest, kein DB | schon da, ausbauen |
| **L2 – Integration** | Access-Control, Zuweisung, Token-Auflösung, Isolation | vitest **gegen echtes Postgres** | **NEU – höchster Wert** |
| **L3 – E2E** (optional, später) | Vollständige Klick-/Mail-Flows | Playwright gegen Staging | Phase 2 |

Der Kern dieses Plans ist **L2**. L3 ist nice-to-have für die echten
Mail-Zustell-Flows, aber teuer und langsam; die entscheidende Sicherheit gegen
„wir brechen die Isolation" liefert L2.

---

## 3. Test-Datenbank: Empfehlung

**Empfohlen: PGlite (in-process Postgres) für L2 auf jedem PR, plus optional ein
nächtlicher Lauf gegen einen Neon-Branch für volle Fidelity.**

| Option | Vorteil | Nachteil | Einsatz |
|---|---|---|---|
| **PGlite** (`@electric-sql/pglite`) | Läuft im Prozess, kein Docker, schnell, kein Secret in CI. Drizzle-kompatibel. | Nicht 100 % byte-identisch zu Neon (aber es *ist* Postgres). | **Standard, jeder PR** |
| **Neon Ephemeral Branch** | Produktionsidentisch, ihr habt die Neon-CLI schon. | Netzabhängig in CI, Branch-Lifecycle + Secrets nötig. | **Nächtlich / vor Release** |
| Testcontainers (Docker-PG) | Echtes PG, hermetisch. | Docker in CI nötig, langsamer als PGlite. | Alternative zu PGlite |

Warum diese Kombi: PGlite hält die PR-Schleife schnell und infrastrukturfrei
(wichtig, weil eure CI heute bewusst ohne `DATABASE_URL` läuft). Der nächtliche
Neon-Lauf fängt die seltenen Fälle, in denen sich PGlite und Neon-Postgres
unterscheiden. **Wichtig:** Tests laufen nie gegen Prod oder Staging-Daten, immer
gegen eine frische Wegwerf-DB, die pro Testlauf aus `src/db/schema.ts` migriert
und danach verworfen wird.

---

## 4. Die Test-Welt (Fixtures / Factories)

Damit die Fälle lesbar bleiben, wird pro Test eine bekannte Welt aus kleinen
Factory-Funktionen aufgebaut. Vorschlag für `src/test/factories.ts`:

```
makeTenant(name)                         → tenants-Zeile
makeBildungstraeger(tenant, {owner?})    → users(role=bildungstraeger)
makeCoach(tenant)                        → users(role=coach)
makeParticipant(tenant, {email?})        → participants
makeCourse(tenant, coach, participant)   → courses(coach_id, participant_id)
addToTeam(course, coach)                 → course_coaches
issueMagicLink(course, participant)      → participant_access_tokens (+ Klartext)
signSession(session, signer)             → signatures
```

Darauf baut eine kanonische **Zwei-Mandanten-Welt**, die fast jeder
Isolations-Test wiederverwendet:

```
Tenant A (Bildungsträger "Alpha")
  BT-A1  = Owner (ältester aktiver BT-User)
  BT-A2  = eingeladener BT-Kollege (NICHT Owner)
  Coach  CA1, CA2
  Kunde  PA1, PA2
  Kurs   KA1 (Coach CA1, Kunde PA1, Team = [CA1])
  Kurs   KA2 (Coach CA2, Kunde PA2, Team = [CA2, CA1])

Tenant B (Bildungsträger "Beta")
  BT-B1  = Owner
  Coach  CB1
  Kunde  PB1
  Kurs   KB1 (Coach CB1, Kunde PB1, Team = [CB1])
```

Die Kernfrage jedes Isolations-Tests lautet dann immer:
**„Kann ein Akteur aus A etwas mit den Daten aus B tun?" – Antwort muss überall NEIN sein.**

---

## 5. Der Fall-Katalog

Legende: **⛔** = muss verweigert werden · **✅** = muss erlaubt sein · **↻** = Regressionstest zu einem der Fixes.

### A. Coach-Datenisolation (`coachCanAccessCourse`, `courseVisibleToCoach`)

- ✅ CA1 öffnet KA1 (ist im Kompetenzteam) → Zugriff
- ✅ CA1 öffnet KA2 (Team = [CA2, CA1]) → Zugriff
- ⛔ CA2 öffnet KA1 (nicht im Team, gleicher Tenant) → verweigert
- ⛔ CB1 öffnet KA1 (fremder Tenant) → verweigert
- ✅ Primär-Coach sieht seinen Kurs auch ohne `course_coaches`-Zeile (Backfill-Sicherheitsnetz: nur `courses.coach_id` gesetzt)
- ⛔ Zugriff auf soft-gelöschten Kurs (`deleted_at` gesetzt) → verweigert
- ⛔ **IDOR pro schreibender Action**: CA2 ruft eine mutierende Coach-Action mit KA1-ID direkt auf (nicht über die UI) → verweigert (jede Action, die `requireOwnedCourseId`/`coachCanAccessCourse` nutzt, einzeln)
- ✅ Team-Coach darf Schritte auslösen, aber ⛔ nur eigene Termine signieren (`sessions.coach_id`)

### B. Bildungsträger-Datenisolation (`getTenantId`-Scoping)

- ✅ BT-A1 sieht im Cockpit nur Kurse/Coaches/Kunden von Tenant A
- ⛔ BT-A1 liest/mutiert KB1 per direkter ID (IDOR) → verweigert
- ⛔ BT-A1 sieht Coach CB1 oder Kunde PB1 nicht in irgendeiner Liste
- ✅ Der über den Coach abgeleitete Tenant stimmt: ein Kurs von CA1 zählt zu Tenant A (da `courses` keine eigene `tenant_id` hat, ist das die Bruchstelle → explizit testen)
- ⛔ Filter/Suche im Cockpit gibt nie eine fremd-Tenant-Zeile zurück, egal welcher Suchstring

### C. Owner vs. eingeladener BT & Impersonation (`isTenantOwner`, `impersonateCoach`)

- ✅ BT-A1 (Owner) impersonatet CA1 → erlaubt, landet als Coach
- ⛔ BT-A2 (eingeladen, nicht Owner) impersonatet CA1 → `not_owner`
- ⛔ BT-A1 impersonatet CB1 (fremder Tenant, per UUID-Manipulation) → `unknown` (Tenant-Filter greift)
- ⛔ BT-A1 impersonatet einen gebannten Coach → `banned`
- ✅ Owner-Ableitung: ältester aktiver BT-User ist Owner; wird BT-A1 gelöscht, rückt der nächst-älteste nach
- ⛔ Während Impersonation sind schreibende Actions blockiert (`assertNotImpersonating`) – Stichprobe über Signatur/Siegel/Submit
- ↻ **Regression zu PR #137**: roher `POST /api/auth/admin/list-users` mit BT-Session → **404** (vorher: Userliste). Ebenso `/impersonate-user`, `/set-user-password`, `/create-user`, `/remove-user` → 404
- ↻ **Regression zu PR #137**: `impersonateCoach` (Server Action) funktioniert weiter, `createUser` (Coach-/BT-Einladung) funktioniert weiter

### D. Zuweisung von Kunden & Coaches (das Herzstück deiner Frage)

- ✅ BT legt Kurs an → `courses.coach_id` + `participant_id` gesetzt, `course_coaches`-Zeile für den Primär-Coach existiert
- ✅ BT fügt zweiten Coach zum Kompetenzteam → beide bestehen `coachCanAccessCourse`
- ✅ BT entfernt einen Team-Coach → dessen Zugriff ist danach ⛔
- ⛔ BT weist einen Coach aus **fremdem** Tenant einem Kurs zu → verweigert (Tenant-Konsistenz)
- ⛔ Kunde (participant) kann nicht doppelt an denselben aktiven Kurs gebunden werden (1:1-Modell: `courses.participant_id`)
- ↻ **`deleteCoach`-Guard (Review-Finding M1)**: Coach, der nur als Team-Coach zugewiesen ist und Termine gehalten/signiert hat, lässt sich **nicht** stillschweigend soft-löschen → Fehler `COACH_HAS_SESSIONS` bzw. Team-Zuweisung blockt
- ✅/⛔ Budget/UE-Zuweisung: verplante UE dürfen `anzahl_bewilligte_ue` nicht überschreiten (harte Grenze); Randfall „genau am Limit" erlaubt, „ein UE drüber" ⛔

### E. E-Mail & Magic-Links (`sendParticipantInvite`, `resolveParticipantToken`, Coach-Invite)

- ✅ Coach-Einladung → Reset/Onboarding-Mail geht an **genau** die Coach-Adresse; Link löst auf den richtigen User auf
- ✅ TN-Magic-Link → Mail geht an **genau** `participants.email`; Token löst **nur** die Paarung (KA1 × PA1) auf
- ⛔ Token von KA1 löst **nicht** KA2 oder KB1 auf (Kurs-Scope + 1:1-Defense)
- ⛔ Token eines Kunden gibt **nie** die Daten eines anderen Kunden aus (kein Cross-Leak in `ResolvedToken`)
- ⛔ Abgelaufener Token (> 7 Tage, `expires_at` in der Vergangenheit) → `resolveParticipantToken` = `null`
- ✅ Mehrere gleichzeitig gültige Links pro Paarung koexistieren (aktuelles Verhalten seit 2026-06-19), alle zeigen auf denselben Stand
- ✅ Token wird **nur als SHA-256-Hash** in der DB gespeichert (Klartext existiert nur in der Mail) → DB-Zeile enthält nie den Klartext
- ✅ **Bulk-Notify** (`autoNotifyAllParticipants` / `notifyParticipants`): jeder TN bekommt seinen **eigenen** Link, kein Link-Cross-Contamination; ein Fehlschlag bei TN 1 stoppt nicht TN 2..n (Review M3)
- ✅ BT ändert Coach-E-Mail → alte Reset-Links werden revoked, Coach wird benachrichtigt (Empfänger-Korrektheit)
- ⛔ TN-E-Mail-Eindeutigkeit ist **pro Tenant** (`unique(tenant_id, email)`): dieselbe Adresse darf in Tenant A und B existieren, aber nicht 2× in Tenant A → an der Anlage testen
- ↻ **Regression zu PR #133**: fehlt der Anonymizer-Proxy in Prod-Simulation, bricht der Checker ab statt Klartext zu senden (Client wirft + Server-Route 503)

### F. Session-, Token- & Impersonation-Härtung

- ✅ Soft-gelöschter User verliert die Session sofort (`requireSession` → redirect `/login`)
- ✅ `getTenantId` wirft bei fehlendem `tenantId` (Schema-Drift-Schutz)
- ✅ `resolveActiveMembership`: genau eine Mitgliedschaft → diese; keine → Fallback auf `users.tenant_id/role`; offene (nicht angenommene) Einladung zählt **nicht**

### G. Regressionstests zu den offenen PRs (#133–#137)

Diese Fälle „einfrieren", was wir gerade repariert haben, damit es nicht
zurückfällt:

- ↻ **#133** Checker fail-closed (siehe E, letzter Punkt)
- ↻ **#134** Storage: in Prod-Simulation ohne `R2_ACCOUNT_ID` wirft `uploadSignature` statt public zu landen; Löschen/Auflösen von Bestands-Blob-URLs bleibt möglich
- ↻ **#135** Analytics-Script rendert **nicht** auf `/sign/*`; Cockpit-Suche trackt nur `qLength`
- ↻ **#136** Signatur-Re-Upload löscht den alten Blob **nur**, wenn keine `signatures`-Zeile ihn referenziert
- ↻ **#137** Admin-HTTP-Fläche 404 + BT-Rolle kann nur `impersonate`/`create` (siehe C)

---

## 6. Umsetzung in Schritten

1. **Harness**: `@electric-sql/pglite` + `drizzle-orm/pglite` als devDependency; ein
   vitest-Setup, das pro Testdatei eine frische DB aus `src/db/schema.ts` migriert
   (`pushSchema`/`migrate`) und danach verwirft. Separates `vitest.integration.config.ts`,
   damit L1 schnell bleibt.
2. **Factories** (`src/test/factories.ts`) + die Zwei-Mandanten-Welt aus §4.
3. **Erste Batch – höchster Wert zuerst**: Abschnitt A + B + C (Isolation +
   Impersonation), inkl. der #137-Regression. Das ist die Versicherung dafür,
   dass die Auth-Änderung nichts an den legitimen Flows bricht.
4. **Zweite Batch**: D + E (Zuweisung + E-Mail/Token). Für E-Mail wird der
   Resend-Client gemockt und nur geprüft, **an wen** mit **welchem Link/Token**
   gesendet würde (nicht real versendet).
5. **CI**: neuer Job `integration-tests` in `.github/workflows/ci.yml`, der die
   L2-Suite gegen PGlite fährt. Als **Required Status Check** in die
   Branch-Protection aufnehmen → dann kann kein PR die Isolation brechen und
   trotzdem nach `main` gemergt werden.
6. **Optional/später**: nächtlicher `workflow_dispatch`+`schedule`-Lauf derselben
   Suite gegen einen Neon-Wegwerf-Branch (volle Fidelity) und L3-Playwright für
   die echten Mail-Klick-Flows.

## 7. Regeln, damit die Tests selbst nichts kaputt machen

- Tests laufen **nie** gegen Prod/Staging, immer gegen eine frische Wegwerf-DB.
- Keine echten Mails: Resend-/SMS-Client im Test mocken.
- Der E-Mail-Assert prüft **Empfänger + Link/Token**, nicht den Versand.
- Deterministisch: feste Zeitstempel injizieren (kein `Date.now()` im Test-Pfad),
  damit Ablauf-Fälle stabil sind.
