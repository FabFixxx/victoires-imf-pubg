# Scripts Raspberry Pi

## backup-supabase.sh

Backup quotidien de la base Supabase vers le Raspberry Pi.

### Installation

```bash
# 1. Copier le script
mkdir -p ~/scripts
curl -o ~/scripts/backup-supabase.sh \
  https://raw.githubusercontent.com/FabFixxx/victoires-imf-pubg/main/scripts/backup-supabase.sh
chmod +x ~/scripts/backup-supabase.sh

# 2. Créer le fichier de credentials (ne jamais commiter ce fichier)
echo 'DB_PASS=ton_mot_de_passe' > ~/.supabase_backup_env
chmod 600 ~/.supabase_backup_env
```

### Configuration Supabase (Session Pooler IPv4)

| Paramètre | Valeur |
|---|---|
| Host | `aws-1-eu-central-1.pooler.supabase.com` |
| Port | `5432` |
| User | `postgres.wknxynnoybniifgbjvdt` |
| Database | `postgres` |
| Mode | Session pooler (IPv4) |

### Crontab (1h du matin)

```
0 1 * * * /home/fabfixpi/scripts/backup-supabase.sh >> /home/fabfixpi/scripts/backup.log 2>&1
```

### Backups

- Stockés dans : `~/backups/supabase/`
- Format : `supabase_YYYY-MM-DD_HH-MM.sql.gz`
- Rétention : 30 jours (suppression automatique)

### Vérifier les logs

```bash
cat ~/scripts/backup.log
ls -lh ~/backups/supabase/
```

---

## Crontab complet du Raspberry Pi

| Heure | Tâche |
|---|---|
| 1h00 | Backup Supabase |
| 1h15 | Backup git Home Assistant |
| 1h30 | Backup git raspberry-ha-expose |
| 1h45 | Sync Caddy |
