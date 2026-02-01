#!/bin/bash
# JewelQR MongoDB Backup Script
# Runs daily via cron, maintains retention policy

set -e

# Configuration
MONGO_HOST="${MONGO_HOST:-mongo}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_DB="${MONGO_DB:-jewelqr}"
MONGO_USER="${MONGO_USER:-admin}"
MONGO_PASSWORD="${MONGO_PASSWORD}"
BACKUP_DIR="/backups"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="jewelqr_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

echo "=========================================="
echo "JewelQR Backup Started: $(date)"
echo "=========================================="

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Run mongodump
echo "Running mongodump..."
mongodump \
    --host="${MONGO_HOST}" \
    --port="${MONGO_PORT}" \
    --username="${MONGO_USER}" \
    --password="${MONGO_PASSWORD}" \
    --authenticationDatabase="admin" \
    --db="${MONGO_DB}" \
    --out="${BACKUP_PATH}" \
    --gzip

# Create tarball
echo "Compressing backup..."
cd "${BACKUP_DIR}"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${BACKUP_NAME}"

# Calculate checksum
sha256sum "${BACKUP_NAME}.tar.gz" > "${BACKUP_NAME}.tar.gz.sha256"

# Get backup size
BACKUP_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
echo "Backup created: ${BACKUP_NAME}.tar.gz (${BACKUP_SIZE})"

# Cleanup old backups
echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "jewelqr_backup_*.tar.gz*" -mtime +${RETENTION_DAYS} -delete

# List current backups
echo "Current backups:"
ls -lh "${BACKUP_DIR}"/jewelqr_backup_*.tar.gz 2>/dev/null || echo "No backups found"

echo "=========================================="
echo "Backup completed: $(date)"
echo "=========================================="
