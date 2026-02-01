# JewelQR Production Security Hardening
## Version 1.7.0 - Security Release

---

## SECTION 1 — Packages Installed

```bash
npm install helmet express-mongo-sanitize hpp pino pino-pretty cookie-parser --save
```

| Package | Purpose |
|---------|---------|
| `helmet` | Security headers (CSP, HSTS, XSS, etc.) |
| `express-mongo-sanitize` | MongoDB injection prevention |
| `hpp` | HTTP Parameter Pollution prevention |
| `pino` | Structured JSON logging |
| `pino-pretty` | Dev-friendly log output |
| `cookie-parser` | Secure cookie handling |

---

## SECTION 2 — Files Created

| File | Purpose |
|------|---------|
| `nginx.prod.conf` | Production HTTPS nginx config |
| `nginx.dev.conf` | Development self-signed SSL config |
| `docker-compose.prod.yml` | Production Docker stack |
| `.env.production.example` | Environment template |
| `scripts/backup.sh` | Daily MongoDB backup |
| `scripts/restore.sh` | Backup restore script |
| `scripts/mongo-init.js` | MongoDB user/index setup |
| `scripts/deploy.sh` | Deployment automation |
| `jewelry-qr-backend/Dockerfile` | Production container |
| `jewelry-qr-backend/src/services/logger.service.js` | Pino logging |
| `jewelry-qr-backend/src/middleware/security.middleware.js` | Security middleware |

---

## SECTION 3 — Modified Files

| File | Changes |
|------|---------|
| `src/app.js` | Full rewrite with Helmet, rate limiters, sanitization, graceful shutdown |
| `src/config/env.js` | Production validation, secure defaults |

---

## SECTION 4 — Nginx Configuration

**Production** (`nginx.prod.conf`):
- HTTPS with Let's Encrypt
- TLS 1.2/1.3 only
- Security headers (CSP, HSTS, X-Frame-Options)
- Rate limiting zones (login, api, general)
- Gzip compression
- Static caching
- Reverse proxy to backend

**Development** (`nginx.dev.conf`):
- Self-signed SSL
- Simplified security headers
- Rate limiting

---

## SECTION 5 — Docker Stack

```yaml
Services:
  - nginx (443:443, 80:80)
  - backend (internal 3000)
  - mongo (internal 27017)
  - backup (daily cron)
```

MongoDB NOT exposed to host.

---

## SECTION 6 — Environment Variables

```env
# Generate JWT secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Required in production:
JWT_SECRET=<64-char-hex>
MONGO_URI=mongodb://jewelqr_user:PASSWORD@mongo:27017/jewelqr
CORS_ORIGIN=https://yourdomain.com
```

---

## SECTION 7 — Backup System

**Daily backup** at 2:00 AM:
```bash
# Automatic via cron in backup container
# Manual:
docker exec jewelqr-backup /backup.sh
```

**Restore:**
```bash
docker exec -it jewelqr-backup /restore.sh jewelqr_backup_20260201_020000.tar.gz
```

---

## SECTION 8 — Deployment Commands

```bash
# 1. Configure environment
cp .env.production.example .env
nano .env  # Fill in secrets

# 2. Generate SSL (development)
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/private.key -out ssl/certificate.crt -subj "/CN=localhost"

# 3. Build and deploy
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# 4. Verify
curl -k https://localhost/api/health

# 5. View logs
docker-compose -f docker-compose.prod.yml logs -f backend

# 6. Stop
docker-compose -f docker-compose.prod.yml down

# 7. Let's Encrypt (production)
docker-compose -f docker-compose.prod.yml --profile certbot up certbot
```

---

## Security Checklist

- [x] HTTPS only (HTTP redirects)
- [x] Helmet security headers
- [x] Rate limiting (login: 5/15min, API: 100/min)
- [x] MongoDB injection sanitization
- [x] Parameter pollution prevention
- [x] JWT with 256-bit secret
- [x] Secure cookies (httpOnly, secure, sameSite)
- [x] MongoDB authentication enabled
- [x] MongoDB not exposed externally
- [x] Structured logging
- [x] Graceful shutdown
- [x] Daily backups with retention
- [x] Docker with non-root user
- [x] CORS restricted to known origins
- [x] x-powered-by disabled
- [x] Body size limits (10KB)
- [x] Trust proxy configured
