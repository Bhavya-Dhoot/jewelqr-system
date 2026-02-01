#!/bin/bash
# JewelQR MongoDB Restore Script
# Restores from a backup tarball

set -e

# Configuration
MONGO_HOST="${MONGO_HOST:-mongo}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_DB="${MONGO_DB:-jewelqr}"
MONGO_USER="${MONGO_USER:-admin}"
MONGO_PASSWORD="${MONGO_PASSWORD}"
BACKUP_DIR="/backups"

# Check arguments
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_filename>"
    echo "Available backups:"
    ls -lh "${BACKUP_DIR}"/jewelqr_backup_*.tar.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$1"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# Verify backup exists
if [ ! -f "${BACKUP_PATH}" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_PATH}"
    exit 1
fi

# Verify checksum if available
CHECKSUM_FILE="${BACKUP_PATH}.sha256"
if [ -f "${CHECKSUM_FILE}" ]; then
    echo "Verifying checksum..."
    cd "${BACKUP_DIR}"
    sha256sum -c "${BACKUP_FILE}.sha256"
fi

echo "=========================================="
echo "JewelQR Restore Started: $(date)"
echo "Restoring from: ${BACKUP_FILE}"
echo "=========================================="

# Extract backup
TEMP_DIR=$(mktemp -d)
echo "Extracting backup..."
tar -xzf "${BACKUP_PATH}" -C "${TEMP_DIR}"

# Find extracted directory
EXTRACTED_DIR=$(find "${TEMP_DIR}" -maxdepth 1 -type d -name "jewelqr_backup_*" | head -1)

if [ -z "${EXTRACTED_DIR}" ]; then
    echo "ERROR: Could not find extracted backup directory"
    rm -rf "${TEMP_DIR}"
    exit 1
fi

# Confirm restore
echo ""
echo "WARNING: This will OVERWRITE the current database!"
echo "Press ENTER to continue or Ctrl+C to cancel..."
read

# Run mongorestore
echo "Running mongorestore..."
mongorestore \
    --host="${MONGO_HOST}" \
    --port="${MONGO_PORT}" \
    --username="${MONGO_USER}" \
    --password="${MONGO_PASSWORD}" \
    --authenticationDatabase="admin" \
    --db="${MONGO_DB}" \
    --gzip \
    --drop \
    "${EXTRACTED_DIR}/${MONGO_DB}"

# Cleanup
rm -rf "${TEMP_DIR}"

echo "=========================================="
echo "Restore completed: $(date)"
echo "=========================================="
