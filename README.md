# Esme Crystal IMS

Inventory management for Esme Crystal, built on **ERPNext** with a fast, friendly web app on top.

- **ERPNext v16** is the system of record: stock ledger, moving-average valuation, negative-stock guard, users, roles, audit trail, backups.
- **IMS gateway** (Node, `ims-gateway/`) is a thin API over ERPNext: sign-in, catalogue and stock views, pricing, QR labels, public scan page, Shopify sync.
- **IMS web** (React + shadcn/ui + bklit charts, `ims-web/`) is what the team uses day to day, on a laptop or a phone at the counter.

```
ims-web (browser) ──/api──▶ ims-gateway ──REST──▶ ERPNext (MariaDB, Redis)
                                   │
                                   └──GraphQL──▶ Shopify Admin API
```

User actions run under the person's own ERPNext session, so ERPNext permissions apply and every stock entry records who made it. Only the public scan page and scheduled Shopify jobs use the gateway's service account.

## What it does

| Area | Details |
|---|---|
| Catalogue | SKU per piece (auto `EAR-00012` from the category prefix, or your own), category, collection, finish, crystal colour, photo, description, reorder level |
| Pricing | **Fixed MRP** (MRP + unit cost, live margin) or **Metal Rate** (gold purity and weight + up to 6 stones, priced from today's gold, stone, making-charge and tax rates; same formula as JewelQR v1) |
| Stock | Receive, sell, move between locations, write off (damaged, lost, sample, return to supplier). Every movement is a submitted ERPNext Stock Entry with reason, reference and party. Mistakes are reversed by cancelling |
| Locations | Stores, Online Store (Shopify), Studio, Exhibition, Damaged, plus any you add |
| Stock counts | Count a location by scanning or typing; only the differences are posted (ERPNext Stock Reconciliation) |
| Labels | QR label per piece (50 x 25 mm thermal or PNG). Scanning opens the piece. Old JewelQR labels still scan |
| Scan | Phone camera scanner: price, stock by location, one-tap sell or move |
| Dashboard | Stock and retail value, pieces on hand, sales, items needing attention, stock flow, value by category, pieces by location, best sellers, recent activity |
| Shopify | Import the catalogue, record Shopify orders as online sales, push IMS changes to Shopify, drift report and one-click fix |
| Export | CSV of the filtered inventory |

## Quick start (local development)

Needs Docker Desktop and Node 22.

```bash
# 1. ERPNext (first start takes a few minutes while the site is created)
docker compose -f erpnext/docker-compose.yml -p esme-erp up -d

# 2. Company, categories, locations, custom fields, service user (+ sample data and demo users)
node erpnext/provision.js --demo
#    copy the printed ERP_API_KEY / ERP_API_SECRET into ims-gateway/.env (see ims-gateway/.env.example)

# 3. Gateway and web app (two terminals)
npm --prefix ims-gateway install && npm --prefix ims-gateway run dev
npm --prefix ims-web install && npm --prefix ims-web run dev
```

Open http://localhost:5173. Demo users created by `--demo`:

| User | Password | Role |
|---|---|---|
| `manager@esmecrystal.local` | `Manager@Demo2026` | Stock manager |
| `staff@esmecrystal.local` | `Staff@Demo2026` | Staff |

ERPNext desk: http://localhost:8085 (`Administrator` / `admin` in development).

## Production

```bash
cp .env.example .env                              # domains, ERPNext passwords
cp ims-gateway/.env.example ims-gateway/.env      # COOKIE_SECRET, PUBLIC_URL, Shopify
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm provision   # prints the service API keys
# put the keys in ims-gateway/.env, then:
docker compose -f docker-compose.prod.yml up -d gateway
```

Caddy issues HTTPS certificates for `IMS_DOMAIN` (the app) and `ERP_DOMAIN` (ERPNext desk) automatically; point both DNS records at the server first. The camera scanner needs HTTPS.

Create real users in ERPNext (desk, User list) and give them:

| IMS role | ERPNext roles |
|---|---|
| Staff | Stock User, Item Manager, Sales Master Manager |
| Stock manager | the above + Stock Manager (counts, rates, settings, Shopify) |

Backups: `scripts/backup.sh` (database + files, keeps 30 days) and `scripts/restore.sh <folder>`.

## Shopify

1. In the Shopify Dev Dashboard (same organisation as the store) create an app with scopes `read_products, read_inventory, write_inventory, read_orders, read_locations` and install it on the store.
2. Set `SHOPIFY_SHOP`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` (or a static `SHOPIFY_ACCESS_TOKEN`) and optionally `SHOPIFY_SYNC_MINUTES` in `ims-gateway/.env`, restart the gateway.
3. In the IMS, open **Shopify**: map the Shopify location to the Online Store warehouse, import the catalogue, then sync orders.

How it stays correct:

- Each Shopify order becomes a "Sale - Online" issue from the Online Store warehouse (idempotent on `shopify:<order>`); a cancelled order becomes a return.
- Any IMS movement that changes the Online Store warehouse is pushed to Shopify as a delta with an idempotency key. Deltas commute, so a Shopify sale and an IMS receipt at the same moment cannot overwrite each other.
- The drift report compares both sides; "Make Shopify match IMS" uses compare-and-swap so it never clobbers a sale that happened in between.

## Moving from JewelQR v1 (MongoDB)

```bash
git archive legacy-jewelqr-v1.7.1 jewelry-qr-backend/uploads | tar -x -C /tmp/legacy   # old photos
cd scripts/migrate-legacy && npm install
MONGO_URI=mongodb://... ERP_URL=http://localhost:8085 ERP_ADMIN_PASSWORD=... \
  node migrate.js --uploads /tmp/legacy/jewelry-qr-backend/uploads --dry-run
```

Drop `--dry-run` to apply. Items arrive as "Metal Rate" pieces with their gold and diamonds, photos attached, and 1 unit of opening stock each (change with `--opening-qty`, `--warehouse`). Safe to re-run. The full v1 code is kept at the git tag `legacy-jewelqr-v1.7.1`.

## Checks

```bash
npm --prefix ims-gateway test          # pricing formula
npm --prefix ims-gateway run smoke     # end to end against a running gateway + ERPNext (dev data)
npm --prefix ims-web run build         # typecheck + production build
```

## A note on the jewellery add-ons

The brief suggested ERPNext plus "Loupe 24K" and evaluating "CaratFlow". Neither could be found as a public project. The ERPNext jewellery apps that do exist are paid, gold-purity-centric add-ons. Esme Crystal sells fixed-MRP crystal jewellery, so this build uses stock ERPNext with a small set of custom fields and DocTypes (`erpnext/provision.js`) instead; the Metal Rate mode covers gold and diamond pieces.

## Repository

```
erpnext/            ERPNext docker compose + provision.js (custom fields, DocTypes, masters)
ims-gateway/        Express API over ERPNext + Shopify sync
ims-web/            React + shadcn/ui + bklit web app
scripts/            backup, restore, legacy migration
docker-compose.prod.yml, Caddyfile
```

Private. All rights reserved.
