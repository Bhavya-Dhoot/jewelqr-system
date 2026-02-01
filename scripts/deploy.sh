#!/bin/bash
# =============================================================================
# JewelQR Production Deployment Script
# =============================================================================

set -e

echo "=========================================="
echo "JewelQR Production Deployment"
echo "=========================================="

# Check for .env file
if [ ! -f ".env" ]; then
    echo "ERROR: .env file not found!"
    echo "Copy .env.production.example to .env and configure it."
    exit 1
fi

# Generate SSL certificates if not exists
if [ ! -f "ssl/certificate.crt" ]; then
    echo "Generating self-signed SSL certificates..."
    mkdir -p ssl
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout ssl/private.key \
        -out ssl/certificate.crt \
        -subj "/CN=localhost"
    echo "SSL certificates generated."
fi

# Create required directories
echo "Creating directories..."
mkdir -p backups
mkdir -p certbot/conf
mkdir -p certbot/www
mkdir -p jewelry-qr-backend/uploads
mkdir -p jewelry-qr-backend/logs

# Build and start containers
echo "Building and starting containers..."
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be healthy
echo "Waiting for services to start..."
sleep 10

# Check health
echo "Checking API health..."
curl -s http://localhost:3000/api/health || echo "Waiting for backend..."
sleep 5
curl -s http://localhost:3000/api/health

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Services:"
echo "  - Nginx:   https://localhost"
echo "  - Backend: http://localhost:3000"
echo "  - MongoDB: Internal only"
echo ""
echo "Commands:"
echo "  - Logs:    docker-compose -f docker-compose.prod.yml logs -f"
echo "  - Stop:    docker-compose -f docker-compose.prod.yml down"
echo "  - Restart: docker-compose -f docker-compose.prod.yml restart"
echo "  - Backup:  docker exec jewelqr-backup /backup.sh"
echo ""
