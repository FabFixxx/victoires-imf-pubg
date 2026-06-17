#!/bin/bash
# Backup Supabase → Raspberry Pi
# Cron : 0 2 * * * /home/pi/scripts/backup-supabase.sh >> /home/pi/scripts/backup.log 2>&1

# ── Config ──────────────────────────────────────────────────────────
DB_HOST="db.wknxynnoybniifgbjvdt.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"
# Mot de passe lu depuis un fichier sécurisé (chmod 600)
# Créer avec : echo "DB_PASS=ton_mot_de_passe" > ~/.supabase_backup_env && chmod 600 ~/.supabase_backup_env
ENV_FILE="$HOME/.supabase_backup_env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Fichier $ENV_FILE introuvable. Créé-le avec le mot de passe Supabase."
  exit 1
fi
source "$ENV_FILE"

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
