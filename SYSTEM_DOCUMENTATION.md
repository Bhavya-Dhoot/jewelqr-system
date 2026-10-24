# Esme Crystal IMS - System Documentation

Version 2.0 (October 2026). Replaces JewelQR v1.7.1 (Express + MongoDB + vanilla JS), which is preserved at git tag `legacy-jewelqr-v1.7.1`.

## 1. Architecture

| Component | Path | Role |
|---|---|---|
| ERPNext v16 | `erpnext/docker-compose.yml` | System of record. MariaDB, Redis, workers, scheduler, nginx. |
| Provisioning | `erpnext/provision.js` | Idempotent setup over REST: setup wizard, custom fields, custom DocTypes, categories, locations, rates, service user, demo data (`--demo`). |
| IMS gateway | `ims-gateway/` | Express 5. Session auth, inventory read models, stock movements, pricing, public scan API, file proxy, Shopify sync. Serves the built web app in production. |
| IMS web | `ims-web/` | React 19 + Vite + Tailwind v4 + shadcn/ui (radix-nova) + bklit charts + TanStack Query. |
| Edge | `Caddyfile`, `docker-compose.prod.yml` | Automatic HTTPS for the app and the ERPNext desk. |

Request flow: browser -> `/api/*` on the gateway -> ERPNext REST with the user's own `sid` (signed, httpOnly cookie `esme_sid`). ERPNext enforces role permissions and stamps `owner` / `modified_by`. The service API key is used only by the public item endpoint and scheduled Shopify sync.

## 2. Data model (ERPNext)

| IMS concept | ERPNext | Notes |
|---|---|---|
| Piece / SKU | `Item` (`item_code`) | Stock UOM Nos, valuation method Moving Average per item. Barcode row = SKU. Archived = `disabled`. |
| Category | `Item Group` under "Jewellery" | Custom `esme_sku_prefix` drives auto SKUs `<PREFIX>-00001`. |
| Collection | `Esme Collection` (custom) | Link `Item.esme_collection`. |
| Finish, crystal colour | `Item.esme_finish`, `Item.esme_crystal_colour` | |
| Pricing mode | `Item.esme_pricing_mode` | `Fixed MRP` or `Metal Rate`. |
| MRP | `Item Price` on price list "Standard Selling" | |
| Unit cost | Moving-average valuation from the stock ledger; `Item.valuation_rate` as the default for receipts | |
| Gold / stones | `Item.esme_metal_purity`, `esme_metal_weight_g`, child table `esme_stones` (`Esme Stone Line`: stone type, Natural / Lab-grown, ct) | |
| Stone rates | `Esme Stone Type` (natural and lab-grown rate per ct) | |
| Gold rate history | `Esme Gold Rate` (date, 24K rate per g) | Latest row is "today's rate". |
| Making charge, tax, low-stock default, default and Shopify locations, Shopify cursor | `Esme Settings` (single) | |
| Location | `Warehouse` | Stores, Online Store, Studio, Exhibition, Damaged. |
| Receive / sell / move / write off | `Stock Entry` (Material Receipt / Issue / Transfer), submitted | Custom `esme_reason`, `esme_reference`, `esme_party`, `esme_sale_value`. |
| Stock count | `Stock Reconciliation`, submitted | Only lines that differ are posted. |
| Stock on hand | `Bin` | Per item and warehouse. |
| History | `Stock Ledger Entry` | |
| Shopify link | `Item.esme_shopify_variant_id`, `esme_shopify_inventory_item_id` | |

Negative stock is blocked (Stock Settings). Reversals are cancellations, which ERPNext records as reversing ledger entries.

## 3. Pricing

`ims-gateway/src/pricing.js` (tested in `pricing.test.js`).

- Fixed MRP: price = MRP (tax inclusive).
- Metal Rate: gold = weight x 24K rate x purity factor (24K 0.999, 22K 0.9167, 18K 0.75, 14K 0.583); each stone = ct x natural or lab-grown rate; making = weight x making charge per g; tax = subtotal x tax %; each line rounded to the rupee. Identical to JewelQR v1.

## 4. API (gateway)

All JSON. Errors: `{ "error": "message" }` with HTTP status (401 sign in, 403 not permitted, 404, 409 duplicate, 422 validation, 502/503 upstream).

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` against ERPNext; sets session cookie. Rate limited 10 / 15 min. |
| POST | `/api/auth/logout` | Ends the ERPNext session. |
| GET | `/api/auth/me` | Current user, roles, `isManager`. |
| GET | `/api/meta` | Categories, collections, locations, stone types, finishes, settings, Shopify flag. |
| GET | `/api/items` | Filter `q, category, collection, finish, location, stock (in/low/out), status, sort, page, pageSize`. |
| GET | `/api/items/next-sku?category=` | Preview the next auto SKU. |
| GET | `/api/items/:sku` | Detail, stock by location, price breakdown, QR URL, last 50 ledger moves. |
| POST | `/api/items` | Create (optional `sku`, optional `opening: { warehouse, qty }`). |
| PUT | `/api/items/:sku` | Update. |
| DELETE | `/api/items/:sku` | Archive (disable). |
| POST | `/api/items/:sku/image` | Multipart `image`, resized to WebP, attached in ERPNext. |
| GET | `/api/stock/reasons` | Allowed reasons per movement type. |
| GET / POST | `/api/stock/movements` | List (filters) / post a movement `{ type, reason, from, to, lines: [{ sku, qty, rate }], reference, party, sale_value, notes, posting_date }`. |
| POST | `/api/stock/movements/:name/cancel` | Cancel (reverse). |
| GET / POST | `/api/stock/counts` | Recent counts / post a count `{ warehouse, lines: [{ sku, counted }] }`. |
| GET | `/api/dashboard?days=7/30/90/365` | KPIs and chart series. |
| GET / POST | `/api/locations` | Summaries / add a location. |
| POST, PUT | `/api/categories`, `/api/collections`, `/api/stone-types` | Masters. |
| PUT | `/api/rates` | Gold rate (appends history), making charge, tax, low-stock default, default and online warehouse. |
| GET | `/api/rates/history` | Gold rate history. |
| GET | `/api/public/items/:sku` | Public label view: name, photo, attributes, price, availability. No cost or stock counts. Rate limited. |
| GET | `/api/shopify/status` and (managers) `/locations`, `PUT /settings`, `POST /import`, `POST /sync`, `GET /drift`, `POST /push` | Shopify integration. |
| GET | `/files/<name>` | Proxied ERPNext public files (item photos). |
| GET | `/api/health` | Gateway and ERPNext reachability. |

## 5. Shopify sync

See the header of `ims-gateway/src/shopify.js`. Admin GraphQL `2026-10`; inventory mutations carry `@idempotent` keys derived from the IMS voucher. Orders: `created_at >= cursor` (5 min overlap), skipped when `shopify:<order>` already exists; the cursor stops at the earliest failed order so it retries. Cancelled orders become "Customer Return" receipts. Lines are matched by linked inventory item id, then by SKU.

## 6. Security

- Sessions: ERPNext `sid` in a signed httpOnly `SameSite=Lax` cookie (`Secure` in production). No passwords stored by the gateway.
- Authorisation: ERPNext role permissions on every call; manager-only gateway actions (Shopify) check roles first.
- Input validation with Joi at the gateway boundary; ERPNext validates again.
- Helmet CSP (self, images from self and Shopify CDN), rate limits on login and the public API, file proxy restricted to flat public file names.
- Secrets only in `.env` files (git-ignored). Change `ERP_ADMIN_PASSWORD` and `ERP_DB_ROOT_PASSWORD` before the first production start.

## 7. Operations

- Start, stop: `docker compose -f docker-compose.prod.yml up -d` / `down`.
- Logs: `docker compose -f docker-compose.prod.yml logs -f gateway backend`.
- Backup and restore: `scripts/backup.sh`, `scripts/restore.sh` (section in README).
- Rotate the service key: `node erpnext/provision.js --rotate-keys`, update `ims-gateway/.env`, restart the gateway.
- First boot of a fresh ERPNext: workers wait for site creation so they load the site encryption key.
- Health: `GET /api/health`.

## 8. Known limits

- Catalogue views load the whole catalogue per request and filter in memory; fine to roughly 10k SKUs. Beyond that, move filtering into an ERPNext Query Report.
- Shopify: one Shopify location maps to one ERPNext warehouse. Refunds without cancellation are not restocked automatically; record them as a Customer Return.
- Legacy JewelQR items migrate with zero cost; set unit costs after migration.
