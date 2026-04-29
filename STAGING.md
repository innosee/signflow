# Staging-Setup

Eigene Sandkiste für riskante Änderungen — Multi-Tenant-Schema, Stripe-Wiring, Auth-Proxy für Blobs etc. — bevor sie auf `signflow.coach` (Production) gehen. Geteilte IONOS-Anonymizer-VM (CORS-Multi-Origin), eigener Neon-Branch, ausschließlich synthetische Testdaten.

## Topologie

```
Production           Staging
─────────            ───────
signflow.coach   ──► Vercel "production" env  ─► Neon `main` branch
preview-*.vercel.app  ►  Vercel "preview" env  ─► Neon `staging` branch
                                                   ▲
                                                   └─ identical schema, eigene Daten

Beide Environments rufen denselben IONOS-Anonymizer (anon.signflow.coach) —
der akzeptiert mehrere Origins via comma-separated `ALLOWED_ORIGIN`.
```

## Einmalige Einrichtung

Reihenfolge wichtig — IONOS zuerst, dann Vercel-Config, dann Seed.

### 1. Neon-Branch anlegen

Im Neon-Dashboard zum Signflow-Projekt → "Branches" → "Create branch" → von `main` aus → Name `staging`. Neon kopiert das Schema 1:1 inkl. Daten — den Daten-Stand schmeißen wir gleich weg.

Connection-String aus dem neuen Branch kopieren (Settings → Connection-String → "Pooled connection") — das ist der `STAGING_DATABASE_URL` für unten.

### 2. IONOS-Proxy: CORS-Multi-Origin

Auf der IONOS-VM die systemd-Unit-Env anpassen:

```bash
ssh signflow@anon.signflow.coach
sudo systemctl edit anon-proxy
```

Im Override:

```
[Service]
Environment="ALLOWED_ORIGIN=https://signflow.coach,https://signflow-staging-innosee-team.vercel.app"
```

Das zweite Element ist die feste Vercel-Preview-URL für den `staging`-Branch — **siehe Schritt 4** für die genaue URL. Wenn der User auch von `localhost:3000` aus den IONOS-Proxy ansprechen will (Dev), zusätzlich `,http://localhost:3000` anhängen.

Dann den neuen Code aus diesem Repo deployen:

```bash
# vom Mac aus, im Repo-Root
cd proxy
./deploy.sh
```

Healthcheck soll `{"ok": true}` zurückgeben.

### 3. Vercel: dedizierter Staging-Branch + Preview-Env

Im Vercel-Dashboard → Signflow-Projekt → "Settings" → "Git" → "Production Branch" lassen wir auf `main`. Für Staging:

- **Settings → Environments** → New "Preview"-Environment kopieren oder neu anlegen, falls nicht da.
- **Branch-Filter setzen:** der bestehende `preview`-Env soll nur für den `staging`-Branch greifen. Alternativ: jeder Feature-Branch deployed automatisch eine Preview-URL und teilt sich die `staging`-Env.

**Env-Vars für `preview`** (Settings → Environment Variables → "Preview" auswählen):

| Variable | Wert |
|---|---|
| `DATABASE_URL` | Neon-Pooled-URL aus Schritt 1 (Staging-Branch) |
| `BETTER_AUTH_SECRET` | gleich wie Production (oder neu generieren — dann sind alle Sessions invalide) |
| `BETTER_AUTH_URL` | `https://signflow-staging-innosee-team.vercel.app` (= URL aus Schritt 4) |
| `NEXT_PUBLIC_APP_URL` | gleich wie `BETTER_AUTH_URL` |
| `IONOS_PROXY_SHARED_SECRET` | **gleich wie Production** — derselbe IONOS-Proxy validiert beide |
| `RESEND_API_KEY` | gleich wie Production (oder einen Test-Key — Resend hat kein Free-Tier-Limit pro Domain) |
| `EMAIL_FROM` | optional: `Signflow Staging <staging@signflow.coach>` |
| `BLOB_READ_WRITE_TOKEN` | gleich wie Production — Blobs landen im selben Store, Random-Suffix mitigiert Mischung |
| Alle Azure/Anonymizer-Vars | gleich wie Production |

Vercel-Preview-Branch-URL: stabilisierbar via "Project Settings → Domains → Add" mit fester Subdomain `staging.signflow.coach` (DNS-CNAME nötig). Solange das nicht eingerichtet ist, ändert sich die URL bei jedem Push — dann musst du `BETTER_AUTH_URL` + `ALLOWED_ORIGIN` jeweils anpassen.

### 4. Staging-Branch im Repo anlegen + ersten Deploy

```bash
git checkout -b staging
git push -u origin staging
```

Vercel deployed automatisch. Aus den Logs die Preview-URL kopieren — die brauchst du für `BETTER_AUTH_URL` + `ALLOWED_ORIGIN` aus Schritt 2/3.

### 5. Synthetisch seeden

```bash
STAGING_OK=1 \
  DATABASE_URL="<staging-neon-url>" \
  node scripts/seed-staging.mjs
```

Das Skript wipet den Staging-Branch (Schema bleibt) und legt frische Demo-Accounts an:

| E-Mail | Rolle | signing_enabled |
|---|---|---|
| `admin@signflow-staging.test` | Bildungsträger | — |
| `coach.alpha@signflow-staging.test` | Coach | true |
| `coach.beta@signflow-staging.test` | Coach | false (Checker-only) |

Shared-Passwort: **`staging1234`**. Plus 1 Kurs mit 2 TN, 1 fertig eingereichter BER (kurs-gebunden) und 1 Schnell-Check-BER.

### 6. Smoke-Test

1. Browser → Vercel-Preview-URL → Login als `admin@signflow-staging.test`.
2. „Eingereichte Abschlussberichte" → der Demo-BER von TN Alpha sollte auftauchen.
3. Logout → Login als `coach.alpha@signflow-staging.test` → Schnell-Check öffnen → Bericht prüfen → Anonymisierung darf NICHT mit „Proxy nicht konfiguriert" stehen, sonst CORS-Block (Schritt 2 ist nicht durch).

## Tagesablauf

### Feature deployen auf Staging

```bash
git checkout staging
git pull
git merge feat/<deine-feature-branch>
git push
# Vercel deployed → ~45s warten → Preview-URL antesten
```

### Staging-DB resetten

```bash
STAGING_OK=1 DATABASE_URL="<staging-url>" node scripts/seed-staging.mjs
```

### Staging-Branch komplett verwerfen + neu

Im Neon-Dashboard → Branches → `staging` → "Delete branch" → dann Schritt 1 wiederholen + Vercel-`DATABASE_URL` aktualisieren.

## Sicherheits-Hinweise

- **Niemals Production-Daten in Staging kopieren.** Der Seeder wipet immer vorher; falls jemand manuell echte Daten überträgt, ist das ein Datenschutzverstoß.
- **`STAGING_OK=1` nicht in Production-Shells setzen.** Der Seeder bricht zwar ab wenn er einen non-Staging Bildungsträger findet, aber das ist die letzte Verteidigungslinie.
- **Shared-Secret-Rotation** (`IONOS_PROXY_SHARED_SECRET`) muss in beiden Vercel-Environments synchron passieren — sonst kippt eine Seite ins Bypass.
- **Resend-Mails** aus Staging gehen an reale E-Mail-Adressen. Wenn der Seeder Magic-Links ausstellt o.ä., bitte `RESEND_API_KEY` weglassen — dann landet der Inhalt im Server-Log.
