# Staging-Setup

Eigene Sandkiste für riskante Änderungen — Multi-Tenant-Schema, Stripe-Wiring, Auth-Proxy für Blobs etc. — bevor sie auf `signflow.coach` gehen. Geteilte IONOS-Anonymizer-VM (CORS-Multi-Origin), eigener Neon Schema-only-Branch, ausschließlich synthetische Testdaten.

**Status:** live seit 2026-05-04.

## Topologie

```
Production           Staging
─────────            ───────
signflow.coach   ──► Vercel "Production" env  ─► Neon `production` branch (br-old-art-alnooacc)
signflow-git-staging
  -innosee-team
  .vercel.app    ──► Vercel "Preview" + branch=staging  ─► Neon `staging` branch (br-icy-thunder-…)
                                                          ▲
                                                          └─ Schema-only Root-Branch, keine Daten von prod

Beide Environments rufen denselben IONOS-Anonymizer (anon.signflow.coach) —
der akzeptiert mehrere Origins via comma-separated ALLOWED_ORIGIN.
```

## Konkrete IDs

| Resource | Wert |
|---|---|
| Neon-Org-ID | `org-flat-haze-22361689` (innosee) |
| Neon-Project-ID | `solitary-waterfall-77539790` (Display-Name: „afa unterschriften") |
| Neon Production-Branch-ID | `br-old-art-alnooacc` |
| Neon Staging-Branch-ID | `br-icy-thunder-al1canw5` |
| Staging Compute-Endpoint | `ep-steep-flower-alzbnwmm-pooler` |
| Vercel Staging-URL | `https://signflow-git-staging-innosee-team.vercel.app` |
| IONOS Proxy SSH | `signflow@anon.signflow.coach` |
| IONOS Proxy Env-File | `/home/signflow/app/.env` (kommasepariertes `ALLOWED_ORIGIN`) |

## Demo-Accounts

Geseeded via `scripts/seed-staging.mjs`. Shared-Passwort: **`staging1234`**.

| E-Mail | Rolle | signing_enabled |
|---|---|---|
| `admin@signflow-staging.test` | Bildungsträger | — |
| `coach.alpha@signflow-staging.test` | Coach | true |
| `coach.beta@signflow-staging.test` | Coach | false (Checker-only) |

Demo-Daten: 1 Bedarfsträger („Demo Jobcenter Singen"), 1 Kurs („Demo AVGS-Coaching „Karriere & Selbständigkeit""), 2 TN, 1 fertig eingereichter kurs-gebundener BER, 1 Schnell-Check-BER mit Override-Begründung.

## Tagesablauf

### Feature deployen auf Staging

```bash
git checkout staging
git pull
git merge feat/<deine-feature-branch>
git push
# Vercel deployed automatisch → ~45 s → Preview-URL antesten
```

Alternativ: Feature-Branch direkt pushen — Vercel macht eine eigene Branch-Preview-URL. Die teilt sich aber die Branch-`staging`-DB nur, wenn der Branch explizit `staging` heißt; sonst greifen die globalen Preview-Env-Vars.

### Staging-DB resetten (Seeder)

Variante A — autonom via Neon-CLI (User hat einmal `npx neonctl auth` gemacht, Token in `~/.config/neonctl/credentials.json`):

```bash
cd /path/to/signflow
DATABASE_URL=$(npx neonctl connection-string staging \
  --project-id solitary-waterfall-77539790 \
  --pooled --database-name neondb 2>&1 | tail -1)
export DATABASE_URL
export STAGING_OK=1
node scripts/seed-staging.mjs
```

Variante B — interaktiv (wenn neonctl nicht authentifiziert ist):

```bash
cd /path/to/signflow
read -rs "DATABASE_URL?Pooled-Connection-String aus Neon-Dashboard + Enter: "
export DATABASE_URL
export STAGING_OK=1
node scripts/seed-staging.mjs
```

Der Seeder hat einen Refuse-Guard: bricht ab, sobald er einen Bildungsträger ohne `@signflow-staging.test`-Suffix in der Ziel-DB findet. Schutz vor versehentlicher Production-Wipe.

### Staging-Branch komplett verwerfen + neu

Im Neon-Dashboard → Branches → `staging` → „Delete branch" → dann neu anlegen:

- Branch name: `staging`
- **Auto-Delete deaktiviert** (sonst kommt Free-Tier-Retention)
- **Schema only** auswählen (kein „Current data" — wir wollen keine prod-Daten)

Sobald der Branch da ist: Compute-Endpoint hat einen neuen Hostname → Vercel-`DATABASE_URL` ersetzen:

```bash
vercel env rm DATABASE_URL preview staging --yes
DATABASE_URL=$(npx neonctl connection-string staging \
  --project-id solitary-waterfall-77539790 \
  --pooled --database-name neondb 2>&1 | tail -1)
echo -n "$DATABASE_URL" | vercel env add DATABASE_URL preview staging
unset DATABASE_URL
# Empty-Commit auf staging → Vercel-Redeploy mit der frischen URL
git commit --allow-empty -m "chore(staging): redeploy with refreshed Neon DATABASE_URL"
git push origin staging
```

Dann seeden (siehe oben). Smoke-Test:

```bash
curl -s -o /dev/null -w "Login: %{http_code}\n" \
  https://signflow-git-staging-innosee-team.vercel.app/login
# erwartet: Login: 200
```

## Einmalige Erst-Einrichtung (Referenz)

Falls Staging-Setup von Null neu gemacht werden muss — z.B. nach Vercel-Projekt-Reset oder neuem Neon-Project. Reihenfolge wichtig.

### 1. Neon-Branch anlegen

Neon-Dashboard → Project „afa unterschriften" → Branches → „Create branch" → `staging` → **Auto-Delete aus**, **Schema only** → Create.

### 2. Vercel-Preview-Env-Vars setzen

Vercel-Dashboard → Project signflow → Settings → Environment Variables. Folgende Vars als **Preview** + **Branch=`staging`** anlegen (Branch-scoped Override schützt davor, dass Production-Werte greifen):

| Variable | Wert |
|---|---|
| `DATABASE_URL` | Neon-Pooled-URL aus Schritt 1 |
| `BETTER_AUTH_URL` | `https://signflow-git-staging-innosee-team.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | gleich |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | gleich |
| `BETTER_AUTH_SECRET` | **frisch generieren** mit `openssl rand -hex 32` (nicht das prod-Secret recyclen — sonst sind Sessions zwischen den Environments austauschbar) |

Alle anderen Variablen (`IONOS_PROXY_URL`, `IONOS_PROXY_SHARED_SECRET`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `AZURE_*`) erben aus dem Production-Scope-Set, das bei „Production and Preview" ankreuzt ist — nichts zu tun.

CLI-Variante:

```bash
echo -n "https://signflow-git-staging-innosee-team.vercel.app" \
  | vercel env add BETTER_AUTH_URL preview staging
echo -n "https://signflow-git-staging-innosee-team.vercel.app" \
  | vercel env add NEXT_PUBLIC_APP_URL preview staging
echo -n "https://signflow-git-staging-innosee-team.vercel.app" \
  | vercel env add NEXT_PUBLIC_BETTER_AUTH_URL preview staging
echo -n "$(openssl rand -hex 32)" | vercel env add BETTER_AUTH_SECRET preview staging
```

`DATABASE_URL` wird per Dashboard gesetzt (Sensitive-Flag, nicht via CLI).

### 3. Vercel-Deployment-Protection für Preview ausschalten

Settings → Deployment Protection → **Vercel Authentication: Disabled**. Sonst gibt jede Preview-URL 401 ohne Vercel-Team-SSO. Production-`signflow.coach` ist von der Einstellung nicht betroffen (custom domain).

### 4. IONOS-Proxy: ALLOWED_ORIGIN erweitern

```bash
ssh signflow@anon.signflow.coach
# In /home/signflow/app/.env die ALLOWED_ORIGIN-Zeile setzen:
sed -i 's|^ALLOWED_ORIGIN=.*|ALLOWED_ORIGIN=https://signflow.coach,https://signflow-git-staging-innosee-team.vercel.app|' \
  /home/signflow/app/.env
exit
# Vom Repo-Root deployen + Neustart
cd proxy && ./deploy.sh
```

`deploy.sh` synct Code (Multi-Origin-Support ist auf `main`), restartet den Service via NOPASSWD-sudo, und macht einen Healthcheck.

### 5. Staging-Branch im Repo + erster Deploy

```bash
git checkout main && git pull
git checkout -b staging
git push -u origin staging
```

Vercel deployt automatisch — ~45 s. Falls der Webhook hängt: leerer Commit pushen.

### 6. Seeden + Smoke-Test

Siehe „Tagesablauf → Staging-DB resetten" oben.

## Bekannte Stolperfallen

- **Neon Free-Plan Auto-Cleanup:** Schema-only-Branches verschwinden bei langer Inaktivität, auch wenn „Automatically delete branch after" UNCHECKED ist. Wenn der Staging-Login plötzlich 500 wirft → erst checken, ob der Branch noch da ist (`npx neonctl branches list --project-id solitary-waterfall-77539790`). Neu anlegen + Vercel-`DATABASE_URL` ersetzen + seeden.
- **Vercel Sensitive-Flag** auf `DATABASE_URL` blockt `vercel env pull` (liefert leeren String). Lese-Pfad für Skripte: `npx neonctl connection-string`. Schreib-Pfad: `vercel env rm` + `vercel env add` (das geht trotz Sensitive).
- **`vercel env pull --git-branch=staging`** liefert nur die Branch-scoped Vars — Werte global gesetzter Vars sind dort leer. Wenn ein Skript einen Wert nicht findet, ist die Var entweder Sensitive oder im falschen Scope.
- **Sudoers auf der IONOS-VM** erlaubt `signflow` nur `systemctl restart anon-proxy` und `systemctl status anon-proxy`. `systemctl edit` braucht Passwort → entweder den User-shell mit `sudo -i` aufmachen, oder Env-Var via `/home/signflow/app/.env` ändern (so wie wir's tun).
- **Resend-Mails aus Staging** gehen an reale Adressen, falls `RESEND_API_KEY` gesetzt ist. Beim Magic-Link-Test mit echter Empfänger-E-Mail kommen die Mails wirklich an. Wenn das stört: API-Key in Staging-Branch-Override unsetzen — der Code fällt dann auf `console.log` zurück (nur Dev — in Production würde das werfen).

## Sicherheits-Hinweise

- **Niemals Production-Daten in Staging kopieren.** Der Seeder wipet immer vorher; falls jemand manuell echte Daten überträgt, ist das ein Datenschutzverstoß.
- **`STAGING_OK=1` nicht in Production-Shells setzen.** Der Seeder-Refuse-Guard ist die letzte Verteidigungslinie, nicht die einzige.
- **`IONOS_PROXY_SHARED_SECRET`** muss in beiden Vercel-Environments synchron sein. Bei Rotation: erst IONOS-VM (`/home/signflow/app/.env`) → dann Vercel Production-Var → dann Vercel Preview-Var. Reihenfolge umgekehrt = Anonymizer rejected die Calls.
