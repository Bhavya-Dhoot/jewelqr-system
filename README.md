# 🔷 JewelQR System

> Full-stack jewelry inventory management with QR code generation, dynamic pricing, and role-based access control.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green?logo=node.js)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-green?logo=mongodb)](https://mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](https://docker.com/)
[![License](https://img.shields.io/badge/License-Private-red)](LICENSE)

---

## Features

| Feature | Description |
|---------|-------------|
| **Auto-SKU Generation** | Unique SKUs with category prefix (e.g., `CHN-000017`) |
| **QR Code Creation** | Generate scannable QR codes for each item |
| **Dynamic Pricing** | Real-time calculation based on gold rates, diamond types, labour |
| **Gold Purity Pricing** | Automatic purity factor: 24K=100%, 22K=92%, 18K=76%, 14K=60% |
| **Diamond Management** | Add, edit, toggle, delete diamond types via Settings |
| **Role-Based Access** | Admin and Staff roles with different permissions |
| **Soft Delete** | Items and categories can be restored after deletion |
| **Production Ready** | Docker, HTTPS, rate limiting, automated backups |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js, Express.js, Mongoose |
| **Database** | MongoDB 7.0 |
| **Frontend** | Vanilla HTML/CSS/JavaScript |
| **Auth** | JWT (JSON Web Tokens) |
| **Containerization** | Docker, Docker Compose |
| **Reverse Proxy** | Nginx with HTTPS |
| **Security** | Helmet, Rate Limiting, Input Sanitization |

---

## Quick Start

### Development (Local)

```bash
# 1. Clone repository
git clone https://github.com/Bhavya-Dhoot/jewelqr-system.git
cd jewelqr-system

# 2. Install backend dependencies
cd jewelry-qr-backend
npm install

# 3. Start MongoDB (local)
mongod

# 4. Start backend
npm run dev

# 5. Start frontend (new terminal)
cd ..
python -m http.server 8000

# 6. Open browser
open http://localhost:8000/jewelry-qr-frontend/
```

### Production (Docker)

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Production Deployment

```bash
# 1. Configure environment
cp .env.production.example .env
nano .env  # Fill in secrets

# 2. Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Deploy with Docker
docker-compose -f docker-compose.prod.yml up -d

# 4. Verify
curl -k https://localhost/api/health
```

See [SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md) for complete security documentation.

---

## Project Structure

```
jewelqr-system/
├── jewelry-qr-backend/       # Node.js API
│   ├── src/
│   │   ├── controllers/      # Route handlers
│   │   ├── models/           # Mongoose schemas
│   │   ├── routes/           # Express routes
│   │   ├── middleware/       # Auth, validation, security
│   │   ├── services/         # Business logic, caching
│   │   └── config/           # Environment config
│   ├── uploads/              # Item images
│   └── Dockerfile
├── jewelry-qr-frontend/      # Static HTML/CSS/JS
│   ├── css/                  # Stylesheets
│   ├── js/                   # JavaScript modules
│   ├── dashboard.html        # Admin dashboard
│   ├── create.html           # Create/edit items
│   ├── scan.html             # QR scanner
│   └── settings.html         # System settings
├── scripts/                  # Deployment scripts
│   ├── backup.sh             # MongoDB backup
│   └── restore.sh            # Backup restore
├── docker-compose.prod.yml   # Production stack
├── nginx.prod.conf           # Production Nginx
├── mongo-init.js             # MongoDB initialization
└── SYSTEM_DOCUMENTATION.md   # Complete documentation
```

---

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/login` | Login | Public |
| POST | `/api/auth/register` | Register user | Admin |
| GET | `/api/items` | List all items | Auth |
| POST | `/api/items` | Create item | Auth |
| GET | `/api/items/:sku` | Get item by SKU | Auth |
| PUT | `/api/items/:sku` | Update item | Auth |
| DELETE | `/api/items/:sku` | Soft delete item | Admin |
| POST | `/api/items/:sku/restore` | Restore item | Admin |
| GET | `/api/settings` | Get settings | Auth |
| PUT | `/api/settings` | Update settings | Admin |
| GET | `/api/dashboard/stats` | Dashboard stats | Auth |
| GET | `/api/public/item/:sku` | Public item view | Public |

---

## Security Features

- ✅ HTTPS only (TLS 1.2/1.3)
- ✅ Helmet security headers
- ✅ Rate limiting (login: 5/15min, API: 100/min)
- ✅ MongoDB injection sanitization
- ✅ JWT with 256-bit secret
- ✅ Secure cookies (httpOnly, sameSite)
- ✅ MongoDB authentication
- ✅ Daily automated backups

---

## Authorization

| Role | Create | Edit | Delete | Restore | Settings |
|------|--------|------|--------|---------|----------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| Staff | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## Documentation

- [SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md) — Complete system documentation (includes security details)

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.7.1 | Feb 2026 | Mobile QR, Image Serving, Tailscale HTTPS |
| 1.7.0 | Feb 2026 | Production Security Hardening |
| 1.6.1 | Feb 2026 | Soft Delete + Restore |
| 1.6.0 | Feb 2026 | Category Soft Delete |
| 1.5.5 | Jan 2026 | Settings Sync Fix |
| 1.5.0 | Jan 2026 | Dynamic Diamond Types |

---

## Author

**Bhavya Dhoot**

---

## License

Private - All Rights Reserved
