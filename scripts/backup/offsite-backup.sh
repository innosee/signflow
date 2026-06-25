#!/usr/bin/env bash
#
# Signflow Off-Site-Backup
# ========================
# Unabhängiges Backup ABSEITS von Neon und Cloudflare — gedacht für die
# IONOS-VM (EU/Frankfurt), die wir ohnehin betreiben. Schützt gegen das, was
# Neons internes PITR NICHT abdeckt: Account-Verlust, Provider-Ausfall,
# kompromittierter Zugang, versehentliches Projekt-Löschen.
#
# Sichert zwei Dinge:
#   1. Neon-Postgres  -> pg_dump (custom format), gpg-verschlüsselt, datiert,
#      rotiert. Die DB ändert sich täglich -> Versionshistorie nötig.
#   2. Cloudflare R2  -> rclone-Inkrement-Sync in einen rollenden Spiegel.
#      Signaturen + gesiegelte FES-PDFs sind unveränderlich (immutable) und
#      das eigentlich Unwiederbringliche -> ein aktueller Spiegel + R2-
#      Object-Versioning reicht für Point-in-Time.
#
# DSGVO: Der DB-Dump enthält Klar-Personendaten (Sozialdaten-Kontext). Er wird
# darum mit einem ASYMMETRISCHEN gpg-Schlüssel verschlüsselt — die VM trägt nur
# den PUBLIC Key, entschlüsseln kann nur, wer den (offline gehaltenen) Private
# Key hat. Die VM kann also Backups schreiben, aber nie lesen.
#
# Aufruf:
#   ./offsite-backup.sh            # voller Lauf (DB + R2)
#   ./offsite-backup.sh --check    # nur Preflight: Tools/Env/Connectivity, kein Schreiben
#   ./offsite-backup.sh --db-only  # nur Postgres
#   ./offsite-backup.sh --r2-only  # nur R2-Spiegel
#
# Konfiguration: scripts/backup/backup.env  (Vorlage: backup.env.example)
# Override per Env:  BACKUP_ENV_FILE=/pfad/zu/backup.env ./offsite-backup.sh
#
set -euo pipefail

# ---------------------------------------------------------------------------
# 0. Konfiguration laden
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${BACKUP_ENV_FILE:-$SCRIPT_DIR/backup.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

MODE="full"
case "${1:-}" in
  --check)   MODE="check" ;;
  --db-only) MODE="db" ;;
  --r2-only) MODE="r2" ;;
  "")        MODE="full" ;;
  *) echo "Unbekanntes Argument: $1 (erlaubt: --check, --db-only, --r2-only)" >&2; exit 2 ;;
esac

# Pflicht-/Default-Konfiguration
: "${BACKUP_ROOT:=/var/backups/signflow}"   # Zielverzeichnis auf der VM
: "${RETENTION_DAYS:=90}"                    # DB-Dumps älter als N Tage löschen
: "${MIN_KEEP:=7}"                           # ... aber immer mind. die letzten N behalten
: "${R2_JURISDICTION:=eu}"                   # eu -> <account>.eu.r2.cloudflarestorage.com
: "${GPG_RECIPIENT:=}"                       # Key-ID/Email des Backup-Public-Keys
: "${BACKUP_WEBHOOK_URL:=}"                  # optional: bei Fehler angepingt (z.B. Slack)

DB_DIR="$BACKUP_ROOT/db"
R2_MIRROR="$BACKUP_ROOT/r2-mirror"
LOG_DIR="$BACKUP_ROOT/logs"
LOCK_FILE="$BACKUP_ROOT/.backup.lock"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

# ---------------------------------------------------------------------------
# 1. Logging + Fehlerbehandlung
# ---------------------------------------------------------------------------
log()  { printf '%s  %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }
die()  { printf '%s  FEHLER: %s\n' "$(date -u +%H:%M:%SZ)" "$*" >&2; exit 1; }

notify_failure() {
  local msg="$1"
  [[ -z "$BACKUP_WEBHOOK_URL" ]] && return 0
  curl -fsS -m 15 -X POST -H 'Content-Type: application/json' \
    -d "{\"text\":\"⚠️ Signflow-Backup FEHLGESCHLAGEN auf $(hostname): ${msg}\"}" \
    "$BACKUP_WEBHOOK_URL" >/dev/null 2>&1 || true
}

on_error() {
  local line="$1"
  notify_failure "Abbruch in Zeile $line (siehe Log auf der VM)."
}
trap 'on_error $LINENO' ERR

# ---------------------------------------------------------------------------
# 2. Preflight: Tools, Env, Connectivity
# ---------------------------------------------------------------------------
r2_endpoint() {
  if [[ "$R2_JURISDICTION" == "eu" ]]; then
    echo "https://${R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com"
  else
    echo "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  fi
}

# rclone-Remote „r2" rein aus Env definieren (kein rclone config nötig, keine
# Secrets in der Prozessliste).
setup_rclone_env() {
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_ENDPOINT="$(r2_endpoint)"
  export RCLONE_CONFIG_R2_REGION=auto
  export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
}

preflight() {
  local need_db=1 need_r2=1
  [[ "$MODE" == "r2" ]] && need_db=0
  [[ "$MODE" == "db" ]] && need_r2=0

  log "Preflight (Modus: $MODE) ..."

  # --- Tools ---
  if [[ $need_db -eq 1 ]]; then
    command -v pg_dump >/dev/null || die "pg_dump fehlt (apt install postgresql-client)."
    command -v gpg     >/dev/null || die "gpg fehlt (apt install gnupg)."
  fi
  if [[ $need_r2 -eq 1 ]]; then
    command -v rclone  >/dev/null || die "rclone fehlt (https://rclone.org/install)."
  fi

  # --- Env ---
  if [[ $need_db -eq 1 ]]; then
    [[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL nicht gesetzt."
    [[ -n "$GPG_RECIPIENT" ]]    || die "GPG_RECIPIENT nicht gesetzt (Backup-Public-Key-ID)."
    gpg --list-keys "$GPG_RECIPIENT" >/dev/null 2>&1 \
      || die "gpg-Public-Key '$GPG_RECIPIENT' nicht im Keyring (gpg --import backup-public.asc)."
  fi
  if [[ $need_r2 -eq 1 ]]; then
    for v in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME; do
      [[ -n "${!v:-}" ]] || die "$v nicht gesetzt."
    done
  fi

  # --- Connectivity (nur im --check-Modus aktiv testen) ---
  if [[ "$MODE" == "check" ]]; then
    if command -v psql >/dev/null 2>&1; then
      psql "$DATABASE_URL" -tAc 'select 1' >/dev/null \
        && log "  DB-Connectivity OK" || die "DB nicht erreichbar (DATABASE_URL prüfen)."
    else
      log "  (psql nicht installiert — DB-Connect-Test übersprungen)"
    fi
    setup_rclone_env
    rclone lsd "r2:$R2_BUCKET_NAME" >/dev/null \
      && log "  R2-Connectivity OK (Bucket $R2_BUCKET_NAME)" || die "R2 nicht erreichbar (Creds/Endpoint prüfen)."
    log "  gpg-Public-Key '$GPG_RECIPIENT' vorhanden"
  fi

  log "Preflight OK."
}

# ---------------------------------------------------------------------------
# 3. Postgres-Dump -> gpg
# ---------------------------------------------------------------------------
backup_db() {
  mkdir -p "$DB_DIR"
  local raw="$DB_DIR/db-$TS.dump"
  local enc="$raw.gpg"

  log "pg_dump läuft ..."
  # -Fc = komprimiertes Custom-Format (mit pg_restore zurückspielbar).
  # --no-owner/--no-privileges: sauberer Restore in eine frische DB.
  pg_dump "$DATABASE_URL" -Fc --no-owner --no-privileges -f "$raw"

  log "Verschlüssele Dump (Empfänger: $GPG_RECIPIENT) ..."
  gpg --batch --yes --trust-model always \
      --encrypt --recipient "$GPG_RECIPIENT" \
      --output "$enc" "$raw"
  shred -u "$raw" 2>/dev/null || rm -f "$raw"   # Klartext-Dump sofort vernichten

  local size; size="$(du -h "$enc" | cut -f1)"
  log "DB-Backup fertig: $(basename "$enc") ($size)"
}

# ---------------------------------------------------------------------------
# 4. R2-Spiegel (inkrementell)
# ---------------------------------------------------------------------------
backup_r2() {
  setup_rclone_env
  mkdir -p "$R2_MIRROR"
  log "rclone sync R2 -> lokaler Spiegel ..."
  # --immutable: vorhandene Objekte gelten als unveränderlich; ändert sich ein
  # gesiegeltes PDF doch mal, schlägt der Sync absichtlich an (Manipulations-
  # Indikator). --fast-list spart API-Calls bei vielen Objekten.
  rclone sync "r2:$R2_BUCKET_NAME" "$R2_MIRROR" \
    --immutable --fast-list \
    --log-level INFO --stats-one-line --stats 30s

  local count size
  count="$(find "$R2_MIRROR" -type f | wc -l | tr -d ' ')"
  size="$(du -sh "$R2_MIRROR" | cut -f1)"
  log "R2-Spiegel aktuell: $count Objekte ($size)"
}

# ---------------------------------------------------------------------------
# 5. Retention: alte DB-Dumps rotieren (R2-Spiegel wird NICHT rotiert —
#    Beweismittel bleiben). Immer mind. MIN_KEEP behalten.
# ---------------------------------------------------------------------------
rotate_db() {
  [[ -d "$DB_DIR" ]] || return 0
  local total; total="$(find "$DB_DIR" -name 'db-*.dump.gpg' | wc -l | tr -d ' ')"
  if (( total <= MIN_KEEP )); then
    log "Rotation: $total Dumps <= MIN_KEEP ($MIN_KEEP) — nichts gelöscht."
    return 0
  fi
  # Kandidaten = älter als RETENTION_DAYS, aber die jüngsten MIN_KEEP nie anfassen.
  local deletable; deletable=$(( total - MIN_KEEP ))
  local removed=0
  while IFS= read -r f; do
    (( removed >= deletable )) && break
    rm -f "$f" && log "Rotation: gelöscht $(basename "$f")" && removed=$(( removed + 1 ))
  done < <(find "$DB_DIR" -name 'db-*.dump.gpg' -type f -mtime "+$RETENTION_DAYS" -print | sort)
  log "Rotation: $removed Dump(s) gelöscht (Retention ${RETENTION_DAYS}d, MIN_KEEP ${MIN_KEEP})."
}

# ---------------------------------------------------------------------------
# 6. Main
# ---------------------------------------------------------------------------
main() {
  mkdir -p "$BACKUP_ROOT" "$LOG_DIR"

  # Single-Instance-Lock (kein Überlappen bei langen R2-Syncs).
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    die "Ein anderer Backup-Lauf hält bereits den Lock ($LOCK_FILE)."
  fi

  preflight
  if [[ "$MODE" == "check" ]]; then
    log "✅ --check erfolgreich. Alles bereit für einen echten Lauf."
    exit 0
  fi

  local start; start="$(date +%s)"
  [[ "$MODE" == "full" || "$MODE" == "db" ]] && { backup_db; rotate_db; }
  [[ "$MODE" == "full" || "$MODE" == "r2" ]] && backup_r2
  local dur=$(( $(date +%s) - start ))

  log "✅ Backup abgeschlossen in ${dur}s. Ziel: $BACKUP_ROOT"
}

# Gesamtes Log zusätzlich in eine datierte Datei spiegeln.
mkdir -p "${BACKUP_ROOT:-/tmp}/logs" 2>/dev/null || true
main 2>&1 | tee -a "${BACKUP_ROOT:-/tmp}/logs/backup-$TS.log"
exit "${PIPESTATUS[0]}"
