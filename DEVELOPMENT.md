# Release-Manifest — VOR JEDEM PUSH LESEN

> **Stand: ab 2026-06-30.** `main` = `signflow.coach` = **100+ echte User mit echten AfA-Daten.**
> Ein kaputter Deploy oder eine zerstörerische Migration trifft sofort reale
> Teilnehmer, Coaches und Bildungsträger. Wir arbeiten ab hier auf Senior-Niveau:
> **nichts geht nach `main`, was nicht vorher auf Staging verifiziert wurde.**

Verwandte Docs: [STAGING.md](STAGING.md) (Topologie, IDs, How-to) · [docs/backups.md](docs/backups.md) (Backups).

---

## 0. Die goldene Regel

```
Feature-Branch  →  Staging (verifizieren)  →  PR nach main  →  Prod-Deploy
```

Kein direkter Commit/Push auf `main`. Kein „schnell mal" auf Prod. Kein
Schema-Change ohne Staging-Durchlauf + frisches Backup.

---

## 1. Branch-Modell

| Branch | Rolle | Deployt auf |
|---|---|---|
| `main` | **Production.** Geschützt. Nur via PR. | `signflow.coach` (Vercel Production) |
| `staging` | Spiegel von `main` + zu testende Features | `signflow-git-staging-…vercel.app` + Neon `staging`-Branch |
| `feat/*`, `fix/*` | Arbeit | Vercel Branch-Preview (eigene URL) |

`staging` wird **regelmäßig auf `main` zurückgesetzt** (`git reset --hard origin/main`),
damit es ein echter Spiegel bleibt und nicht divergiert.

---

## 2. Der Weg jeder Änderung

1. `git checkout main && git pull`
2. `git checkout -b feat/<name>` — **nie** direkt auf `main`/`staging` entwickeln.
3. Bauen. Lokal grün machen: `npm run typecheck && npm run lint && npm test && npm run build`.
4. **Bei DB-Änderung:** idempotentes Migrations-Script + SQL nach `drizzle/manual/`
   (siehe §3). Zuerst NUR auf den Neon-`staging`-Branch anwenden.
5. Nach Staging deployen (`git checkout staging && git merge feat/<name> && git push`)
   und **manuell smoke-testen** auf der Staging-URL (Login + die geänderten Flows).
6. **Pre-Push-Checkliste (§4) durchgehen.**
7. PR `feat/<name>` → `main`. CI (typecheck/lint/test) muss grün sein.
8. Merge → Vercel deployt Prod. **Bei DB-Änderung: Migration auf Prod VOR/passend
   zum Deploy** (siehe §3, Reihenfolge).
9. Prod-Smoke-Test (die geänderten Flows einmal echt klicken).

---

## 3. Datenbank-Migrationen (das größte Risiko)

- **Immer idempotent** (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, Backfill mit
  `WHERE … IS NULL`). Script nach `scripts/apply-<feature>-migration.mjs` + SQL-Spiegel
  nach `drizzle/manual/JJJJ-MM-TT-<feature>.sql`. (Kein `drizzle-kit push` auf Prod.)
- **Staging zuerst.** Auf den Neon-`staging`-Branch anwenden, App auf Staging testen.
- **Reihenfolge Prod (kritisch):**
  - *Additive* Änderung, die der neue Code beim Lesen braucht (neue Spalte/Tabelle):
    **erst Migration, dann Deploy.** Sonst 500 auf jeder betroffenen Seite.
  - *Entfernende* Änderung (Spalte/Tabelle weg): **erst Deploy** (Code nutzt sie nicht
    mehr), **dann** Migration — und nur nach frischem Backup.
- **Zerstörerisch (DROP/DELETE/ALTER TYPE/NOT NULL nachträglich)** nur mit:
  1. frischem Prod-Dump (siehe [docs/backups.md](docs/backups.md)),
  2. explizitem User-OK,
  3. Rollback-Plan.
- **`.env.local` zeigt NIE auf Prod** (historischer Bug). Vor jeder Migration den
  maskierten DB-Host loggen (das Script tut das) und gegen [STAGING.md](STAGING.md) prüfen.

---

## 4. Pre-Push-Checkliste (vor PR nach `main`)

```
[ ] Auf feat/*- oder fix/*-Branch gearbeitet (nicht direkt main/staging)
[ ] npm run typecheck  → grün
[ ] npm run lint       → grün
[ ] npm test           → grün
[ ] npm run build      → grün (CI baut NICHT — lokal Pflicht)
[ ] Schema/Migration? → idempotentes Script + SQL in drizzle/manual/ vorhanden
[ ] Migration auf Neon-staging angewendet + verifiziert
[ ] Auf Staging-URL deployt + die geänderten Flows manuell smoke-getestet
[ ] Migration-vor/nach-Deploy-Reihenfolge für Prod geklärt (§3)
[ ] Bei DB-Änderung: frisches Prod-Backup liegt vor
[ ] Rollback-Plan im Kopf (Revert-Commit / Down-SQL)
```

Wenn ein Punkt nicht abgehakt ist: **nicht pushen.**

---

## 5. Verboten (rote Linien)

- ❌ Direkt auf `main` committen/pushen.
- ❌ Auf der Prod-DB schreiben/migrieren ohne Backup **und** User-OK.
- ❌ Prod-Daten nach Staging kopieren (DSGVO — Staging ist synthetisch).
- ❌ Secrets im Code/Commit. Secrets nur in Vercel-Env / `.env.local` (gitignored).
- ❌ Prod-Secret in Staging recyceln (eigenes `BETTER_AUTH_SECRET` je Env).
- ❌ Deploy am Freitagnachmittag/vor Abwesenheit ohne Not.

---

## 6. Hotfix (wenn Prod brennt)

Auch dann **kein** Blind-Push. Minimaler Pfad:
1. `git checkout -b fix/<name>` von `main`.
2. Kleinstmöglicher Fix, lokal `typecheck/lint/test/build` grün.
3. Wenn möglich 2-Minuten-Staging-Check; wenn der Brand das nicht zulässt:
   im PR explizit „Hotfix, Staging übersprungen" + sofort danach Prod-Smoke-Test.
4. Merge → Deploy → verifizieren → Post-Mortem-Notiz.

---

## 7. Backups

Prod-DB wird **2×/Woche** logisch gedumpt und verschlüsselt auf IONOS abgelegt
(unabhängig von Neons 24-h-PITR). Details, Mechanismus, Restore-Test:
[docs/backups.md](docs/backups.md). Vor jeder zerstörerischen Migration zusätzlich
ein **ad-hoc** Dump.

---

## 8. Rollback

- **Code:** `git revert <merge>` → Push → Vercel redeployt den alten Stand. Oder im
  Vercel-Dashboard „Instant Rollback" auf den letzten guten Deploy.
- **DB:** additive Migrationen sind vorwärtskompatibel (alter Code ignoriert neue
  Spalten) → meist reicht Code-Rollback. Für zerstörerische Änderungen: Restore aus
  dem letzten Dump auf einen Neon-Branch, Daten zurückspielen.

---

## 9. Lokale Guardrail (pre-push-Hook)

Ein Hook in `.githooks/pre-push` blockt direkten Push auf `main`. **Einmalig pro
Klon aktivieren:**

```bash
git config core.hooksPath .githooks
```

Notfall-Override (nur echter Hotfix): `git push --no-verify`. Der Hook ist eine
Erinnerung, kein Ersatz für GitHub-Branch-Protection — `main` sollte zusätzlich
serverseitig gegen Direkt-Push geschützt werden (Settings → Branches).
