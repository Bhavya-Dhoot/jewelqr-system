# JewelQR System - Complete Documentation

> **Last Updated:** February 1, 2026  
> **Version:** 1.7.0  
> **Status:** Production Ready - Security Hardened

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Changelog](#changelog)
3. [Architecture](#architecture)
4. [Technology Stack](#technology-stack)
5. [Performance Architecture](#performance-architecture-v154)
6. [Security Architecture](#security-architecture-v170)
7. [Project Structure](#project-structure)
8. [Quick Start Guide](#quick-start-guide)
9. [Production Deployment](#production-deployment)
10. [Backend API Reference](#backend-api-reference)
11. [Database Schema](#database-schema)
12. [Frontend Pages](#frontend-pages)
13. [Dashboard Features](#dashboard-features)
14. [Scan Page Features](#scan-page-features)
15. [Authentication Flow](#authentication-flow)
16. [Key Implementation Details](#key-implementation-details)
17. [Backup & Recovery](#backup--recovery)
18. [Troubleshooting](#troubleshooting)
19. [Future Enhancements](#future-enhancements)

---

## System Overview

**JewelQR** is a full-stack web application for jewelry inventory management with QR code generation. It allows jewelry stores to:

- Create jewelry items with detailed composition (gold purity, weight, diamond details)
- Generate unique SKUs automatically
- Create QR codes containing item data
- Scan QR codes to view item details and calculate dynamic pricing
- Manage inventory via a dashboard

### Core Features

| Feature | Description |
|---------|-------------|
| **Auto-SKU Generation** | Unique SKUs with category prefix (e.g., `CHN-000017`) |
| **QR Code Creation** | QR codes contain only SKU - item details fetched from database on scan |
| **Dynamic Pricing** | Calculate real-time prices based on current gold/diamond rates |
| **Gold Purity Pricing** | Automatic purity factor: 24K=100%, 22K=92%, 18K=76%, 14K=60% *(v1.3.1)* |
| **Diamond Type Mapping** | Automatic ID normalization (marquise→mq, markish→mq) *(v1.3.2)* |
| **Dynamic Diamond Categories** | Add, edit, toggle active/inactive, delete diamond types via Settings *(v1.4.0)* |
| **Labour Cost** | Automatic calculation: Labour Rate × Gold Weight *(v1.3.0)* |
| **Role-Based Access** | Admin and Staff roles with different permissions |
| **Cloud Storage** | MongoDB database for persistent storage |
| **Offline Fallback** | Local storage fallback when API unavailable |

> **Note:** Polki/Stone article type support was **removed in v1.4.0**. The system is now diamond-only. Legacy polki items in the database remain accessible but display as "Legacy (Polki)" on the scan page.

---

## Changelog

### Version 1.7.0 (February 1, 2026)

**Production Security Hardening Release**

This release implements comprehensive security hardening for public internet deployment with HTTPS, authentication strengthening, rate limiting, input sanitization, and infrastructure automation.

---

#### 1. HTTPS + Nginx Reverse Proxy

| Feature | Implementation |
|---------|----------------|
| **HTTPS Only** | HTTP → HTTPS redirect (301) |
| **TLS Config** | TLS 1.2/1.3, modern cipher suite |
| **Let's Encrypt** | Automated SSL certificate renewal |
| **Security Headers** | CSP, HSTS, X-Frame-Options, X-XSS-Protection |
| **Gzip/Brotli** | Compression for all text responses |
| **Static Caching** | 30-day cache for assets |
| **Body Limit** | 10MB max request size |
| **Server Tokens** | Nginx version hidden |

**Files:**
- `nginx.prod.conf` — Production HTTPS configuration
- `nginx.dev.conf` — Development self-signed SSL

---

#### 2. Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` | 5 requests | 15 minutes |
| `/api/auth/*` | 20 requests | 5 minutes |
| `/api/*` | 100 requests | 1 minute |
| `/uploads` | 10 requests | 1 minute |

Implemented with `express-rate-limit` + Nginx `limit_req_zone`.

---

#### 3. Helmet Security Headers

```javascript
helmet({
    contentSecurityPolicy: { ... },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'sameorigin' },
    xssFilter: true,
    noSniff: true,
    hidePoweredBy: true
})
```

---

#### 4. Input Sanitization

| Protection | Package |
|------------|---------|
| MongoDB Injection | `express-mongo-sanitize` |
| Parameter Pollution | `hpp` |
| Body Size Limit | `express.json({ limit: '10kb' })` |
| XSS | Helmet CSP + input escaping |

---

#### 5. JWT Security

| Setting | Value |
|---------|-------|
| Secret Length | 256-bit (64 hex chars) |
| Expiration | 7 days (configurable) |
| Cookie | httpOnly, secure, sameSite=strict |
| Validation | Production requires 32+ char secret |

---

#### 6. MongoDB Security

| Feature | Implementation |
|---------|----------------|
| Authentication | Enabled with `--auth` |
| App User | `jewelqr_user` with `readWrite` only |
| Port Exposure | Internal only (not exposed to host) |
| Connection | `mongodb://user:pass@mongo:27017/jewelqr?authSource=admin` |

---

#### 7. Docker Production Stack

```yaml
services:
  nginx:    # HTTPS termination, only 80/443 exposed
  backend:  # Internal port 3000
  mongo:    # Internal port 27017 (NOT exposed)
  backup:   # Daily cron backup
```

**Files:**
- `docker-compose.prod.yml`
- `jewelry-qr-backend/Dockerfile` (non-root user)

---

#### 8. Backup Automation

| Feature | Implementation |
|---------|----------------|
| Schedule | Daily at 2:00 AM |
| Format | Compressed tarball with checksum |
| Retention | 30 days (configurable) |
| Location | `/backups/jewelqr_backup_YYYYMMDD_HHMMSS.tar.gz` |

**Files:**
- `scripts/backup.sh`
- `scripts/restore.sh`
- `scripts/mongo-init.js`

---

#### 9. Logging + Monitoring

| Feature | Implementation |
|---------|----------------|
| Logger | Pino (JSON in production, pretty in dev) |
| Request ID | Generated per request |
| Slow Requests | Warned if >1000ms |
| Error Tracking | Structured error logging |
| Health Endpoint | `/api/health` with uptime, cache stats |

**File:** `src/services/logger.service.js`

---

#### 10. Environment Configuration

```bash
# Required in production:
JWT_SECRET=<64-char-hex>              # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MONGO_URI=mongodb://...
CORS_ORIGIN=https://yourdomain.com
NODE_ENV=production
```

**File:** `.env.production.example`

---

#### 11. Files Created

| File | Purpose |
|------|---------|
| `nginx.prod.conf` | Production HTTPS reverse proxy |
| `nginx.dev.conf` | Development self-signed SSL |
| `docker-compose.prod.yml` | Full production stack |
| `.env.production.example` | Environment template |
| `scripts/backup.sh` | Daily MongoDB backup |
| `scripts/restore.sh` | Backup restoration |
| `scripts/mongo-init.js` | Database initialization |
| `scripts/deploy.sh` | Deployment automation |
| `Dockerfile` | Production container |
| `src/services/logger.service.js` | Pino structured logging |
| `src/middleware/security.middleware.js` | Helmet, sanitization, rate limiters |
| `SECURITY_HARDENING.md` | Security documentation |

---

#### 12. Files Modified

| File | Changes |
|------|---------|
| `src/app.js` | Helmet, rate limiters, sanitization, logging, graceful shutdown |
| `src/config/env.js` | Production validation, secure defaults |

---

#### 13. Security Checklist

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
- [x] Body size limits (10KB JSON, 10MB uploads)
- [x] Trust proxy configured

---

#### 14. Deployment Commands

```bash
# 1. Configure
cp .env.production.example .env
nano .env  # Fill in secrets

# 2. Generate SSL (development)
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/private.key -out ssl/certificate.crt -subj "/CN=localhost"

# 3. Deploy
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# 4. Verify
curl -k https://localhost/api/health

# 5. Logs
docker-compose -f docker-compose.prod.yml logs -f backend

# 6. Backup
docker exec jewelqr-backup /backup.sh
```

---

### Version 1.6.1 (February 1, 2026)

**Comprehensive Soft Delete System**

This release implements a complete soft-delete architecture for both **items** and **categories**, ensuring business data is never permanently lost and can always be restored.

---

#### 1. Item Soft Delete + Folder Renaming

When an item is deleted, it is NOT removed from the database. Instead:

| Action | Database Change | File System Change |
|--------|-----------------|-------------------|
| **Delete** | `deletedAt = Date`, `deletedBy = userId` | Folder renamed: `EAR-000023` → `DEL-EAR-000023` |
| **Restore** | `deletedAt = null`, `deletedBy = null` | Folder renamed: `DEL-EAR-000023` → `EAR-000023` |

**API Endpoints:**
```
DELETE /api/items/:sku           → Soft delete (admin only)
POST   /api/items/:sku/restore   → Restore deleted item (admin only)
```

**Delete Response:**
```json
{ "success": true, "message": "Item deleted successfully (can be restored)" }
```

**Restore Response:**
```json
{ "success": true, "message": "Item restored successfully", "data": {...} }
```

---

#### 2. Category Soft Delete via Renaming

Categories are soft-deleted by renaming with `DEL-` prefix instead of removing from database.

| Before (Hard Delete) | After (Soft Delete v1.6.1) |
|----------------------|----------------------------|
| `$pull: { jewelryCategories: { id } }` | Rename `id` → `DEL-{id}` |
| Document removed from DB | Document stays in DB |
| References break if items exist | References remain valid |
| Cannot recreate same name | Can reuse old names |

**Example:**
```
DELETE /api/settings/categories/chain

BEFORE: { id: "chain", name: "Chain", prefix: "CHN", isActive: true }
AFTER:  { id: "DEL-chain", name: "DEL-Chain", prefix: "CHN", isActive: false, deletedAt: "2026-02-01T..." }
```

**Validation Rules:**
- Cannot create categories with `DEL-` prefix (reserved for soft-deleted)
- Duplicate checks skip `DEL-` prefixed categories (allows name reuse)
- Double-delete prevented (`DEL-` categories cannot be deleted again)

---

#### 3. Dashboard Restore UI

Admins can now view and restore deleted items directly from the Dashboard.

| Feature | Description |
|---------|-------------|
| **Deleted Items Visible** | All items (active + deleted) shown in dashboard table |
| **Faded Row Styling** | Deleted items: `opacity: 0.5`, gray background |
| **"Deleted" Badge** | Red badge next to item name |
| **Restore Button** | Green restore icon (admin only) for deleted items |
| **Delete Button** | Red trash icon (admin only) for active items |
| **Instant Refresh** | Table + stats refresh after delete/restore |

**Frontend Usage:**
```javascript
// Delete item
const deleteResult = await api.deleteItem('EAR-000023');

// Restore item
const restoreResult = await api.restoreItem('EAR-000023');
if (restoreResult.success) showToast('Item restored!', 'success');
```

---

#### 4. Files Modified

**Backend:**

| File | Changes |
|------|---------|
| `items.controller.js` | `deleteItem` renames folder to `DEL-{sku}`; `restoreItem` renames back to `{sku}` |
| `dashboard.controller.js` | Removed `deletedAt: null` filter; includes `deletedAt` in response |
| `settings.controller.js` | `removeCategory` renames with `DEL-` prefix; `addCategory` prevents `DEL-` prefix |
| `Settings.js` | Added `deletedAt: String` field to `jewelryCategories` schema |

**Frontend:**

| File | Changes |
|------|---------|
| `dashboard.js` | `populateItemsTable` shows deleted styling + restore button; added `restoreItem()` function |
| `api.js` | Added `restoreItem(sku)` function |

---

#### 5. Soft Delete Philosophy

This system mirrors the `items.deletedAt` pattern established in v1.0:

> **"Never hard-delete business data."**

| Entity | Soft Delete Method | Restore Method |
|--------|-------------------|----------------|
| **Items** | `deletedAt = Date` | `deletedAt = null` |
| **Item Folders** | Rename to `DEL-{sku}` | Rename back to `{sku}` |
| **Categories** | Rename id/name with `DEL-` prefix | (Not yet implemented) |

---

### Version 1.6.0 (February 1, 2026)

**Category Management Feature Parity with Diamond Types**

Jewelry categories now support full CRUD operations identical to diamond types.

| Feature | Diamond Types | Categories (NEW) |
|---------|---------------|------------------|
| Add | ✅ POST /diamond-types | ✅ POST /categories |
| Edit | ✅ PUT /diamond-types/:id | ✅ PUT /categories/:id |
| Delete | ✅ DELETE /diamond-types/:id | ✅ DELETE /categories/:id |
| Usage Check | ✅ GET /diamond-types/:id/usage | ✅ GET /categories/:id/usage |
| Active Toggle | ✅ isActive field | ✅ isActive field |
| Block Delete if Used | ✅ | ✅ |
| Dynamic Dropdown | ✅ Only active shown | ✅ Only active shown |
| Settings UI | ✅ Table with toggle | ✅ Table with toggle |
| Cache Invalidation | ✅ | ✅ |

**Backend Changes:**
- `Settings.js` — Added `isActive: Boolean` to jewelryCategories schema + migration
- `settings.controller.js` — Added `updateCategory()` and `updateDiamondType()` endpoints
- `settings.routes.js` — Added PUT routes for both resources
- Usage check now queries `category.id` (fixed from `category`)

**Frontend Changes:**
- `api.js` — Added `updateCategory()` and `updateDiamondType()` functions
- `settings.html` — Added Active toggle column + `toggleCategoryActive()` function
- `create.js` — Added `populateCategoryDropdown()` filtering only active categories

**API Endpoints:**
```
POST   /api/settings/categories          — Add category
PUT    /api/settings/categories/:id      — Update category (name, prefix, isActive)
GET    /api/settings/categories/:id/usage — Check item count using category
DELETE /api/settings/categories/:id      — Delete (blocked if items exist)
```

---

### Version 1.5.5 (January 31, 2026)

**Settings Sync Workflow Fix**

Critical bug fix ensuring settings changes (especially tax=0) reflect instantly across all pages.

| Issue | Location | Root Cause | Fix Applied |
|-------|----------|------------|-------------|
| Tax=0 not saving | `settings.html` | `parseFloat() \|\| 3` treats 0 as falsy | Use `isNaN()` check |
| Tax=0 not loading | `settings.html` | `rates.taxPercent \|\| 3` treats 0 as falsy | Use `??` operator |
| Scan uses stale data | `scan.js` | `initConfig()` returns cached | Changed to `refreshConfig()` |
| Scan shows hardcoded 3 | `scan.html` | `value="3"` hardcoded in HTML | Removed hardcode |
| Cache not updating | `config.js` | `saveAllSettings` didn't update `configCache` | Added `configCache = config` |

**Settings Sync Workflow (Complete):**

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Settings Page  │────►│   config.js  │────►│   Backend API   │
│  (settings.html)│     │saveAllSettings│     │updateSettings() │
└─────────────────┘     └──────────────┘     └─────────────────┘
                               │                      │
                               ▼                      ▼
                        ┌──────────────┐     ┌─────────────────┐
                        │ localStorage │     │  MongoDB + Cache│
                        │ + configCache│     │  Invalidation   │
                        └──────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  Scan Page   │◄── refreshConfig() fetches fresh
                        │  (scan.html) │
                        └──────────────┘
```

**JavaScript Falsy-0 Pattern Fix:**

```javascript
// ❌ WRONG: 0 is falsy, so defaults to 3
const tax = parseFloat(input.value) || 3;

// ✅ CORRECT: Only default when truly invalid
const taxVal = parseFloat(input.value);
const tax = isNaN(taxVal) ? 3 : taxVal;

// ✅ ALSO CORRECT: Nullish coalescing for loading
const tax = rates.taxPercent ?? 3;
```

**Files Modified:**
- `js/config.js` — `saveAllSettings` now updates in-memory `configCache`
- `js/scan.js` — Uses `refreshConfig()` + `??` operator for 0-safe loading
- `settings.html` — Uses `isNaN()` for saving, `??` for loading
- `scan.html` — Removed hardcoded `value="3"` from tax input

---

### Version 1.5.4 (January 31, 2026)

**Performance Optimization Patch**

| Category | Optimization |
|----------|-------------|
| **Backend Caching** | `cache.service.js` - Settings (5min), Dashboard stats (30s), Recent items (15s) |
| **Settings Caching** | `getSettings` cached with 5-min TTL, invalidated on mutations |
| **Query Optimization** | Dashboard uses single `$facet` aggregation instead of 4 parallel queries |
| **Lean Queries** | All read operations use `.lean()` for 2-5x faster Mongoose reads |
| **Compression** | GZIP middleware (level 6, >1KB threshold) |
| **Indexes** | 8 total: `deletedAt+createdAt`, `deletedAt+gold.weight_g`, `deletedAt+category.name`, `deletedAt+diamonds.type_id`, User `isActive+role` |
| **Keep-Alive** | Socket keep-alive 65s for connection reuse |
| **Cache Headers** | Static files served with 1-day cache + ETag |
| **Request Dedup** | Frontend api.js deduplicates concurrent GET requests |
| **DOM Caching** | `$()` and `$id()` helpers cache DOM lookups |
| **Utility Helpers** | `throttle()`, `escapeHtml()` for frontend performance |

**Files Created:**
- `src/services/cache.service.js`

**Files Modified:**
- `src/app.js` — Compression, keep-alive, static cache headers
- `src/controllers/dashboard.controller.js` — Faceted aggregation + caching
- `src/controllers/items.controller.js` — lean() + cache invalidation
- `src/controllers/settings.controller.js` — Settings caching + single-pass loops
- `src/models/Item.js` — 4 compound indexes
- `src/models/User.js` — 1 compound index (username via unique:true)
- `js/api.js` — Request deduplication
- `js/utils.js` — DOM caching, throttle, escapeHtml

---

### Version 1.5.3 (January 31, 2026)

**Performance Profiling Infrastructure**

| Component | Addition |
|-----------|----------|
| **Backend** | `profiling.middleware.js` - request timing, memory monitoring, event loop lag, slow Mongo queries |
| **Frontend** | `profiler.js` - API timing, duplicate detection, DOM query counting, timer cleanup |
| **Enable** | Backend: `PROFILE_MODE=true` env var | Frontend: `localStorage.PROFILE_MODE="true"` |

**Key Features:**
- Warns on requests > 500ms, errors on > 1500ms
- Detects duplicate API calls within 2s window
- Monitors event loop blocking (> 100ms lag)
- Tracks uncleaned intervals/timeouts
- Memory usage logging every 60s

---

### Version 1.5.2 (January 31, 2026)

**Performance Audit & Dead Code Removal**

| Change | Description |
|--------|-------------|
| **Dead Code** | Removed 7 unused functions (~100 lines) from `utils.js`, `create.js`, `dashboard.js` |
| **Duplicates** | Eliminated duplicate `debounce()` in dashboard.js, duplicate `formatCurrency()` patterns |
| **Config Calls** | Reduced redundant `config.initConfig()` calls in scan.js (2→1 per scan) |
| **Memory Leaks** | Added `pagehide` camera cleanup event + error handling in scan.js |

**Files Modified:**
- `utils.js`: 155→53 lines (-66%)
- `create.js`: Removed deprecated `getPolkiTypeOptionsHTML()`
- `dashboard.js`: Removed duplicate `debounce()` function
- `scan.js`: Optimized config calls, improved camera cleanup

---

### Version 1.5.1 (January 31, 2026)

**Authentication Redirect Loop Fix**

| Change | Description |
|--------|-------------|
| **Bug Fix** | Fixed infinite redirect loop between login and dashboard pages |
| **Root Cause** | 401 errors only cleared JWT token but left `jewelqr_auth` flag in localStorage |
| **Impact** | `isAuthenticated()` returned true on fallback check causing redirect loop |
| **Resolution** | Now clears ALL auth keys on 401/403: `jewelqr_jwt`, `jewelqr_auth`, `jewelqr_user` |

**Technical Details:**

The issue manifested as rapid alternating between dashboard and login pages, eventually triggering 429 (Too Many Requests) rate limiting. The fix ensures complete auth state cleanup when authentication fails.

```javascript
// api.js - On 401 error, now clears all auth state
removeToken();                              // JWT token
localStorage.removeItem('jewelqr_auth');    // Auth flag (NEW)
localStorage.removeItem('jewelqr_user');    // User data
```

---

### Version 1.5.0 (January 27, 2026)

**Category & Diamond Type Persistence to MongoDB**

| Change | Description |
|--------|-------------|
| **Backend `getSettings`** | Now returns `diamondPricing`, `diamondTypeAliases`, and `jewelryCategories` |
| **Backend `addDiamondType`** | Accepts `id`, `label`, `realRate`, `cvdRate` - persists to `diamondPricing` Map |
| **Backend Migration** | `getSettings` auto-merges missing default diamond types on first call |
| **Frontend `api.js`** | Added `addCategory()`, `checkCategoryUsage()`, `removeCategory()` functions |
| **Frontend `config.js`** | Added `refreshConfig()` to force-fetch fresh data from API |
| **Frontend `settings.html`** | Added Jewelry Categories management UI section |
| **Diamond Types UI** | Add button now calls backend API (not just localStorage) |
| **Category UI** | New table to display, add, and delete jewelry categories |

**Technical Details:**

| Component | Change |
|-----------|--------|
| `Settings.js` (model) | `getSettings()` now merges missing default types with existing entries |
| `validation.middleware.js` | Updated `addDiamondTypeSchema` for new fields |
| `settings.controller.js` | `getSettings` converts Map to plain object for JSON response |
| `settings.html` | `renderCategories()` called on init; add/delete handlers use API |

---

### Version 1.4.0 (January 26, 2026)

**Polki/Stone UI Removal (Diamond-Only Mode)**

| Change | Description |
|--------|-------------|
| **Create Page** | Removed Article Type toggle (Diamond/Polki) |
| **Create Page** | Removed Polki Section entirely |
| **Create Page** | All new items are now diamond-only |
| **Settings Page** | Removed Polki/Stone Pricing card |
| **Settings Page** | Removed polki-related JavaScript functions |
| **Scan Page** | Legacy polki items show "⚠️ Legacy (Polki)" label |
| **Scan Page** | Polki stone details hidden, pricing still calculated |
| **Backend** | Schema fields preserved for backward compatibility |

**Dynamic Diamond Category Management**

| Change | Description |
|--------|-------------|
| **Add Diamond Types** | New types can be added via Settings UI |
| **Edit Labels/Rates** | Inline editing for all diamond type properties |
| **Toggle Active/Inactive** | Inactive types hidden from Create dropdown |
| **Delete with Usage Check** | Cannot delete types used by existing items |
| **Type Aliases** | Support for alias mapping (marquise→mq) via config |

**Technical Changes**

| File | Change |
|------|--------|
| `create.html` | Removed article type toggle and polki section HTML |
| `create.js` | Removed polki state/functions, always sends `articleType: 'diamond'` |
| `settings.html` | Removed polki pricing card and related functions |
| `scan.js` | Shows "Legacy (Polki)" label for polki items |
| `config.js` | Added `getDiamondTypeAliases()`, filter by `isActive` |
| `api.js` | Added `checkDiamondTypeUsage()`, `removeDiamondType(id, force)` |

---

### Version 1.3.2 (December 28, 2024)

**Diamond Rate Mapping & Calculation Fixes**

| Change | Description |
|--------|-------------|
| **Type ID Normalization** | Added mapping to handle legacy/variant diamond type IDs |
| **Mapping: marquise→mq** | Items with `type_id: 'marquise'` now use MQ rates |
| **Mapping: markish→mq** | Items with `type_id: 'markish'` now use MQ rates |
| **Fresh Config on Scan** | Scan page now calls `initConfig()` to fetch latest rates from API |
| **Console Logging** | Added logging when type mapping occurs for debugging |

**Dashboard Button Fixes**

| Change | Description |
|--------|-------------|
| **Download QR Fixed** | Fixed `generateAndDownloadQR()` to use correct `QRCode.toCanvas()` API |
| **Delete Authorization** | Changed from admin-only to any authenticated user |
| **Error Handling** | Added proper error toasts for failed operations |

**Configuration Cache Behavior**

| Setting | Value |
|---------|-------|
| **Cache Duration** | 5 minutes (`CACHE_DURATION = 5 * 60 * 1000`) |
| **Cache Key** | `jewelqr_config_cache_time` in localStorage |
| **Refresh Triggers** | Page load (if cache expired), Settings save, Manual clear |

**Technical Changes**

| File | Change |
|------|--------|
| `scan.js` | Added `initConfig()` call in `initializeScan()` |
| `scan.js` | Added `typeIdMap` for diamond ID normalization |
| `dashboard.js` | Fixed `generateAndDownloadQR()` to use node-qrcode API |
| `items.routes.js` | Removed `authorize('admin')` from DELETE route |

---

### Version 1.3.1 (December 28, 2024)

**Gold Purity-Based Pricing**

| Purity | Factor | Description |
|--------|--------|-------------|
| 24K | 1.00 | 100% pure gold |
| 22K | 0.92 | 92% gold content |
| 18K | 0.76 | 76% gold content |
| 14K | 0.60 | 60% gold content |

| Change | Description |
|--------|-------------|
| **New Formula** | Gold Value = Weight × Rate × Purity Factor |
| **config.js** | Added `GOLD_PURITY_FACTORS` constant and `getPurityFactor()` function |
| **scan.js** | Updated `calculatePrice()` to apply purity factor |
| **UI Display** | Shows purity percentage and calculation formula in breakdown |

---

### Version 1.3.0 (December 28, 2024)

**Polki Article Type Support** *(Note: UI removed in v1.4.0, schema preserved for legacy)*

| Change | Description |
|--------|-------------|
| **Article Type Field** | Added `articleType` field to Item model |
| **Polki/Stone Entries** | Added `polkiStones` array to Item schema |
| **Backend Schema** | Added validation for polki data |
| ~~**Scan Page Display**~~ | *Removed in v1.4.0 - now shows Legacy label* |
| ~~**Price Calculation**~~ | *Still works for legacy items* |

**Labour Cost Calculation**

| Change | Description |
|--------|-------------|
| **New Formula** | Labour Cost = Labour Rate (₹/gram) × Gold Weight (grams) |
| **Rate Configuration** | Single `labourRate` replaces old `makingCharges` + `labourCharges` |
| **Settings Page** | Updated to use Labour Rate input (per gram) |
| **Price Breakdown** | Shows calculated Labour Cost in scan page |

**Technical Changes**

| Change | Description |
|--------|-------------|
| **validation.middleware.js** | Added `articleType` enum and `polkiStones` array to Joi schemas |
| **Item.js** | Updated Mongoose schema with Polki stone subdocument |
| **Settings.js** | Changed rates schema to use `labourRate` |
| **scan.js** | Updated `calculatePrice()` and `displayComposition()` for Polki |
| **create.js** | Added `collectFormData()` support for Polki entries |

### Version 1.2.0 (December 26, 2024)

**Dashboard Enhancements**

| Change | Description |
|--------|-------------|
| **View Item Modal** | Full item details modal with QR code preview |
| **Two-Column Layout** | Item details on left, live QR code on right |
| **Diamond Type Indicators** | Table shows first letter of diamond types (P, R, M) |
| **Fresh API Data** | Modal fetches from `getItemBySku()` for data consistency |
| **QR Generation** | Live QR code generated in modal for visual verification |

**Scan Page Refactoring**

| Change | Description |
|--------|-------------|
| **Inline SKU Entry** | Manual SKU entry now inline (not modal popup) |
| **Simplified Error Modal** | Removed redundant "Enter SKU Manually" button |
| **Better UX** | SKU entry always visible below camera |
| **Permission Denied State** | Clear guidance when camera access denied |

**Architecture Changes**

| Change | Description |
|--------|-------------|
| **SKU-Only QR Codes** | QR codes now contain only SKU string |
| **Backend Authority** | Server generates authoritative SKU via atomic counter |
| **Placeholder SKU** | Frontend shows `XXX-XXXXXX` until server responds |
| **Backward Compatibility** | Scan page handles legacy JSON QR codes |

### Version 1.1.0 (December 26, 2024)

- Initial SKU-only QR architecture implementation
- Backend atomic counter for unique SKU generation
- Documentation updates for QR data flow

### Version 1.0.0 (December 2024)

- Initial release with full CRUD operations
- JWT authentication with role-based access
- QR code generation and scanning
- Dynamic price calculation

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Frontend (Vanilla JS + HTML + CSS)                       │  │
│  │  Port: 8000 (Python HTTP Server)                          │  │
│  │                                                           │  │
│  │  Pages: index.html, login.html, create.html,              │  │
│  │         dashboard.html, scan.html, settings.html          │  │
│  │                                                           │  │
│  │  JS Modules: api.js, auth.js, config.js, utils.js,        │  │
│  │              create.js, dashboard.js, scan.js             │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP Requests
                              │ (CORS Enabled)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API SERVER                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Node.js + Express.js                                     │  │
│  │  Port: 3000                                               │  │
│  │                                                           │  │
│  │  Routes: /api/auth, /api/items, /api/settings,            │  │
│  │          /api/dashboard, /api/health                      │  │
│  │                                                           │  │
│  │  Middleware: JWT Auth, Joi Validation, CORS               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Mongoose ODM
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         MONGODB                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Database: jewelqr                                        │  │
│  │  Port: 27017                                              │  │
│  │                                                           │  │
│  │  Collections: users, items, settings                      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend

| Technology | Purpose | Version |
|------------|---------|---------|
| Node.js | Runtime environment | v22.x |
| Express.js | Web framework | ^4.18.2 |
| Mongoose | MongoDB ODM | ^8.0.0 |
| jsonwebtoken | JWT authentication | ^9.0.0 |
| bcryptjs | Password hashing | ^2.4.3 |
| Joi | Request validation | ^17.9.0 |
| cors | Cross-origin requests | ^2.8.5 |
| compression | GZIP response compression | ^1.7.4 |
| express-rate-limit | API rate limiting | ^7.1.0 |
| dotenv | Environment variables | ^16.0.0 |
| nodemon | Development auto-reload | ^3.0.0 |

### Frontend

| Technology | Purpose |
|------------|---------|
| HTML5 | Page structure |
| CSS3 | Styling with CSS custom properties |
| Vanilla JavaScript | Application logic |
| QRCode.js | QR code generation |
| html5-qrcode | QR code scanning |
| Fetch API | HTTP requests |
| LocalStorage | Offline data persistence |

### Database

| Technology | Purpose |
|------------|---------|
| MongoDB | Document database |
| MongoDB Compass | GUI (optional) |

### Development Tools

| Tool | Purpose |
|------|---------|
| Python HTTP Server | Frontend static file serving |
| nodemon | Backend auto-reload on changes |

---

## Performance Architecture (v1.5.4)

This section documents the performance optimizations implemented across the stack.

### Backend Caching Layer

The system uses an in-memory TTL-based cache service (`src/services/cache.service.js`) to reduce database load.

| Cache Key | TTL | Description |
|-----------|-----|-------------|
| `settings:global` | 5 min | Application settings (rates, diamond pricing) |
| `dashboard:stats` | 30 sec | Dashboard statistics (counts, aggregations) |
| `dashboard:recent:N` | 15 sec | Recent items list (per limit value) |

**Cache Invalidation:**
- Settings cache cleared on `/api/settings` PUT
- Dashboard cache cleared on item create/update/delete/restore

```javascript
// Cache usage pattern
const cached = cache.get(CACHE_KEYS.DASHBOARD_STATS);
if (cached) return res.json({ success: true, data: cached, cached: true });
// ... fetch from DB, then cache
cache.set(CACHE_KEYS.DASHBOARD_STATS, result, TTL.DASHBOARD_STATS);
```

### Response Compression

GZIP compression enabled for all API responses over 1KB:

```javascript
// app.js
app.use(compression({
    level: 6,              // Balance speed vs compression ratio
    threshold: 1024,       // Only compress > 1KB responses
}));
```

**Impact:** ~70% smaller response payloads for JSON data.

### Database Indexes

#### Item Collection Indexes

| Index | Fields | Purpose |
|-------|--------|---------|
| Primary | `sku` (unique) | SKU lookups |
| Category | `category.id` | Category filtering |
| Temporal | `createdAt` (desc) | Recent items sorting |
| Soft Delete | `deletedAt` | Exclude deleted items |
| Dashboard Stats | `deletedAt` + `createdAt` | Stats aggregation |
| Gold Aggregation | `deletedAt` + `gold.weight_g` | Gold weight sum |
| Category Aggregation | `deletedAt` + `category.name` | Category breakdown |

#### User Collection Indexes

| Index | Fields | Source | Purpose |
|-------|--------|--------|---------|
| Username | `username` (unique) | `unique: true` in schema | Login lookups |
| Role Filter | `isActive` + `role` | Explicit `schema.index()` | Active user queries |

> **Note:** Do NOT add `schema.index({ username: 1 })` — the `unique: true` constraint on the username field automatically creates this index. Adding both causes Mongoose duplicate index warnings.

### Query Optimizations

| Optimization | Before | After | Impact |
|--------------|--------|-------|--------|
| Dashboard Stats | 4 parallel queries | 1 `$facet` aggregation | -75% DB calls |
| Read Queries | Full Mongoose docs | `.lean()` | 2-5x faster |
| Projections | All fields | Only needed fields | Smaller payloads |
| Aggregations | Multiple stages | Single pipeline | Reduced processing |

**Dashboard Faceted Aggregation:**
```javascript
const [stats] = await Item.aggregate([
    { $match: { deletedAt: null } },
    { $facet: {
        totalItems: [{ $count: 'count' }],
        todayItems: [{ $match: { createdAt: { $gte: today } } }, { $count: 'count' }],
        categoryBreakdown: [
            { $group: { _id: '$category.name', count: { $sum: 1 } } },
            { $sort: { count: -1 } }, { $limit: 10 }
        ],
        totalGold: [{ $group: { _id: null, total: { $sum: '$gold.weight_g' } } }]
    }}
]);
```

### HTTP Optimizations

| Setting | Value | Purpose |
|---------|-------|---------|
| Keep-Alive Timeout | 65s | Connection reuse |
| Headers Timeout | 66s | Slightly above keep-alive |
| Trust Proxy | Enabled | Accurate rate limiting behind proxy |
| Static Cache | 1 day + ETag | Browser caching for uploads |

### Profiling Infrastructure (v1.5.3)

Performance profiling can be enabled to detect bottlenecks.

**Backend Profiling (`PROFILE_MODE=true`):**

| Metric | Threshold | Action |
|--------|-----------|--------|
| Request Duration | > 500ms | Warning log |
| Request Duration | > 1500ms | Error log |
| Mongo Query | > 200ms | Warning log |
| Event Loop Lag | > 100ms | Warning log |
| Heap Memory | > 200MB | Warning log |

**Frontend Profiling (`localStorage.PROFILE_MODE = "true"`):**

| Metric | Detection |
|--------|-----------|
| API Duration | Logs all API calls with timing |
| Duplicate Calls | Warns if same endpoint called within 2s |
| DOM Queries | Warns if > 100 queries per 10s |
| Event Listeners | Warns if same listener added 3+ times |
| Uncleaned Timers | Warns on page unload if intervals not cleared |

**Enable Profiling:**
```bash
# Backend
set PROFILE_MODE=true && npm run dev

# Frontend (browser console)
localStorage.setItem('PROFILE_MODE', 'true'); location.reload();
# Or: Profiler.enable()
```

### Frontend Optimizations

| Optimization | File | Description |
|--------------|------|-------------|
| Request Deduplication | `api.js` | Concurrent identical GET requests share same promise |
| Config Caching | `config.js` | In-memory + localStorage with 5-min TTL |
| DOM Selector Caching | Various | Cached element references |
| Camera Cleanup | `scan.js` | Proper cleanup on `beforeunload` + `pagehide` |
| Debounced Search | `dashboard.js` | Uses shared `debounce` from `utils.js` |

**Request Deduplication Pattern:**
```javascript
// api.js
if (method === 'GET') {
    const pending = pendingRequests.get(url);
    if (pending) return pending; // Return existing promise
    
    const promise = performRequest(url, options);
    pendingRequests.set(url, promise);
    promise.finally(() => setTimeout(() => pendingRequests.delete(url), 100));
    return promise;
}
```

---

## Project Structure

```
e:\Software Engineering\
│
├── jewelry-qr-backend/           # Node.js Backend
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js       # MongoDB connection
│   │   │   └── env.js            # Environment config
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── items.controller.js
│   │   │   ├── settings.controller.js
│   │   │   ├── dashboard.controller.js
│   │   │   └── index.js
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js    # JWT verification
│   │   │   ├── validation.middleware.js  # Joi schemas
│   │   │   └── index.js
│   │   ├── models/
│   │   │   ├── User.js           # User schema
│   │   │   ├── Item.js           # Jewelry item schema
│   │   │   ├── Settings.js       # Global settings schema
│   │   │   └── index.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── items.routes.js
│   │   │   ├── settings.routes.js
│   │   │   ├── dashboard.routes.js
│   │   │   └── index.js
│   │   ├── services/
│   │   │   ├── sku.service.js    # SKU generation
│   │   │   └── index.js
│   │   ├── app.js                # Express app entry point
│   │   └── seed.js               # Database seeding script
│   ├── .env                      # Environment variables
│   ├── .env.example              # Template for .env
│   └── package.json
│
├── jewelry-qr-frontend/          # Static Frontend
│   ├── css/
│   │   ├── design-system.css     # CSS variables & base
│   │   ├── components.css        # Reusable components
│   │   ├── nav.css               # Navigation styles
│   │   ├── landing.css           # Home page styles
│   │   ├── login.css             # Login page styles
│   │   ├── create.css            # Create page styles
│   │   ├── dashboard.css         # Dashboard styles
│   │   └── scan.css              # Scan page styles
│   ├── js/
│   │   ├── api.js                # API service module ⭐
│   │   ├── auth.js               # Authentication module ⭐
│   │   ├── config.js             # Settings/config module
│   │   ├── utils.js              # Utility functions
│   │   ├── components.js         # UI components
│   │   ├── create.js             # Create page logic ⭐
│   │   ├── dashboard.js          # Dashboard logic ⭐
│   │   └── scan.js               # Scan page logic
│   ├── index.html                # Home/Landing page
│   ├── login.html                # Login page
│   ├── create.html               # Create item page
│   ├── dashboard.html            # Dashboard page
│   ├── scan.html                 # Scan QR page
│   └── settings.html             # Settings page
│
├── docker-compose.yml            # Docker orchestration
├── nginx.conf                    # Nginx config (production)
├── mongo-init.js                 # Docker MongoDB seed
└── SYSTEM_DOCUMENTATION.md       # This file
```

---

## Quick Start Guide

### Prerequisites

1. **Node.js** v18+ installed
2. **MongoDB** running locally on port 27017
3. **Python** 3.x installed (for frontend server)

### Step 1: Start MongoDB

```bash
# Windows - MongoDB should auto-start as a service
# Or start manually:
mongod --dbpath C:\data\db

# Verify MongoDB is running:
# Connect with MongoDB Compass to mongodb://localhost:27017
```

### Step 2: Start Backend Server

```powershell
# Navigate to backend directory
cd e:\Software Engineering\jewelry-qr-backend

# Install dependencies (first time only)
npm install

# Seed the database (first time only)
node src/seed.js

# Start development server
npm run dev
```

**Expected Output:**
```
🚀 Server running on port 3000 in development mode
MongoDB Connected: localhost
```

### Step 3: Start Frontend Server

```powershell
# Open a NEW terminal
cd e:\Software Engineering

# Start Python HTTP server
python -m http.server 8000
```

**Expected Output:**
```
Serving HTTP on :: port 8000 (http://[::]:8000/) ...
```

### Step 4: Access the Application

| Page | URL |
|------|-----|
| Home | http://localhost:8000/jewelry-qr-frontend/index.html |
| Login | http://localhost:8000/jewelry-qr-frontend/login.html |
| Dashboard | http://localhost:8000/jewelry-qr-frontend/dashboard.html |
| Create | http://localhost:8000/jewelry-qr-frontend/create.html |
| Scan | http://localhost:8000/jewelry-qr-frontend/scan.html |
| Settings | http://localhost:8000/jewelry-qr-frontend/settings.html |

### Step 5: Login Credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | admin | admin123 |
| Staff | staff | staff123 |

---

## Backend API Reference

### Base URL

```
http://localhost:3000/api
```

### Authentication

All protected endpoints require JWT token in header:
```
Authorization: Bearer <token>
```

### Endpoints

#### Health Check

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Check API status |

**Response:**
```json
{
  "success": true,
  "message": "JewelQR API is running",
  "environment": "development"
}
```

---

#### Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | No | Login user |
| GET | `/auth/me` | Yes | Get current user |
| POST | `/auth/logout` | Yes | Logout user |

**POST /auth/login**
```json
// Request
{
  "username": "admin",
  "password": "admin123"
}

// Response
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "username": "admin",
    "name": "Admin User",
    "role": "admin"
  }
}
```

---

#### Items Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/items` | Yes | Get all items (paginated) |
| GET | `/items/:sku` | Yes* | Get item by SKU (*Public for scan page via proxy) |
| POST | `/items` | Yes | Create new item |
| PUT | `/items/:sku` | Yes | Update item |
| DELETE | `/items/:sku` | Yes | Delete item (any authenticated user) |

**POST /items - Create Item**
```json
// Request
{
  "sku": "CHN-A1B2C3",
  "name": "18K Gold Chain",
  "category": {
    "id": "chain",
    "name": "Chain",
    "prefix": "CHN"
  },
  "gold": {
    "purity": "18K",
    "weight_g": 15.5
  },
  "diamonds": [
    {
      "type_id": "round",
      "type_name": "Round",
      "source": "real",
      "source_name": "Real Diamond",
      "weight_ct": 0.25
    }
  ],
  "qrData": "CHN-A1B2C3"  // SKU only - item details fetched from DB on scan
}

// Response
{
  "success": true,
  "message": "Item created successfully",
  "data": { /* created item */ }
}
```

**GET /items - List Items**
```json
// Query params: ?page=1&limit=20&search=chain&category=chain

// Response
{
  "success": true,
  "data": [ /* array of items */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

---

#### Dashboard Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/dashboard/stats` | Yes | Get dashboard statistics |
| GET | `/dashboard/recent` | Yes | Get recent items |

**GET /dashboard/stats**
```json
{
  "success": true,
  "data": {
    "totalItems": 45,
    "todayItems": 3,
    "totalGoldWeight": 523.5,
    "categoryBreakdown": [
      { "_id": "chain", "count": 15 },
      { "_id": "bangles", "count": 12 }
    ]
  }
}
```

---

#### Settings Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/settings` | No | Get global settings |
| PUT | `/settings` | Admin | Update rates and pricing |
| POST | `/settings/diamond-types` | Admin | Add diamond type with pricing |
| GET | `/settings/diamond-types/:id/usage` | Admin | Check if type is in use |
| DELETE | `/settings/diamond-types/:id` | Admin | Remove diamond type (blocked if in use) |
| POST | `/settings/categories` | Admin | Add jewelry category |
| GET | `/settings/categories/:id/usage` | Admin | Check if category is in use |
| DELETE | `/settings/categories/:id` | Admin | Remove category (blocked if in use) |

**POST /settings/diamond-types** *(v1.5.0)*
```json
// Request
{
  "id": "emerald",
  "label": "Emerald Cut",
  "realRate": 55000,
  "cvdRate": 27500
}

// Response
{
  "success": true,
  "message": "Diamond type added successfully",
  "data": { "id": "emerald", "label": "Emerald Cut", "realRate": 55000, "cvdRate": 27500, "isActive": true }
}
```

**POST /settings/categories** *(v1.5.0)*
```json
// Request
{
  "name": "Bracelet",
  "prefix": "BRC"
}

// Response
{
  "success": true,
  "message": "Category added successfully",
  "data": { "id": "bracelet", "name": "Bracelet", "prefix": "BRC" }
}
```

**GET /settings** *(v1.5.0 response)*
```json
{
  "success": true,
  "data": {
    "diamondPricing": {
      "solitaire": { "label": "Solitaire", "realRate": 100000, "cvdRate": 50000, "isActive": true },
      "rd": { "label": "RD", "realRate": 50000, "cvdRate": 25000, "isActive": true },
      "mq": { "label": "MQ", "realRate": 45000, "cvdRate": 22500, "isActive": true },
      "emerald": { "label": "Emerald Cut", "realRate": 55000, "cvdRate": 27500, "isActive": true }
    },
    "diamondTypeAliases": {
      "marquise": "mq",
      "markish": "mq"
    },
    "diamondTypes": [
      { "id": "solitaire", "name": "Solitaire", "rateMultiplier": 1.0 },
      { "id": "rd", "name": "RD", "rateMultiplier": 1.0 }
    ],
    "jewelryCategories": [
      { "id": "chain", "name": "Chain", "prefix": "CHN" },
      { "id": "bangles", "name": "Bangles", "prefix": "BNG" },
      { "id": "earrings", "name": "Earrings", "prefix": "EAR" },
      { "id": "bracelet", "name": "Bracelet", "prefix": "BRC" }
    ],
    "rates": {
      "goldRate": 6500,
      "labourRate": 500,
      "taxPercent": 3
    },
    "qrSettings": {
      "size": 256,
      "background": "#FFFFFF",
      "errorLevel": "H"
    }
  }
}
```

---

## Database Schema

### Users Collection

```javascript
{
  _id: ObjectId,
  username: String (unique, required),
  password: String (bcrypt hashed),
  name: String (required),
  role: "admin" | "staff",
  createdAt: Date,
  updatedAt: Date
}
```

### Items Collection

```javascript
{
  _id: ObjectId,
  sku: String (unique, required, uppercase),
  name: String (optional),
  
  // Article type - always "diamond" for new items (v1.4.0+)
  // Legacy items may have "polki" - handled gracefully
  articleType: "diamond" | "polki" (default: "diamond"),
  
  category: {
    id: String (required),
    name: String (required),
    prefix: String (required, 3 chars)
  },
  gold: {
    purity: "14K" | "18K" | "22K" | "24K",
    weight_g: Number (positive)
  },
  
  // Diamond entries
  diamonds: [
    {
      type_id: String,
      type_name: String,
      source: "real" | "cvd",
      source_name: String,
      weight_ct: Number (positive, max 100)
    }
  ],
  
  // DEPRECATED (v1.4.0): Polki/Stone entries - kept for legacy items
  // New items always have polkiStones: []
  polkiStones: [
    {
      type_id: "stone" | "polki" (required),
      type_name: String (optional),
      weight_ct: Number (positive, max 100)
    }
  ],
  
  qrData: String (SKU only - item details fetched from database on scan),
  createdBy: ObjectId (ref: User),
  deletedAt: Date (soft delete timestamp, null if active),
  createdAt: Date,
  updatedAt: Date
}
```

### Settings Collection (Singleton)

```javascript
{
  _id: "global_settings",  // Fixed ID for singleton pattern
  
  // Diamond types with dynamic pricing (v1.5.0 - persisted Map structure)
  // Defaults are auto-merged on first getSettings() call if missing
  diamondPricing: Map {
    "solitaire": { label: "Solitaire", realRate: 100000, cvdRate: 50000, isActive: true },
    "rd": { label: "RD", realRate: 50000, cvdRate: 25000, isActive: true },
    "mq": { label: "MQ", realRate: 45000, cvdRate: 22500, isActive: true },
    "moti": { label: "Moti", realRate: 40000, cvdRate: 20000, isActive: true },
    "pear": { label: "Pear", realRate: 42000, cvdRate: 21000, isActive: true },
    "round": { label: "Round", realRate: 38000, cvdRate: 19000, isActive: true },
    // ... user-added entries persist here
  },
  
  // Type ID aliases for legacy items (e.g., marquise → mq)
  diamondTypeAliases: Map {
    "marquise": "mq",
    "markish": "mq"
  },
  
  // Diamond types array (legacy structure, maintained for backward compatibility)
  diamondTypes: [
    { id: "solitaire", name: "Solitaire", rateMultiplier: 1.0 },
    { id: "rd", name: "RD", rateMultiplier: 1.0 },
    // ...
  ],
  
  // Jewelry categories (v1.5.0 - persisted to MongoDB)
  // Managed via Settings UI - add/delete operations call backend API
  jewelryCategories: [
    { id: "chain", name: "Chain", prefix: "CHN" },
    { id: "bangles", name: "Bangles", prefix: "BNG" },
    { id: "earrings", name: "Earrings", prefix: "EAR" },
    { id: "necklace", name: "Necklace", prefix: "NCK" },
    { id: "pendant_set", name: "Pendant Set", prefix: "PND" },
    { id: "others", name: "Others", prefix: "OTH" },
    // ... user-added categories
  ],
  
  // DEPRECATED: polkiPricing - kept for legacy data compatibility
  polkiPricing: Map { /* preserved for backward compatibility */ },
  
  rates: {
    goldRate: Number,           // Price per gram for gold
    labourRate: Number,         // Labour rate per gram
    taxPercent: Number          // GST percentage
  },
  
  qrSettings: {
    size: Number,
    background: String,
    errorLevel: String
  },
  updatedBy: ObjectId,
  updatedAt: Date
}
```

---

## Frontend Pages

### Page Overview

| Page | Path | Protected | Description |
|------|------|-----------|-------------|
| Home | `/index.html` | No | Landing page with feature overview |
| Login | `/login.html` | No | User authentication |
| Dashboard | `/dashboard.html` | Yes | Overview, stats, item list |
| Create | `/create.html` | Yes | Create new jewelry items |
| Scan | `/scan.html` | No* | Scan QR codes, calculate prices |
| Settings | `/settings.html` | Yes (Admin) | Configure rates, diamond types |

> **\*Scan Page Auth Note:** Scan page is publicly accessible but requires API access for item lookup. The frontend fetches from `/api/items/:sku` which requires auth. In production, implement either: (a) Public scan token flow, (b) Server-side proxy for scan lookup, or (c) Require login for scan. Current dev mode allows authenticated sessions.

### JavaScript Modules

#### api.js - API Service *(v1.5.0)*
```javascript
// Core functions
window.api = {
  getToken(),           // Get stored JWT
  setToken(token),      // Store JWT
  removeToken(),        // Clear JWT
  hasToken(),           // Check if logged in
  
  // Auth
  login(username, password),
  logout(),
  getCurrentUser(),
  
  // Items
  createItem(data),
  getItems(params),
  getItemBySku(sku),
  updateItem(sku, data),
  deleteItem(sku),
  
  // Settings - Diamond Types (v1.5.0)
  getSettings(),
  updateSettings(data),                              // Full settings update
  addDiamondType(id, label, realRate, cvdRate),     // Add new diamond type with pricing
  checkDiamondTypeUsage(typeId),                    // Check if type is used by items
  removeDiamondType(typeId),                        // Remove type (blocked if in use)
  
  // Settings - Jewelry Categories (v1.5.0 - NEW)
  addCategory(name, prefix),                        // Add new jewelry category
  checkCategoryUsage(categoryId),                   // Check if category is used by items
  removeCategory(categoryId),                       // Remove category (blocked if in use)
  
  // Dashboard
  getDashboardStats(),
  getRecentItems(limit),
  
  // Health
  checkHealth()
};
```

**Key Implementation:**
- Auto-detects dev mode (port 8000/8080) to use `http://localhost:3000/api`
- Production mode uses `/api` (same origin)
- Automatically attaches JWT token to all requests
- Redirects to login on 401 Unauthorized

#### auth.js - Authentication
```javascript
window.auth = {
  isAuthenticated(),    // Check login status
  getCurrentUser(),     // Get user from localStorage
  login(username, password),  // Async login
  logout(),             // Clear session, redirect
  protectPage(requireAuth),   // Redirect if not logged in
  getRedirectUrl(),     // Get URL to redirect after login
  updateNavAuth(),      // Update nav UI (Login/Logout button)
  verifyAuth()          // Verify token with API
};
```

---

## Dashboard Features

### View Item Modal (v1.2.0)

The dashboard includes a comprehensive item details modal with live QR code preview.

#### Modal Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Item Details                                         ✕    │
├───────────────────────────────┬────────────────────────────┤
│  [SKU Badge]  📋 Copy         │      ┌────────────────┐    │
│                               │      │                │    │
│  Item Name                    │      │   QR CODE      │    │
│  Bhavya Test                  │      │   (Live Gen)   │    │
│                               │      │                │    │
│  Category: Chain              │      └────────────────┘    │
│  Purity: 22K  Weight: 12.30g  │         CHN-00000L         │
├───────────────────────────────┴────────────────────────────┤
│  Diamonds                                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Pear    CVD (Lab-grown)                    12.00 ct  │  │
│  │ Round   Natural                             5.50 ct  │  │
│  └──────────────────────────────────────────────────────┘  │
│  Created: Dec 26, 2025                                     │
├────────────────────────────────────────────────────────────┤
│              [Close]       [Download QR]                   │
└────────────────────────────────────────────────────────────┘
```

#### Data Flow

```javascript
// viewItem() fetches fresh data from API (same as scan page)
async function viewItem(sku) {
  // 1. Show loading state immediately
  modal.classList.remove('hidden');
  
  // 2. Fetch from API (ensures data consistency)
  const response = await api.getItemBySku(sku);
  
  // 3. Populate modal fields
  document.getElementById('viewItemSku').textContent = item.sku;
  document.getElementById('viewItemName').textContent = item.name;
  // ... other fields
  
  // 4. Generate QR code
  generateModalQrCode(item.sku);
}
```

#### QR Code Generation

```javascript
function generateModalQrCode(sku) {
  QRCode.toCanvas(sku, {
    width: 110,
    margin: 1,
    color: {
      dark: '#1a365d',  // Navy
      light: '#ffffff'
    }
  }, (error, canvas) => {
    container.appendChild(canvas);
  });
}
```

### Diamond Type Indicators

The dashboard table shows diamond type abbreviations for quick scanning:

| Diamond Type | Indicator |
|--------------|-----------|
| Pear | P |
| Round | R |
| Marquise | M |
| Princess | P |
| Oval | O |
| Cushion | C |

**Implementation:**
```javascript
diamondTypes = item.diamonds
  .map(d => {
    const typeName = d.type_name || d.type || d.name || 'Unknown';
    return typeName.charAt(0).toUpperCase();
  })
  .join(', ');
// Result: "P, R, M"
```

### CSS Classes (dashboard.css)

| Class | Purpose |
|-------|---------|
| `.modal-content-grid` | Two-column grid layout |
| `.modal-details-column` | Left column with item details |
| `.modal-qr-column` | Right column with QR preview |
| `.qr-preview-container` | QR code wrapper with styling |
| `.qr-preview-box` | 120x120px QR code container |
| `.diamond-types` | Monospace diamond indicator styling |

---

## Scan Page Features

### SKU-Only QR Architecture (v1.1.0)

QR codes now contain **only the SKU string**, not full item data.

#### Why This Change?

| Old Approach | New Approach |
|--------------|--------------|
| QR contains full JSON data | QR contains SKU only |
| Data can become stale | Always fetches latest |
| Larger QR = harder to scan | Smaller QR = easier to scan |
| Data duplication risk | Single source of truth (DB) |

#### Scan Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   QR Scanner    │────►│   onScanSuccess  │────►│   API Call  │
│   (Html5Qrcode) │     │   Extract SKU    │     │ getItemBySku│
└─────────────────┘     └──────────────────┘     └──────┬──────┘
                                                        │
                                                        ▼
                        ┌──────────────────┐     ┌─────────────┐
                        │  Display Item    │◄────│   MongoDB   │
                        │  Composition     │     │   (Fresh)   │
                        └──────────────────┘     └─────────────┘
```

#### Backward Compatibility

```javascript
function onScanSuccess(decodedText) {
  let sku;
  
  try {
    // Try parsing as JSON (legacy format)
    const data = JSON.parse(decodedText);
    sku = data.sku;
  } catch {
    // Modern format: plain SKU string
    sku = decodedText.trim().toUpperCase();
  }
  
  // Fetch fresh data from API
  fetchAndDisplayItem(sku);
}
```

### Inline SKU Entry (v1.2.0)

Manual SKU entry is now **always visible** below the camera view.

#### Before vs After

| Before (v1.0) | After (v1.2) |
|---------------|--------------|
| SKU entry in popup modal | Inline section always visible |
| Required user to click button | Immediately accessible |
| Hidden when scanning | Visible alongside camera |

#### HTML Structure

```html
<!-- Always visible inline section -->
<div class="sku-entry-section" id="skuEntrySection">
  <div class="sku-entry-header">
    <svg>...</svg>
    Enter SKU Manually
  </div>
  <div class="sku-entry-row">
    <input type="text" id="skuInput" placeholder="e.g., CHN-A1B2C3">
    <button id="searchSkuBtn">Search</button>
  </div>
  <p id="skuSearchError" class="text-error hidden"></p>
</div>
```

### Permission Denied Handling

When camera access is denied, the UI gracefully degrades:

```javascript
function showPermissionDenied() {
  // Hide camera section
  document.getElementById('cameraSection').classList.add('hidden');
  
  // Show permission denied message
  document.getElementById('permissionDenied').classList.remove('hidden');
  
  // SKU entry section remains visible for manual entry
  // (already visible by default)
}
```

### CSS Classes (scan.css)

| Class | Purpose |
|-------|---------|
| `.sku-entry-section` | Container for inline SKU entry |
| `.sku-entry-header` | Icon and label styling |
| `.sku-entry-row` | Input + button flex layout |
| `.permission-denied` | Camera access denied state |
| `.composition-card` | Item details display |

---

## Article Types

> **v1.4.0 Change:** The system is now **diamond-only**. Polki article type UI has been removed. Legacy polki items in the database are still supported with backward compatibility.

### Diamond Articles (Current)

All new items created after v1.4.0 are diamond articles:

| Field | Description |
|-------|-------------|
| `articleType` | Always `"diamond"` |
| `diamonds[]` | Array of diamond entries (type, source, weight) |
| `polkiStones[]` | Always empty `[]` |

**Diamond Entry Schema:**
```javascript
{
  type_id: String,        // e.g., "rd", "mq", "pear", "solitaire"
  type_name: String,      // Display name
  source: "real" | "cvd", // Natural or Lab-grown
  source_name: String,    // e.g., "Real (Natural)", "CVD (Lab-grown)"
  weight_ct: Number       // Weight in carats (0.01 - 100)
}
```

### Legacy Polki Items

Items created before v1.4.0 with `articleType: "polki"` are handled gracefully:

| Scenario | Behavior |
|----------|----------|
| **Scan Page** | Shows "⚠️ Legacy (Polki)" label |
| **Price Calculation** | Still works using stored polki rates |
| **Dashboard** | Displays normally |
| **Create/Edit** | Cannot create new polki items |

**Frontend Display (scan.js):**
```javascript
if (data.articleType === 'polki' && data.polkiStones?.length > 0) {
    // Show Legacy label instead of stone details
    sectionLabel.innerHTML = '⚠️ Legacy (Polki)';
    diamondList.innerHTML = '<li>Polki display disabled. Pricing calculated from stored data.</li>';
}

---

## Price Calculation (NEW in v1.3.0)

### Formula Overview

The price calculation in JewelQR uses the following formula:

```
Total Price = Gold Value + Stone Value + Labour Cost + GST
```

Where:
- **Gold Value** = Gold Weight (g) × Gold Rate (₹/g) × **Purity Factor** *(v1.3.1)*
- **Stone Value** = Sum of (Stone Weight (ct) × Stone Rate (₹/ct)) for each stone
- **Labour Cost** = Gold Weight (g) × Labour Rate (₹/g) *(v1.3.0)*
- **GST** = (Gold Value + Stone Value + Labour Cost) × Tax Percent

### Gold Purity Factors (v1.3.1)

Gold value is automatically adjusted based on purity:

| Purity | Factor | Description |
|--------|--------|-------------|
| 24K | 1.00 | ~99.9% gold (pricing at full rate) |
| 22K | 0.92 | Pricing factor (approx. 91.6% gold content) |
| 18K | 0.76 | Pricing factor (approx. 75% gold content) |
| 14K | 0.60 | Pricing factor (approx. 58.3% gold content) |

> **Note:** These are **pricing factors**, not exact metallurgical percentages. The factors provide simplified pricing adjustments. For example, 22K uses 0.92 for pricing even though actual gold content is 91.6%.

**Formula:**
```
Gold Value = Weight × Rate × Purity Factor
```

**Example (22K gold, 10g at ₹10,000/g):**
```
Gold Value = 10g × ₹10,000 × 0.92 = ₹92,000
```

**UI Display:**
- Shows purity in label: `Gold Value (22K @ 92%)`
- Shows formula: `10g × ₹10,000 × 0.92`

### Labour Cost Calculation (v1.3.0 Change)

**Previous Formula (v1.2):**
```
Total Charges = Making Charges (flat) + Labour Charges (flat)
```

**New Formula (v1.3.0):**
```
Labour Cost = Labour Rate (₹/gram) × Gold Weight (grams)
```

**Example:**
- Gold Weight: 25.5 grams
- Labour Rate: ₹500/gram
- **Labour Cost: 25.5 × 500 = ₹12,750**

### Stone Value Calculation

#### Diamond Type ID Mapping (v1.3.2)

Before calculating rates, diamond type IDs are normalized to handle legacy/variant names:

```javascript
// In calculatePrice() - scan.js
const typeIdMap = {
  'marquise': 'mq',  // Variant spelling → standard ID
  'markish': 'mq'    // Legacy ID → standard ID
};

currentItemData.diamonds.forEach(d => {
  let typeId = (d.type_id || 'round').toLowerCase();
  
  // Normalize type ID
  if (typeIdMap[typeId]) {
    console.log(`Diamond type '${typeId}' mapped to '${typeIdMap[typeId]}'`);
    typeId = typeIdMap[typeId];
  }
  
  // Get per-category pricing
  const categoryPricing = diamondPricing[typeId] || diamondPricing.round;
  const rate = (d.source === 'cvd') ? categoryPricing.cvdRate : categoryPricing.realRate;
  stoneValue += d.weight_ct * rate;
});
```

#### Default Diamond Pricing (config.js)

| Type ID | Display Name | Real Rate | CVD Rate |
|---------|--------------|-----------|----------|
| solitaire | Solitaire | ₹100,000 | ₹50,000 |
| rd | RD | ₹50,000 | ₹25,000 |
| mq | MQ (Marquise) | ₹45,000 | ₹22,500 |
| moti | Moti | ₹40,000 | ₹20,000 |
| pear | Pear | ₹42,000 | ₹21,000 |
| round | Round | ₹38,000 | ₹19,000 |

#### For Polki Articles (DEPRECATED - Legacy Support Only):

> **⚠️ Note:** Polki article creation was removed in v1.4.0. This calculation only applies to legacy items created before that version.

```javascript
polkiStones.forEach(p => {
  const rate = polkiPricing[p.type_id]?.realRate || defaultPolkiRate;
  stoneValue += p.weight_ct * rate;
});
```

### Price Breakdown Display

The scan page shows a detailed breakdown:

| Line Item | Calculation |
|-----------|-------------|
| Gold Value | Weight × Rate × Purity Factor *(v1.3.1)* |
| Diamond Value | Sum of (carat × rate per carat) |
| Labour Cost | Weight × Labour Rate per gram |
| Subtotal | Gold + Stone + Labour |
| GST (X%) | Subtotal × Tax% |
| **Total** | Subtotal + GST |

### Configuration (Settings)

```javascript
// Default rates (config.js)
DEFAULT_RATES: {
  goldRate: 7500,        // ₹/gram
  diamondRate: 50000,    // ₹/carat (real)
  cvdDiamondRate: 25000, // ₹/carat (lab-grown)
  labourRate: 500,       // ₹/gram (NEW)
  taxPercent: 3          // GST %
}
```

### Implementation (scan.js)

```javascript
function calculatePrice() {
  const goldRate = parseFloat(document.getElementById('goldRate').value);
  const labourRate = parseFloat(document.getElementById('labourRate').value) || 0;
  const taxPercent = parseFloat(document.getElementById('taxPercent').value) || 0;
  
  const goldWeight = currentItemData.gold_weight_g;
  const goldPurity = currentItemData.purity || '22K';
  
  // Get purity factor (24K=1.0, 22K=0.92, 18K=0.76, 14K=0.60)
  const purityFactor = config.getPurityFactor(goldPurity);
  
  // Gold Value = Weight × Rate × Purity Factor (v1.3.1)
  const goldValue = goldWeight * goldRate * purityFactor;
  
  // Labour Cost = Rate × Weight (v1.3.0)
  const labourCost = labourRate * goldWeight;
  
  // Calculate stone value based on article type
  const articleType = currentItemData.articleType || 'diamond';
  let stoneValue = 0;
  
  if (articleType === 'polki') {
    // Calculate polki/stone values
    currentItemData.polkiStones.forEach(p => {
      stoneValue += p.weight_ct * polkiRate;
    });
  } else {
    // Calculate diamond values
    currentItemData.diamonds.forEach(d => {
      const rate = (d.source === 'cvd') ? cvdRate : realRate;
      stoneValue += d.weight_ct * rate;
    });
  }
  
  const subtotal = goldValue + stoneValue + labourCost;
  const taxAmount = subtotal * (taxPercent / 100);
  const total = subtotal + taxAmount;
  
  displayBreakdown({ goldValue, stoneValue, labourCost, subtotal, taxAmount, total });
}
```

---

## Configuration Cache (v1.5.0)

The frontend uses localStorage caching to reduce API calls and improve performance.

### Cache Settings

| Setting | Value |
|---------|-------|
| **Cache Key** | `jewelqr_config` |
| **Cache Time Key** | `jewelqr_config_cache_time` |
| **Cache Duration** | 5 minutes (300,000 ms) |

### Refresh Triggers

| Trigger | Behavior |
|---------|----------|
| **Page Load** | If cache expired → fetch from API |
| **Settings Save** | Immediate cache update |
| **Add Diamond Type** | Calls `refreshConfig()` after API success *(v1.5.0)* |
| **Add Category** | Calls `refreshConfig()` after API success *(v1.5.0)* |
| **Manual Clear** | `localStorage.clear()` |
| **API Error** | Fall back to cached/default values |

### Implementation (config.js)

```javascript
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function isCacheValid() {
  const cacheTime = localStorage.getItem(CONFIG_CACHE_KEY);
  if (!cacheTime) return false;
  return (Date.now() - parseInt(cacheTime)) < CACHE_DURATION;
}

async function initConfig() {
  if (isCacheValid()) {
    configCache = getLocalConfig();
    return configCache;
  }
  return await fetchConfig();  // Fetch from API
}

// NEW in v1.5.0 - Force refresh from API (bypasses cache)
async function refreshConfig() {
  configCache = await fetchConfig();  // Always fetches fresh from backend
  return configCache;
}
```

### Scan Page Initialization (v1.3.2 Fix)

The scan page now explicitly calls `initConfig()` to ensure fresh rates:

```javascript
async function initializeScan() {
  if (typeof config !== 'undefined') {
    try {
      await config.initConfig();  // Fetch fresh rates if cache expired
    } catch (e) {
      console.warn('Failed to fetch config, using cached:', e.message);
    }
    const rates = config.getDefaultRates();
    // Pre-fill rate inputs...
  }
}
```

---

## Authentication Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  login.html  │     │   Backend    │     │   MongoDB    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                     │                     │
       │ POST /auth/login    │                     │
       │ {username,password} │                     │
       │────────────────────>│                     │
       │                     │  Find user by       │
       │                     │  username           │
       │                     │────────────────────>│
       │                     │<────────────────────│
       │                     │  User document      │
       │                     │                     │
       │                     │  Compare password   │
       │                     │  with bcrypt        │
       │                     │                     │
       │ {token, user}       │                     │
       │<────────────────────│                     │
       │                     │                     │
       │ Store token in      │                     │
       │ localStorage        │                     │
       │ (jewelqr_jwt)       │                     │
       │                     │                     │
       │ Redirect to         │                     │
       │ dashboard.html      │                     │
       │                     │                     │
```

---

## Key Implementation Details

### Script Loading Order

**CRITICAL:** `api.js` MUST load before `auth.js` in all HTML files because `auth.js` depends on `api.hasToken()`.

```html
<script src="js/api.js"></script>    <!-- First -->
<script src="js/auth.js"></script>   <!-- Second -->
<script src="js/config.js"></script>
<script src="js/utils.js"></script>
<script src="js/components.js"></script>
```

### API Base URL Detection

```javascript
// In api.js
const isDev = window.location.port === '8000' || window.location.port === '8080';
const API_BASE = isDev ? 'http://localhost:3000/api' : '/api';
```

### CORS Configuration

```javascript
// In backend src/app.js
const allowedOrigins = [
  'http://localhost:8000',
  'http://localhost:8080',
  'http://127.0.0.1:8000'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all in dev
    }
  },
  credentials: true
}));
```

### Item Data Structure

When creating items, the frontend MUST send data matching the backend schema:

```javascript
{
  sku: "CHN-A1B2C3",          // Required, uppercase
  name: "Item Name",          // Optional
  category: {                 // Required object
    id: "chain",
    name: "Chain",
    prefix: "CHN"
  },
  gold: {                     // Required object
    purity: "18K",
    weight_g: 15.5
  },
  diamonds: [{                // Array of diamonds
    type_id: "round",
    type_name: "Round",       // NOT "type"
    source: "real",
    source_name: "Real Diamond",
    weight_ct: 0.25
  }],
  qrData: "CHN-A1B2C3"         // Auto-generated - SKU only (item details fetched from DB)
}
```

---

## Troubleshooting

### Common Issues

#### 1. Port Already in Use (EADDRINUSE)

```powershell
# Find and kill process on port 3000
Get-NetTCPConnection -LocalPort 3000 | ForEach-Object { 
  Stop-Process -Id $_.OwningProcess -Force 
}
```

#### 2. MongoDB Connection Failed

```powershell
# Check if MongoDB is running
Get-Service | Where-Object {$_.Name -like "*mongo*"}

# Start MongoDB service
net start MongoDB
```

#### 3. API Returning 401 Unauthorized

- Check if JWT token is stored: `localStorage.getItem('jewelqr_jwt')`
- Token may be expired - re-login
- Ensure `api.js` loads before `auth.js`

#### 4. Dashboard Shows "Loading..."

- Check browser console for errors
- Verify backend is running: `http://localhost:3000/api/health`
- Check CORS errors in console

#### 5. Items Created Locally Not in Database

- Check for "Item saved to database!" toast vs "Offline mode" warning
- Verify backend connection
- Check browser console for API errors

### Verifying Services

```powershell
# Test Backend Health
(Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing).Content

# Test Frontend
(Invoke-WebRequest -Uri "http://localhost:8000/jewelry-qr-frontend/index.html" -UseBasicParsing).StatusCode

# Test Login
$body = '{"username":"admin","password":"admin123"}'
(Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing).Content
```

---

## Future Enhancements

### Planned Features

- [ ] PDF export for price quotes
- [ ] Barcode support (in addition to QR)
- [ ] Multi-store support
- [ ] Inventory alerts (low stock)
- [ ] Customer management
- [ ] Sales tracking
- [ ] Report generation

### Production Deployment

For production deployment:

1. Use Docker Compose (`docker-compose.yml` provided)
2. Configure Nginx as reverse proxy (`nginx.conf` provided)
3. Set proper environment variables
4. Enable HTTPS
5. Set `NODE_ENV=production`

---

## Summary

This JewelQR system provides a complete solution for jewelry inventory management with:

- **Backend:** Node.js + Express + MongoDB
- **Frontend:** Vanilla HTML/CSS/JS
- **Auth:** JWT-based with role support
- **Storage:** MongoDB with Mongoose ODM
- **Pricing:** Dynamic calculation with per-category diamond rates and Labour Rate × Weight formula
- **Category Management:** Jewelry categories persist to MongoDB *(v1.5.0)*
- **Diamond Type Management:** Diamond types with pricing persist to MongoDB *(v1.5.0)*
- **Soft Delete:** Items and categories with restore capability *(v1.6.1)*
- **Security Hardening:** HTTPS, Helmet, rate limiting, sanitization *(v1.7.0)*
- **Production Ready:** Docker, Nginx, backup automation *(v1.7.0)*

### Authorization Model (v1.5.0)

| Role | Create Items | Edit Items | Delete Items | Restore Items | Settings | Manage Categories | View/Scan |
|------|--------------|------------|--------------|---------------|----------|-------------------|-----------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Staff | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Public | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅* |

> \*Scan requires authenticated session in current implementation

### Security Architecture (v1.7.0)

| Layer | Protection |
|-------|------------|
| **Network** | HTTPS only, TLS 1.2/1.3, Nginx reverse proxy |
| **Headers** | Helmet (CSP, HSTS, X-Frame-Options, X-XSS) |
| **Rate Limiting** | Login: 5/15min, API: 100/min |
| **Input** | MongoDB sanitization, HPP, body limits |
| **Auth** | JWT 256-bit secret, httpOnly cookies |
| **Database** | MongoDB authentication, internal only |

### Production Deployment

```bash
# Quick Deploy
cp .env.production.example .env
nano .env  # Configure secrets
docker-compose -f docker-compose.prod.yml up -d

# Verify
curl -k https://localhost/api/health
```

### Backup & Recovery

| Feature | Implementation |
|---------|----------------|
| Schedule | Daily at 2:00 AM |
| Location | `/backups/jewelqr_backup_*.tar.gz` |
| Retention | 30 days |
| Restore | `docker exec jewelqr-backup /restore.sh <backup_file>` |

### Offline Mode Limitations

> **⚠️ Important:** Offline fallback is **read-only** for data integrity.

| Capability | Offline | Online |
|------------|---------|--------|
| View cached settings/rates | ✅ | ✅ |
| View last scanned item | ✅ | ✅ |
| Create new items | ❌ | ✅ |
| Generate SKUs | ❌ | ✅ (atomic counter) |
| Update items | ❌ | ✅ |

**Rationale:** SKU generation requires server-side atomic counter. Offline creation would cause ID conflicts.

### Settings Singleton Guarantee

Settings uses a fixed `_id: 'global_settings'` document:
- Created by `seed.js` on first run
- `getSettings()` auto-merges missing default diamond types *(v1.5.0)*
- Missing settings returns sensible defaults
- Diamond types and categories persist to MongoDB via dedicated API endpoints

### Development Quick Start

```bash
# 1. Start MongoDB
mongod

# 2. Backend
cd jewelry-qr-backend
npm run dev

# 3. Frontend
cd ..
python -m http.server 8000

# 4. Access
open http://localhost:8000/jewelry-qr-frontend/
```

---

*Document updated for JewelQR System v1.7.0 - February 1, 2026*
*Security Hardening Release - Production Ready*

