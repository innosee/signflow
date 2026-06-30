#!/usr/bin/env bash
#
# Verschlüsseltes Logical-Backup der Prod-DB → IONOS.
# Konzept + Rhythmus: docs/backups.md. Inert bis die Env-Variablen gesetzt sind.
#
# Erwartete Env:
#   BACKUP_DATABASE_URL   Neon-Connection-String (idealerweise read-only Rolle).
#                         Zum LOKALEN TESTEN den Staging-Branch nehmen — NIE zum
#                         Testen auf Prod schreiben (Lesen/Dump ist ok).
#   BACKUP_GPG_RECIPIENT  gpg-Key-ID/-E-Mail, mit deren Public-Key verschlüsselt wird.
#   BACKUP_TARGET         "ssh"  → scp auf die IONOS-VM
#                         "s3"   → IONOS Object Storage (via aws-cli, S3-kompatibel)
#   Bei BACKUP_TARGET=ssh:
#     IONOS_SSH_DEST      z.B. signflow@anon.signflow.coach
#     IONOS_SSH_DIR       z.B. /home/signflow/backups
#   Bei BACKUP_TARGET=s3:
#     IONOS_S3_BUCKET     z.B. s3://signflow-backups
#     AWS_* / S3-Endpoint  via aws-cli-Config (IONOS-Endpoint als --endpoint-url)
#   BACKUP_RETENTION      Anzahl zu behaltender Dumps (Default 16 ≈ 8 Wochen)
#
set -euo pipefail

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL fehlt}"
: "${BACKUP_GPG_RECIPIENT:?BACKUP_GPG_RECIPIENT fehlt}"
: "${BACKUP_TARGET:?BACKUP_TARGET fehlt (ssh|s3)}"
RETENTION="${BACKUP_RETENTION:-16}"

# Host maskiert loggen (Passwort nie ausgeben) — Schutz vor falscher DB.
host_hint="$(printf '%s' "$BACKUP_DATABASE_URL" | sed -E 's#(://[^:]+):[^@]+@#\1:<pw>@#')"
echo "→ Quelle: ${host_hint}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
dump="${workdir}/signflow-${stamp}.dump"
enc="${dump}.gpg"

echo "→ pg_dump (custom format)…"
pg_dump --format=custom --no-owner --no-privileges \
  --dbname="$BACKUP_DATABASE_URL" --file="$dump"

echo "→ gpg verschlüsseln für ${BACKUP_GPG_RECIPIENT}…"
gpg --batch --yes --trust-model always \
  --recipient "$BACKUP_GPG_RECIPIENT" --encrypt --output "$enc" "$dump"
rm -f "$dump" # Klartext-Dump sofort weg

size="$(du -h "$enc" | cut -f1)"
echo "→ Upload (${size}) via ${BACKUP_TARGET}…"

case "$BACKUP_TARGET" in
  ssh)
    : "${IONOS_SSH_DEST:?IONOS_SSH_DEST fehlt}"
    : "${IONOS_SSH_DIR:?IONOS_SSH_DIR fehlt}"
    ssh "$IONOS_SSH_DEST" "mkdir -p '$IONOS_SSH_DIR'"
    scp "$enc" "${IONOS_SSH_DEST}:${IONOS_SSH_DIR}/"
    # Rotation: nur die jüngsten $RETENTION *.gpg behalten.
    ssh "$IONOS_SSH_DEST" \
      "ls -1t '${IONOS_SSH_DIR}'/signflow-*.dump.gpg 2>/dev/null | tail -n +$((RETENTION+1)) | xargs -r rm -f"
    ;;
  s3)
    : "${IONOS_S3_BUCKET:?IONOS_S3_BUCKET fehlt}"
    aws s3 cp "$enc" "${IONOS_S3_BUCKET}/$(basename "$enc")"
    # Rotation: älteste über Retention hinaus löschen.
    mapfile -t old < <(aws s3 ls "${IONOS_S3_BUCKET}/" | awk '{print $4}' \
      | grep '^signflow-.*\.dump\.gpg$' | sort | head -n "-${RETENTION}" 2>/dev/null || true)
    for f in "${old[@]:-}"; do
      [ -n "$f" ] && aws s3 rm "${IONOS_S3_BUCKET}/${f}"
    done
    ;;
  *)
    echo "✗ Unbekanntes BACKUP_TARGET: $BACKUP_TARGET" >&2
    exit 1
    ;;
esac

echo "✓ Backup abgelegt: $(basename "$enc") (${size}), Retention=${RETENTION}"
