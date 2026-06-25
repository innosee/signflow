# Off-Site-Backup (Neon + R2 → IONOS-VM)

Unabhängiges Backup **abseits** von Neon und Cloudflare. Es schützt gegen das,
was providerinterne Mechanismen (Neon-PITR, R2-Versioning) **nicht** abdecken:
Account-Verlust, Provider-Ausfall/Insolvenz, kompromittierter Zugang,
versehentliches Projekt-/Bucket-Löschen.

Gesichert wird auf die ohnehin betriebene **IONOS-VM (Frankfurt, EU)**:

| Quelle | Wie | Warum so |
|---|---|---|
| **Neon Postgres** | `pg_dump -Fc` → **gpg-verschlüsselt**, datiert, rotiert | DB ändert sich täglich → Versionshistorie nötig |
| **Cloudflare R2** | `rclone sync` → rollender lokaler Spiegel | Signaturen/FES-PDFs sind immutable → aktueller Spiegel reicht |

**DSGVO/Sozialdaten:** Der DB-Dump wird **asymmetrisch** verschlüsselt. Nur der
**Public Key** liegt auf der VM — die VM kann Backups schreiben, aber nie lesen.
Entschlüsseln kann nur, wer den offline verwahrten **Private Key** hat.

---

## 1. Tools auf der VM installieren (einmalig)

```bash
sudo apt update
sudo apt install -y postgresql-client gnupg curl
# rclone (aktuelle Version, nicht die alte aus apt):
curl https://rclone.org/install.sh | sudo bash
```

## 2. Backup-Schlüssel einrichten (einmalig)

**Auf einem sicheren Rechner — NICHT auf der VM** — ein Schlüsselpaar erzeugen:

```bash
gpg --quick-generate-key "Signflow Backup <backup@innosee.de>" rsa4096 encr never
gpg --armor --export        backup@innosee.de > backup-public.asc   # → auf die VM
gpg --armor --export-secret-keys backup@innosee.de > backup-private.asc  # → OFFLINE in den Tresor/Passwortmanager
```

Den **Private Key sicher wegschließen** (Passwortmanager/Tresor) und die lokale
`backup-private.asc` danach `shred`-en. Den **Public Key** auf die VM kopieren:

```bash
# auf der VM:
gpg --import backup-public.asc
gpg --list-keys backup@innosee.de   # bestätigt, dass er im Keyring ist
```

## 3. Konfiguration

```bash
cd scripts/backup
cp backup.env.example backup.env
chmod 600 backup.env          # enthält DB- + R2-Secrets
# backup.env ausfüllen (DATABASE_URL = Prod, R2-Creds, GPG_RECIPIENT, BACKUP_ROOT)
```

`backup.env` ist in `.gitignore` — wird nie committet. Die Vorlage
`backup.env.example` bleibt im Repo.

## 4. Testen (gefahrlos, in dieser Reihenfolge)

```bash
chmod +x offsite-backup.sh

# (a) Preflight: prüft Tools, Env, DB- + R2-Connectivity, gpg-Key. SCHREIBT NICHTS.
./offsite-backup.sh --check

# (b) Erst nur die DB sichern (klein, schnell). Erzeugt einen .dump.gpg.
./offsite-backup.sh --db-only

# (c) Restore-Probe — das ist der eigentliche Test (ein Backup, das man nie
#     zurückspielt, ist kein Backup). Mit dem PRIVATE Key entschlüsseln und
#     in eine WEGWERF-DB (z.B. lokaler Docker-Postgres / Neon-Test-Branch)
#     zurückspielen:
gpg --decrypt /var/backups/signflow/db/db-<TS>.dump.gpg > /tmp/probe.dump
pg_restore --no-owner --no-privileges -d "$WEGWERF_DATABASE_URL" /tmp/probe.dump
shred -u /tmp/probe.dump
#     → in der Wegwerf-DB stichprobenartig prüfen: SELECT count(*) FROM courses; etc.

# (d) Erst wenn (a)–(c) sauber sind: den R2-Spiegel testen.
./offsite-backup.sh --r2-only

# (e) Voller Lauf:
./offsite-backup.sh
```

**Hinweis zur Restore-Probe:** Am besten gegen einen frischen **Neon-Test-Branch**
(`neonctl branches create`) testen — kostet nichts und ist isoliert. Niemals in
die Prod-DB zurückspielen.

## 5. Cron einrichten (nach erfolgreichem Test)

```bash
crontab -e
```

```cron
# Signflow Off-Site-Backup — täglich 03:17 UTC (außerhalb der Stoßzeit)
17 3 * * * /pfad/zu/signflow/scripts/backup/offsite-backup.sh >> /var/backups/signflow/logs/cron.log 2>&1
```

Für den Start reicht **wöchentlich**; sobald echte Teilnehmer live sind, auf
**täglich** stellen (oben). Das Skript hält einen `flock`, überlappende Läufe
sind also unkritisch.

## 6. Betrieb / Monitoring

- **Logs:** `/var/backups/signflow/logs/backup-<TS>.log` (pro Lauf) + `cron.log`.
- **Fehler-Alarm:** `BACKUP_WEBHOOK_URL` in `backup.env` setzen (Slack/Teams) —
  wird nur bei Fehlern angepingt.
- **Platz prüfen:** `du -sh /var/backups/signflow/*`. DB-Dumps rotieren nach
  `RETENTION_DAYS` (Default 90, min. `MIN_KEEP`=7). Der R2-Spiegel wächst mit den
  Beweis-PDFs und wird **nicht** rotiert.
- **Wichtig:** mindestens **quartalsweise eine Restore-Probe** (Schritt 4c) —
  ein ungetestetes Backup ist nur eine Hoffnung.

## Restore im Ernstfall (Kurzform)

```bash
# DB:
gpg --decrypt db-<TS>.dump.gpg > restore.dump
pg_restore --no-owner --no-privileges -d "$NEU_DATABASE_URL" restore.dump

# R2 (Spiegel zurück in einen neuen/leeren Bucket schieben):
rclone sync /var/backups/signflow/r2-mirror r2:NEUER_BUCKET   # r2-Remote wie im Skript konfiguriert
```
