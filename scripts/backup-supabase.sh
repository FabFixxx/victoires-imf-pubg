#!/bin/bash
# Backup Supabase → Raspberry Pi
# Cron : 0 2 * * * /home/pi/scripts/backup-supabase.sh >> /home/pi/scripts/backup.log 2>&1

# ── Config ──────────────────────────────────────────────────────────
DB_HOST="db.wknxynnoybniifgbjvdt.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASS="REMPLACER_PAR_TON_MOT_DE_PASSE"

BACKUP_DIR="/home/pi/backups/supabase"
RETENTION_DAYS=30
# ────────────────────────────────────────────────────────────────────

DATE=$(date +"%Y-%m-%d_%H-%M")
FILENAME="supabase_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Démarrage backup..."

PGPASSWORD="$DB_PASS" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  | gzip > "$BACKUP_DIR/$FILENAME"

if [ $? -eq 0 ]; then
  SIZE=$(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1)
  echo "[$(date)] ✓ Backup OK : $FILENAME ($SIZE)"
else
  echo "[$(date)] ✗ Erreur lors du backup"
  exit 1
fi

# Supprimer les backups de plus de 30 jours
DELETED=$(find "$BACKUP_DIR" -name "supabase_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] 🗑 $DELETED ancien(s) backup(s) supprimé(s)"
fi

echo "[$(date)] Terminé."
