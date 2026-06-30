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

**Empfehlung:** Option A (GitHub Actions), Ziel **IONOS Object Storage** falls
vorhanden, sonst `scp` auf die VM. Beides ist mit demselben Workflow machbar.

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

## Offene Entscheidungen (vor Scharfschalten)

- [ ] Mechanismus: **A (GitHub Actions)** oder **B (VM-Cron)**?
- [ ] IONOS-Ziel: **Object Storage (S3)** oder **VM-Filesystem** `/home/signflow/backups`?
- [ ] gpg-Schlüsselpaar erzeugen (Public-Key fürs Verschlüsseln in Secrets/VM,
      Private-Key **offline** sicher verwahren — ohne ihn ist kein Restore möglich).
- [ ] Read-only Neon-Rolle für die Backup-Verbindung anlegen (least privilege).
