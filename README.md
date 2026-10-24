# Esme Crystal IMS

Inventory management for [Esme Crystal](https://www.esmecrystal.com) (Austrian-crystal fashion jewellery, sold at a fixed MRP in the studio, at exhibitions and on Shopify), built on **ERPNext** with a fast, friendly web app on top.

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
| Catalogue | One SKU per design and finish (auto `EAR-00012` from the category prefix, or your own). Esme's categories, its 15 collections, finish (gold, rose gold, silver plated, gunmetal, two-tone), crystal colour, photo, description, reorder level. "New variant" copies a design into another finish or colour in one click |
| Pricing | MRP (inclusive of taxes) and unit cost, with live margin. Cost is ERPNext's moving average. Filter by Esme's price bands: under ₹5k, ₹5k to ₹10k, above ₹10k |
| Stock | Receive, sell, move between locations, write off (damaged, lost, sample, return to supplier). Every movement is a submitted ERPNext Stock Entry with reason, reference and party. Mistakes are reversed by cancelling |
| Locations | Stores, Online Store (Shopify), Studio, Exhibition, Damaged, plus any you add |
| Stock counts | Count a location by scanning or typing; only the differences are posted (ERPNext Stock Reconciliation) |
| Labels | QR label per piece (50 x 25 mm thermal or PNG). Scanning opens the piece: staff see stock, customers see a product page with the MRP |
| Scan | Phone camera scanner: price, stock by location, one-tap sell or move |
| Dashboard | Stock and retail value, pieces on hand, sales, items needing attention, stock flow, value by category, pieces by location, best sellers, recent activity |
| Shopify | Import the catalogue (variants without a SKU get one from their category; the Color option becomes the finish or crystal colour; tags give the collection), record Shopify orders as online sales, push IMS changes to Shopify, drift report and one-click fix |
| Export | CSV of the filtered inventory |

## Quick start (local development)

Needs Docker Desktop and Node 22.

```bash
# 1. ERPNext (first start takes a few minutes while the site is created)
docker compose -f erpnext/docker-compose.yml -p esme-erp up -d

# 2. Company, categories, locations, custom fields, service user (+ sample data and demo users)
node erpnext/provision.js --demo [--demo-images <folder of SKU.jpg photos>]
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

## Earlier system

The JewelQR v1 code (Express + MongoDB, gold and diamond pricing) is kept at the git tag `legacy-jewelqr-v1.7.1`. Its gold-rate pricing and migration script were removed because Esme Crystal sells fixed-MRP pieces.

## Checks

```bash
npm --prefix ims-gateway test          # SKU numbering, Shopify catalogue mapping
npm --prefix ims-gateway run smoke     # end to end against a running gateway + ERPNext (dev data)
npm --prefix ims-web run build         # typecheck + production build
```

## A note on the jewellery add-ons

The brief suggested ERPNext plus Loupe 24K and evaluating CaratFlow. [Loupe 24K](https://github.com/fafadiatech/loupe24k) is an ERPNext app for gold manufacturers (fine-gold ledger, karigar job work, hallmarking). Esme Crystal's plated crystal pieces need none of that, so this build uses stock ERPNext with a small set of custom fields and DocTypes (`erpnext/provision.js`). CaratFlow could not be found as a public project.

## Repository

```
erpnext/            ERPNext docker compose + provision.js (custom fields, DocTypes, masters)
ims-gateway/        Express API over ERPNext + Shopify sync
ims-web/            React + shadcn/ui + bklit web app
scripts/            backup, restore
docker-compose.prod.yml, Caddyfile
```

Private. All rights reserved.
