# Backup-Konzept — Prod-DB → IONOS (2×/Woche)

> **Warum:** Neon Free/Launch hat nur ~24 h Point-in-Time-Recovery
> (`history_retention_seconds = 86400`). Bei 100+ echten Usern mit AfA-Daten
> brauchen wir **eigene, längerfristige, von Neon unabhängige** Backups.
> Ziel: 2× pro Woche ein vollständiger, **verschlüsselter** logischer Dump auf
> IONOS-Infrastruktur, mit Rotation und regelmäßigem Restore-Test.

---

## Eckdaten

| Punkt | Festlegung |
|---|---|
| Quelle | Neon Prod-Branch `br-old-art-alnooacc` (Projekt `solitary-waterfall-77539790`) |
| Tool | `pg_dump` (logisch, `--format=custom`, komprimiert) |
| Rhythmus | 2×/Woche — **Montag + Donnerstag, 03:00 Europe/Berlin** |
| Verschlüsselung | **gpg** (Public-Key) — der Dump enthält personenbezogene AfA-Daten, darf NIE unverschlüsselt auf IONOS liegen (DSGVO) |
| Ziel | IONOS (VM-Filesystem `/home/signflow/backups` **oder** IONOS Object Storage) |
| Retention | letzte **16** Dumps (≈ 8 Wochen), ältere automatisch löschen |
| Verifikation | **monatlicher Restore-Test** auf einen Neon-Wegwerf-Branch |
| Ad-hoc | zusätzlich **vor jeder zerstörerischen Migration** ein Dump |

---

## Mechanismus — zwei Optionen (eine wählen)

### Option A — GitHub Actions (empfohlen)
Ein Scheduled Workflow (`cron`) läuft Mo+Do, dumpt die Prod-DB, verschlüsselt und
schiebt das Ergebnis per `scp`/`rsync` auf die IONOS-VM (oder per `rclone`/`aws s3`
in IONOS Object Storage).

- **Pro:** zentral, versioniert, Logs in GitHub, keine VM-Wartung, läuft auch wenn
  niemand da ist.
- **Contra:** Prod-`DATABASE_URL` + Deploy-SSH-Key + gpg-Key müssen als GitHub
  **Secrets** liegen. Zugriff streng halten.
- **Secrets:** `BACKUP_DATABASE_URL` (idealerweise eine **read-only** Neon-Rolle),
  `IONOS_SSH_KEY` + `IONOS_SSH_HOST`, `BACKUP_GPG_PUBLIC_KEY`.

### Option B — Cron auf der IONOS-VM
Die vorhandene VM (`signflow@anon.signflow.coach`) zieht selbst per Cron den Dump
von Neon und legt ihn lokal ab.

- **Pro:** Daten verlassen nie GitHub; nutzt vorhandene Infra; Prod-`DATABASE_URL`
  nur auf der VM.
- **Contra:** VM-Cron + Monitoring selbst pflegen; stiller Ausfall, wenn die VM hängt;
  `pg_dump`-Version auf der VM muss zur Neon-PG-Version (17) passen.

**ENTSCHIEDEN (2026-06-30):** Option **A — GitHub Actions**, Ziel **IONOS-VM-Filesystem**
(`/home/signflow/backups`, scp). Begründung: Die VM hat **kein** `pg_dump`/`aws`/`rclone`,
aber `gpg` und 6,2 GB frei — also dumpt+verschlüsselt der **Runner** (Container
`postgres:17`), die VM **empfängt** nur. Kein zusätzliches IONOS-Produkt nötig.
Workflow: [`.github/workflows/backup.yml`](../.github/workflows/backup.yml).
Später auf Object Storage umschwenkbar (Skript kann `BACKUP_TARGET=s3`).

> ⚠️ VM-Disk im Auge behalten (aktuell 67 % belegt). Dumps sind klein
> (DB ~35 MB logisch), aber Retention + Wachstum beobachten.

---

## Skript

`scripts/backup-prod-to-ionos.sh` (im Repo, inert bis Env gesetzt) macht:
1. `pg_dump --format=custom` der Quelle,
2. `gzip` + `gpg --encrypt` (Public-Key, kein Passwort nötig),
3. Upload ans Ziel,
4. Rotation (älteste über Retention-Grenze löschen),
5. Exit-Code + kurze Zusammenfassung (für CI-/Cron-Monitoring).

Erwartete Env-Variablen siehe Kopf des Skripts. Lokal testbar gegen den
**Staging**-Branch (niemals zum Testen auf Prod schreiben — Lesen ist ok).

---

## Restore-Test (monatlich, Pflicht)

Ein Backup, das nie zurückgespielt wurde, ist kein Backup.

```
1. Neuen Neon-Wegwerf-Branch anlegen (z.B. restore-test-JJJJMMTT).
2. Letztes Dump-File holen, gpg --decrypt, gunzip.
3. pg_restore in den Wegwerf-Branch.
4. Smoke: Tabellen-Counts plausibel? users/courses/sessions vorhanden?
5. Branch wieder löschen.
```

Ergebnis (ok/fehler) kurz in `docs/backups.md` oder einem Ops-Log vermerken.

---

## Scharfschalten — Setup-Checkliste

Der Workflow ist im Repo, läuft aber erst, wenn diese Secrets/Vars in GitHub
gesetzt sind (Settings → Secrets and variables → Actions). Ohne sie überspringt
der erste Step sauber.

**Secrets:**
- [ ] `BACKUP_DATABASE_URL` — Neon Prod-Connection-String, idealerweise **read-only**
      Rolle (least privilege).
- [ ] `BACKUP_GPG_PUBLIC_KEY` — armored Public-Key fürs Verschlüsseln.
- [ ] `IONOS_SSH_KEY` — Private-Key (ed25519) für scp auf die VM.

**Variables (vars):**
- [ ] `IONOS_SSH_HOST` = `anon.signflow.coach`
- [ ] `IONOS_SSH_DEST` = `signflow@anon.signflow.coach`
- [ ] `IONOS_SSH_DIR`  = `/home/signflow/backups`
- [ ] `BACKUP_GPG_RECIPIENT` = Key-ID/E-Mail des Backup-Keys
- [ ] `BACKUP_RETENTION` = `16`

**Einmalig vorab:**
- [ ] gpg-Schlüsselpaar erzeugen. Public-Key → Secret. **Private-Key offline**
      sicher verwahren — ohne ihn ist KEIN Restore möglich.
- [ ] SSH-Public-Key des Backup-Keys in `~/.ssh/authorized_keys` der VM eintragen.
- [ ] Read-only Neon-Rolle anlegen.
- [ ] `workflow_dispatch` einmal manuell triggern → prüfen, dass eine `.dump.gpg`
      in `/home/signflow/backups` landet.
- [ ] Restore-Test (siehe oben) terminieren.
