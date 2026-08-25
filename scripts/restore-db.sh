#!/bin/sh
# ==============================================================================
# CoBuddy Customer Backend — Production Database Restore Script
#
# Restores a compressed or plain SQL dump into the PostgreSQL database.
#
# Usage:
#   ./scripts/restore-db.sh ./backups/customer_db_YYYYMMDD_HHMMSS.sql.gz
# ==============================================================================

set -e

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: $0 <path-to-backup-file.sql.gz | path-to-backup-file.sql>"
  exit 1
fi

echo "====================================================="
echo " [$(date +"%Y-%m-%d %H:%M:%S")] Starting Customer DB Restore..."
echo " Source: ${BACKUP_FILE}"
echo " Database: ${POSTGRES_DB:-cobuddy_customer_db}"
echo "====================================================="

if echo "$BACKUP_FILE" | grep -q "\.gz$"; then
  gunzip -c "$BACKUP_FILE" | docker compose exec -T postgres psql -U "${POSTGRES_USER:-cobuddy}" -d "${POSTGRES_DB:-cobuddy_customer_db}"
else
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-cobuddy}" -d "${POSTGRES_DB:-cobuddy_customer_db}" < "$BACKUP_FILE"
fi

echo "✓ Database restored successfully."
echo "====================================================="
