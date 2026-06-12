# Prod-Go-Live Runbook — `feat/kunde-1zu1`

Bringt Production vom alten Modell auf **Kurs = Kunde (1:1) + Feiertags-Warnung +
Bildungsträger-Prüfung (FES-Gate 3/3)**. Die Prod-DB (`br-old-art-alnooacc`)
steht noch auf dem **alten Schema**. Neuer Code crasht gegen das alte Schema →
DB-Migration und Deploy sind **gekoppelt**.

> **Update (BT-Prüfung):** Der Branch enthält jetzt zusätzlich das Bildungsträger-
> Prüf-Gate vor FES — neue Enums (`course_review_status`,
> `course_review_note_author`, `course_review_note_kind`), vier Review-Spalten auf
> `courses` und die Tabelle `course_review_notes`. **Der eine `drizzle-kit push` in
> Step 3 deckt das mit ab** (er synct auf `src/db/schema.ts`). Das inkrementelle
> Script `scripts/apply-bt-review-migration.mjs` ist nur der Dev/Staging-Pfad,
> NICHT für Prod nötig.

## Strategie (aus dem Plan)

Signatur ist dark-launched/Pilot → **kein echter Bestand zu erhalten**,
**destruktiver Greenfield-Push erlaubt** (`refactored-jumping-spring.md`). Es gibt
**keine** committete Collapse-Migration; der Weg ist:

> **TRUNCATE der betroffenen Tabellen (Dependency-Reihenfolge) → ein einziger
> `drizzle-kit push`.** Dieser Push synct Prod auf `src/db/schema.ts` und deckt
> **Collapse + `bundesland` in einem** ab. `scripts/apply-bundesland-migration.mjs`
> ist auf Prod dann NICHT nötig (der Push legt die Spalte mit an; das Script ist
> nur der inkrementelle Pfad für Dev/Staging, die schon vorher collapsed waren).

⚠️ Jeder mit **`du`** markierte Schritt wird **von dir** ausgelöst — irreversibel
oder destruktiv. Claude bereitet vor, fasst diese Schritte aber nicht selbst an.

---

## Step 0 — Prod-Daten-Check (BLOCKER · du)

Entscheidet, ob der destruktive Push überhaupt erlaubt ist.

```bash
# Prod-Connection-String (Branch br-old-art-alnooacc; Project-ID vor Lauf bestätigen)
PROD_URL=$(npx neonctl connection-string <prod-branch> \
  --project-id <PROD_PROJECT_ID> --pooled --database-name neondb 2>&1 | tail -1)
```

Prüfen, ob **echte** (Nicht-Pilot-)Daten existieren:

```sql
SELECT count(*) FROM signatures;          -- echte Unterschriften?
SELECT count(*) FROM final_documents;      -- versiegelte Dokumente?
SELECT email FROM users WHERE role='bildungstraeger';  -- echte BT, kein *.test?
SELECT count(*) FROM courses;
```

- **Nur Pilot / leer** → destruktiver Push erlaubt, weiter zu Step 1.
- **Echte Daten vorhanden** → **STOP.** Greenfield-Annahme verletzt; es gibt kein
  daten-erhaltendes Migrationsscript. Separat planen, NICHT truncaten.

---

## Step 1 — Sicherheitsnetz: Prod-Snapshot (du)

Vor dem destruktiven Schritt einen Neon-Branch/Point-in-Time-Snapshot der Prod-DB
ziehen (Rollback-Anker — Truncate ist sonst final):

```bash
npx neonctl branches create --project-id <PROD_PROJECT_ID> \
  --name pre-collapse-$(date +%Y%m%d) --parent <prod-branch>
```

---

## Step 2 — Secret-Batch-Rotation (du · optional, aber so geplant)

Laut `secret_rotation_batch` / `db_password_rotation` gebündelt **kurz vor Prod**:
Neon-Passwort · `IONOS_PROXY_SHARED_SECRET` · R2-Creds rotieren und in den
**Vercel-Prod-Env-Vars** aktualisieren. Nach Neon-PW-Rotation den neuen
`DATABASE_URL` in Vercel (prod) setzen (Sensitive-Flag → `vercel env rm` +
`vercel env add`, nicht via Pull).

> Reihenfolge-Hinweis: Wenn du hier den Neon-User/das PW rotierst, danach mit dem
> **neuen** `DATABASE_URL` in Step 3 arbeiten.

---

## Step 3 — Prod-DB destruktiv migrieren (DESTRUKTIV · du)

TRUNCATE in Dependency-Reihenfolge, dann **ein** Push. Mit `PROD_URL` aus Step 0:

```sql
-- Reihenfolge: Kinder vor Eltern. Die wegfallenden Join-Tabellen
-- (course_participants, session_participants) werden vom Push gedroppt;
-- truncaten verhindert FK-Blockaden beim Umbau.
TRUNCATE TABLE
  signatures,
  participant_approvals,
  participant_access_tokens,
  abschlussberichte,
  final_documents,
  sessions,
  course_participants,
  session_participants,
  courses
RESTART IDENTITY CASCADE;
```

```bash
# Schema-Sync auf den aktuellen Stand von src/db/schema.ts (Collapse + bundesland)
DATABASE_URL="$PROD_URL" npx drizzle-kit push
```

**Verifizieren:**

```sql
-- Collapse: participant_id da + NOT NULL, Join-Tabellen weg
SELECT is_nullable FROM information_schema.columns
  WHERE table_name='courses' AND column_name='participant_id';   -- NO
SELECT to_regclass('course_participants'), to_regclass('session_participants'); -- beide NULL
-- Feiertage: bundesland-Spalte + Enum da
SELECT udt_name, is_nullable FROM information_schema.columns
  WHERE table_name='courses' AND column_name='bundesland';        -- bundesland / YES
-- BT-Prüfung: review_status-Spalte + Notiz-Tabelle da
SELECT udt_name FROM information_schema.columns
  WHERE table_name='courses' AND column_name='review_status';     -- course_review_status
SELECT to_regclass('course_review_notes');                        -- nicht NULL
```

---

## Step 4 — Merge → `main` + Deploy (du)

PR `feat/kunde-1zu1 → main` mergen → Vercel deployt Prod automatisch von `main`.

> **Kopplungs-Fenster:** Bei destruktivem Schema-Wechsel ist ein kurzes Fenster
> unvermeidbar, in dem altes Schema/Code und neues nicht zusammenpassen. Weil das
> Signatur-Modul **dark-launched** ist (`signing_enabled`-Flag, ~kein Prod-Traffic),
> ist das akzeptabel: Step 3 und Step 4 **direkt nacheinander** ausführen
> (DB-Migration zuerst, dann sofort mergen/deployen). Optional Maintenance-Hinweis
> für die wenigen Pilot-Coaches.

---

## Step 5 — Prod-Smoke-Test (du)

1. Login (BT + Pilot-Coach).
2. BT legt Kunde an — **Bundesland-Dropdown** ist Pflicht.
3. Coach legt Termin auf einen Feiertag → **weiche Warnung** erscheint, Anlage
   bleibt möglich.
4. Kurs-Detailseite → **Feiertags-Badge** am Termin.
5. Termin signieren · Magic-Link · TN-Signatur · Abschluss · TN-Freigabe.
6. **BT-Prüfung:** Coach reicht zur Prüfung ein → BT-Dashboard zeigt „zu prüfen" →
   BT öffnet `/bildungstraeger/reviews/<id>`, sieht die Vorschau, fordert einmal
   Nachbesserung an (Coach editiert, reicht neu ein), dann **Freigeben** → erst
   jetzt ist beim Coach der **FES-Button** frei → FES-Mock · PDF.

---

## Rollback

- **Code:** Merge reverten bzw. vorheriges `main`-Deployment in Vercel promoten.
- **DB:** Truncate ist final → Rollback nur über den **Snapshot aus Step 1**
  (Neon-Branch zurückspielen / Vercel-`DATABASE_URL` auf den Snapshot-Branch
  zeigen). Deshalb ist Step 1 nicht optional, wenn auch nur Pilot-Daten zählen.

---

## Offene Punkte vor dem Lauf

- [ ] **Prod-Neon-Project-ID** bestätigen (Staging ist `solitary-waterfall-77539790`;
      Prod-Branch ist `br-old-art-alnooacc` — Project-ID verifizieren).
- [ ] Step 0 ausgeführt, Ergebnis dokumentiert (Pilot/leer ↔ echte Daten).
- [ ] Idealerweise vorher Staging-e2e-Test (war OFFEN #1) — fängt Bugs vor Prod ab.
- [ ] **BT-Prüf-Flow auf Staging/Dev getestet** — das Feature ist neu und noch
      nirgends live durchgeklickt. Dev-Migration:
      `node scripts/apply-bt-review-migration.mjs`, dann den 6-Punkte-Smoke-Test
      (oben) durchspielen. Vor Prod erledigen.
