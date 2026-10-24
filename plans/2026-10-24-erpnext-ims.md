# Esme Crystal IMS on ERPNext — plan (2026-10-24)

Decisions (founder, 2026-10-24): ERPNext is the system of record; pricing supports
both Fixed MRP and Metal Rate (gold/diamond calculator); stock syncs with Shopify;
push straight to `main`.

"Loupe 24K" and "CaratFlow" could not be found publicly; the ERPNext jewellery apps
that exist are paid gold-purity add-ons. We use stock ERPNext v16 + custom fields /
custom DocTypes provisioned over REST (no custom Frappe app image to build).

## Architecture

```
ims-web (React + Vite + shadcn/ui + bklit charts)
   │  /api/*  (cookie session)
   ▼
jewelry-qr-backend → "ims-gateway" (Express)
   │  user calls: forwards the user's ERPNext sid  → ERPNext permissions + audit
   │  public scan + Shopify jobs: service API key
   ▼
ERPNext v16 (Docker, MariaDB, Redis)        Shopify Admin GraphQL API
```

MongoDB is retired. `scripts/migrate-mongo-to-erpnext.js` moves old items.

## ERPNext model
- Item = SKU (item_code). Item Group = category (custom `esme_sku_prefix`).
- Custom on Item: collection (Link Esme Collection), finish, crystal colour,
  pricing mode (Fixed MRP | Metal Rate), metal purity, metal weight, stones
  (child table Esme Stone Line), Shopify variant / inventory item ids.
- MRP = Item Price on "Standard Selling". Cost = valuation (moving average).
- Stock moves = Stock Entry (Material Receipt / Issue / Transfer) with custom
  reason, reference, sale value. Counts = Stock Reconciliation.
- Rates: Esme Gold Rate (history), Esme Stone Type (natural / lab rate),
  Esme Settings (single: labour/g, tax %, warehouses, Shopify cursor).

## Shopify sync (no oversell)
- Shopify → IMS: paid orders become Material Issue (reason "Sale - Online") from
  the Online warehouse, idempotent on reference `shopify:<order>`.
- IMS → Shopify: movements touching the Online warehouse push deltas
  (inventoryAdjustQuantities). Deltas commute, so no lost updates.
- Drift report + "set Shopify = IMS" using compareQuantity.

## Verify
- Provision script idempotent (run twice, no errors).
- Gateway self-check script against live ERPNext: create item, receive, issue,
  transfer, count; Bin quantities match.
- Browser: login, dashboard, create item, move stock, scan page (mobile width).
- `tsc --noEmit` + `vite build` clean.

Failure modes: ERPNext down → gateway returns 503, UI shows banner; Shopify token
missing → integration page shows "not connected", nothing else breaks.

## Page fan-out (web app)
Constraint: wall-clock + orchestrator context; 9 independent pages on a shared, finished foundation.
Failure modes: agent edits shared files (brief forbids; checked via git diff of foundation files);
plausible-but-wrong API use (caught by tsc against src/lib/types.ts + browser walk-through);
timeout/error (page stays a stub, I write it myself).
Ledger: foundation, shell, dashboard, inventory, movement dialog - me (sets the pattern);
item detail+form, movements+count+scan+public, locations+settings+shopify - 3 Sonnet agents (bounded, typed contract);
integration, review, browser verification - me.
