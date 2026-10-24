'use strict';
// Shopify <-> IMS stock sync for one Shopify location mapped to one ERPNext warehouse ("Online Store").
//
// Shopify -> IMS: every Shopify order becomes a "Sale - Online" issue from the online warehouse
//                 (idempotent on reference shopify:<order>); a cancelled order becomes a return.
// IMS -> Shopify: any IMS movement that changes the online warehouse is pushed as a delta.
//                 Deltas commute, so a Shopify sale and an IMS receipt landing at the same time
//                 cannot overwrite each other. Each push carries an idempotency key derived from
//                 the IMS voucher, so a retried push is applied once.
// Drift report + "make Shopify match IMS" (compare-and-swap set) repair anything that slipped.

const crypto = require('node:crypto');
const config = require('./config');
const { client } = require('./erp');
const { HttpError } = require('./http');
const log = require('./log');

const cfg = config.shopify;
const gid = (type, id) => (String(id).startsWith('gid://') ? String(id) : `gid://shopify/${type}/${id}`);
const idemKey = seed => { const h = crypto.createHash('sha256').update(seed).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

let token = { value: cfg.accessToken, expiresAt: cfg.accessToken ? Infinity : 0 };

async function accessToken() {
    if (token.value && Date.now() < token.expiresAt - 60_000) return token.value;
    // Dev Dashboard apps in the same Shopify organisation: client credentials grant, 24 h tokens.
    const res = await fetch(`https://${cfg.shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.clientId, client_secret: cfg.clientSecret }),
        signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new HttpError(502, `Shopify token request failed (${res.status}). Check SHOPIFY_CLIENT_ID / SECRET and that the app is installed on ${cfg.shop}.`);
    const body = await res.json();
    token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return token.value;
}

async function gql(query, variables = {}, attempt = 0) {
    if (!cfg.enabled) throw new HttpError(503, 'Shopify is not connected. Set SHOPIFY_SHOP and credentials in the gateway environment.');
    const res = await fetch(`https://${cfg.shop}/admin/api/${cfg.apiVersion}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await accessToken() },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 && !cfg.accessToken && attempt === 0) { token.expiresAt = 0; return gql(query, variables, 1); }
    const body = await res.json().catch(() => ({}));
    const throttled = body.errors?.some(e => e.extensions?.code === 'THROTTLED');
    if ((throttled || res.status === 429) && attempt < 4) {
        await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
        return gql(query, variables, attempt + 1);
    }
    if (!res.ok || body.errors?.length) throw new HttpError(502, `Shopify: ${body.errors?.map(e => e.message).join('; ') || res.statusText}`);
    return body.data;
}

function assertNoUserErrors(result, what) {
    const errs = result?.userErrors || [];
    if (errs.length) throw new HttpError(502, `Shopify ${what}: ${errs.map(e => e.message).join('; ')}`);
}

// ---------- settings ----------

async function syncSettings(erp) {
    const s = await erp.getSingle('Esme Settings');
    return { erp, locationId: s.shopify_location_id || '', warehouse: s.online_warehouse || '', syncedUntil: s.shopify_orders_synced_until || null };
}

async function listLocations() {
    const data = await gql('{ locations(first: 50) { nodes { id name isActive fulfillsOnlineOrders } } }');
    return data.locations.nodes.filter(l => l.isActive);
}

// ---------- IMS -> Shopify ----------

async function linkedItems(erp, skus) {
    if (!skus.length) return new Map();
    const rows = await erp.list('Item', { fields: ['name', 'esme_shopify_inventory_item_id'], filters: [['name', 'in', skus], ['esme_shopify_inventory_item_id', 'is', 'set']], limit: 0 });
    return new Map(rows.map(r => [r.name, r.esme_shopify_inventory_item_id]));
}

async function adjust(changes, locationId, seed, reason = 'correction') {
    if (!changes.length) return;
    const data = await gql(`mutation adjust($input: InventoryAdjustQuantitiesInput!, $idempotencyKey: String!) {
        inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) { userErrors { field message } }
    }`, {
        input: {
            reason, name: 'available', referenceDocumentUri: `esme-ims://${seed}`,
            // changeFromQuantity null = no compare-and-swap: deltas are meant to commute.
            changes: changes.map(c => ({ inventoryItemId: gid('InventoryItem', c.inventoryItemId), locationId: gid('Location', locationId), delta: c.delta, changeFromQuantity: null })),
        },
        idempotencyKey: idemKey(seed),
    });
    assertNoUserErrors(data.inventoryAdjustQuantities, 'inventory adjust');
}

/** After an IMS Stock Entry: push the net change at the online warehouse for linked items. */
async function pushMovementDeltas(entry) {
    if (!cfg.enabled || !config.erp.apiKey) return;
    const erp = client();
    const { locationId, warehouse } = await syncSettings(erp);
    if (!locationId || !warehouse) return;
    const net = new Map();
    for (const l of entry.items || []) {
        const d = (l.t_warehouse === warehouse ? Number(l.qty) : 0) - (l.s_warehouse === warehouse ? Number(l.qty) : 0);
        if (d) net.set(l.item_code, (net.get(l.item_code) || 0) + d);
    }
    const links = await linkedItems(erp, [...net.keys()]);
    const changes = [...net.entries()].filter(([sku, d]) => d && links.has(sku)).map(([sku, delta]) => ({ inventoryItemId: links.get(sku), delta }));
    await adjust(changes, locationId, `stock-entry/${entry.name}`, entry.esme_reason === 'Damaged' ? 'damaged' : entry.purpose === 'Material Receipt' ? 'received' : 'correction');
    if (changes.length) log.info({ entry: entry.name, changes: changes.length }, 'pushed stock deltas to Shopify');
}

/** After a stock count at the online warehouse. */
async function pushCountDeltas(adjustments) {
    if (!cfg.enabled || !config.erp.apiKey) return;
    const erp = client();
    const { locationId } = await syncSettings(erp);
    if (!locationId) return;
    const links = await linkedItems(erp, adjustments.map(a => a.sku));
    const changes = adjustments.filter(a => links.has(a.sku)).map(a => ({ inventoryItemId: links.get(a.sku), delta: a.diff }));
    await adjust(changes, locationId, `count/${adjustments.map(a => `${a.sku}:${a.counted}`).join(',')}/${new Date().toISOString().slice(0, 16)}`, 'cycle_count_available');
}

// ---------- Shopify -> IMS ----------

const ORDERS_QUERY = `query orders($q: String!, $after: String) {
  orders(first: 50, after: $after, query: $q, sortKey: CREATED_AT) {
    nodes {
      id name createdAt cancelledAt test
      totalPriceSet { shopMoney { amount } }
      lineItems(first: 100) { nodes { sku quantity originalTotalSet { shopMoney { amount } } variant { inventoryItem { id } } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function fetchOrders(q) {
    const out = [];
    let after = null;
    do {
        const data = await gql(ORDERS_QUERY, { q, after });
        out.push(...data.orders.nodes);
        after = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
    } while (after && out.length < 2000);
    return out;
}

async function entryExists(erp, reference) {
    return (await erp.list('Stock Entry', { fields: ['name'], filters: [['esme_reference', '=', reference], ['docstatus', '=', 1]], limit: 1 })).length > 0;
}

/** Map Shopify line items to IMS SKUs via the linked inventory item id, falling back to SKU. */
async function resolveLines(erp, lineItems) {
    const ids = [...new Set(lineItems.map(l => l.variant?.inventoryItem?.id?.split('/').pop()).filter(Boolean))];
    const byInv = ids.length
        ? new Map((await erp.list('Item', { fields: ['name', 'esme_shopify_inventory_item_id'], filters: [['esme_shopify_inventory_item_id', 'in', ids]], limit: 0 })).map(r => [r.esme_shopify_inventory_item_id, r.name]))
        : new Map();
    const lines = [], unmatched = [];
    for (const l of lineItems) {
        const sku = byInv.get(l.variant?.inventoryItem?.id?.split('/').pop()) || (l.sku && (await erp.exists('Item', l.sku.toUpperCase())) ? l.sku.toUpperCase() : null);
        if (sku && l.quantity > 0) lines.push({ sku, qty: l.quantity, amount: Number(l.originalTotalSet?.shopMoney?.amount) || 0 });
        else unmatched.push(l.sku || '(no SKU)');
    }
    return { lines, unmatched };
}

async function syncOrders(erp = client()) {
    const { postMovement } = require('./movements');
    const s = await syncSettings(erp);
    if (!s.warehouse) throw new HttpError(422, 'Set the Shopify location (warehouse) in Settings first');
    const since = s.syncedUntil ? new Date(`${s.syncedUntil.replace(' ', 'T').replace(/\.\d+$/, '')}+05:30`) : new Date(Date.now() - 7 * 86400_000);
    const sinceIso = new Date(since.getTime() - 5 * 60_000).toISOString(); // small overlap; idempotency absorbs repeats
    const report = { orders: 0, recorded: 0, already: 0, returns: 0, failed: [], unmatched: [] };

    const orders = await fetchOrders(`created_at:>='${sinceIso}'`);
    let earliestFailure = null;
    for (const o of orders) {
        if (o.test) continue;
        report.orders++;
        const ref = `shopify:${o.name}`;
        if (await entryExists(erp, ref)) { report.already++; continue; }
        const { lines, unmatched } = await resolveLines(erp, o.lineItems.nodes);
        report.unmatched.push(...unmatched.map(sku => `${o.name} ${sku}`));
        if (!lines.length) continue;
        try {
            await postMovement(erp, {
                type: 'issue', reason: 'Sale - Online', from: s.warehouse, reference: ref, party: 'Shopify',
                sale_value: lines.reduce((sum, l) => sum + l.amount, 0), notes: `Shopify order ${o.name}`,
                lines: lines.map(({ sku, qty }) => ({ sku, qty })), origin: 'shopify',
            });
            report.recorded++;
        } catch (err) {
            report.failed.push(`${o.name}: ${err.message}`);
            earliestFailure ??= o.createdAt;
        }
    }

    // Cancelled orders Shopify restocked: put the pieces back in the online warehouse.
    const cancelled = await fetchOrders(`status:cancelled AND updated_at:>='${sinceIso}'`);
    for (const o of cancelled) {
        const ref = `shopify-cancel:${o.name}`;
        if (!(await entryExists(erp, `shopify:${o.name}`)) || await entryExists(erp, ref)) continue;
        const { lines } = await resolveLines(erp, o.lineItems.nodes);
        if (!lines.length) continue;
        try {
            await postMovement(erp, { type: 'receipt', reason: 'Customer Return', to: s.warehouse, reference: ref, party: 'Shopify', notes: `Shopify order ${o.name} cancelled`, lines: lines.map(({ sku, qty }) => ({ sku, qty })), origin: 'shopify' });
            report.returns++;
        } catch (err) { report.failed.push(`${o.name} (cancel): ${err.message}`); }
    }

    // ponytail: the cursor stops at the earliest failed order so it is retried next run; already-recorded
    // orders are skipped by reference. A permanently failing order keeps the window open until fixed.
    const until = earliestFailure ? new Date(earliestFailure) : new Date();
    const summary = `${new Date().toISOString()} · ${report.orders} orders, ${report.recorded} recorded, ${report.returns} returns, ${report.failed.length} failed${report.unmatched.length ? `, ${report.unmatched.length} unmatched lines` : ''}`;
    await erp.update('Esme Settings', 'Esme Settings', {
        shopify_orders_synced_until: until.toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace('T', ' '),
        shopify_last_sync_log: [summary, ...report.failed, ...report.unmatched.slice(0, 20).map(u => `unmatched: ${u}`)].join('\n'),
    });
    log.info(report, 'shopify order sync');
    return report;
}

// ---------- catalogue import / link ----------

const VARIANTS_QUERY = `query variants($after: String, $loc: ID!) {
  productVariants(first: 100, after: $after) {
    nodes {
      id sku title price
      selectedOptions { name value }
      product { title productType tags status featuredMedia { preview { image { url } } } }
      inventoryItem { id tracked unitCost { amount } inventoryLevel(locationId: $loc) { quantities(names: ["available"]) { name quantity } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function fetchVariants(locationId) {
    const out = [];
    let after = null;
    do {
        const data = await gql(VARIANTS_QUERY, { after, loc: gid('Location', locationId) });
        out.push(...data.productVariants.nodes);
        after = data.productVariants.pageInfo.hasNextPage ? data.productVariants.pageInfo.endCursor : null;
    } while (after && out.length < 20000);
    return out;
}

// How Esme's Shopify catalogue maps onto IMS pieces. Most variants carry no SKU and one "Color" option
// that holds either the plating (Gold, Silver, Rose gold, Gunmetal) or the crystal colour (Green, Pink...).
const CATEGORY_WORDS = [
    ['ear cuff', 'Ear Cuffs'], ['earcuff', 'Ear Cuffs'], ['earring', 'Earrings'], ['dangler', 'Earrings'], ['jhumka', 'Earrings'], ['stud', 'Earrings'], ['hoop', 'Earrings'],
    ['bag charm', 'Bag Charms'], ['keychain', 'Bag Charms'], ['watch charm', 'Watch Charms'], ['lapel', 'Lapel Pins'], ['cufflink', 'Cufflinks'],
    ['button cover', 'Button Covers'], ['brooch', 'Brooches'], ['pendant', 'Pendants'],
    ['necklace', 'Necklaces'], ['neckpiece', 'Necklaces'], ['choker', 'Necklaces'], ['lariat', 'Necklaces'], ['chain', 'Necklaces'],
    ['bracelet', 'Bracelets'], ['bangle', 'Bracelets'], ['kada', 'Bracelets'], ['ring', 'Rings'], ['stack', 'Rings'],
    ['jewellery set', 'Jewellery Sets'], ['jewelry set', 'Jewellery Sets'], ['set', 'Jewellery Sets'], ['combo', 'Jewellery Sets'], ['men', "Men's Jewellery"],
];
const FINISH_WORDS = [['rose gold', 'Rose Gold Plated'], ['gunmetal', 'Gunmetal'], ['two tone', 'Two-tone'], ['two-tone', 'Two-tone'], ['silver', 'Silver Plated'], ['gold', 'Gold Plated']];
const IGNORE_VALUES = /^(default title|product style|as shown)$/i;
const norm = t => String(t || '').toLowerCase().replace(/['’]/g, '').replace(/\bcollection\b/g, '').replace(/\s+/g, ' ').trim();
const titleCase = t => t.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

/** Pure mapping of one Shopify variant (GraphQL shape) to IMS fields. `categories` and `collections` are the IMS names. */
function mapVariant(v, { categories, collections }) {
    const sources = [v.product.productType, v.product.title, (v.product.tags || []).join(' ')].map(x => String(x || '').toLowerCase());
    let category = 'Accessories';
    outer: for (const src of sources) for (const [w, c] of CATEGORY_WORDS) if (src.includes(w) && categories.includes(c)) { category = c; break outer; }
    const tags = (v.product.tags || []).map(norm);
    const collection = collections.find(c => tags.some(t => t === norm(c) || t.includes(norm(c)))) || null;
    let finish = '', colour = '';
    const extra = [];
    for (const o of v.selectedOptions || [{ name: 'Color', value: v.title }]) {
        const value = String(o.value || '').trim();
        if (!value || IGNORE_VALUES.test(value)) continue;
        if (/colou?r/i.test(o.name)) {
            const f = FINISH_WORDS.find(([w]) => value.toLowerCase().includes(w));
            if (f) finish = f[1]; else colour = titleCase(value);
        } else extra.push(value);
    }
    const label = [...extra, colour || (finish && finish.replace(' Plated', ''))].filter(Boolean).join(' / ');
    return { name: (label ? `${v.product.title} - ${label}` : v.product.title).slice(0, 140), category, collection, finish, colour };
}

const available = v => v.inventoryItem?.inventoryLevel?.quantities?.find(q => q.name === 'available')?.quantity ?? 0;

async function importCatalogue(erp, { createMissing = true, importStock = true } = {}) {
    const { postMovement } = require('./movements');
    const { nextSkuFrom } = require('./inventory');
    const s = await syncSettings(erp);
    if (!s.locationId || !s.warehouse) throw new HttpError(422, 'Choose the Shopify location and the IMS online warehouse first');
    const [variants, items, groups, cols] = await Promise.all([
        fetchVariants(s.locationId),
        erp.list('Item', { fields: ['name', 'esme_shopify_inventory_item_id'], limit: 0 }),
        erp.list('Item Group', { fields: ['name', 'esme_sku_prefix'], filters: [['parent_item_group', '=', 'Jewellery']], limit: 0 }),
        erp.list('Esme Collection', { fields: ['name'], limit: 0 }),
    ]);
    const bySku = new Map(items.map(i => [i.name, i]));
    const byInv = new Map(items.filter(i => i.esme_shopify_inventory_item_id).map(i => [i.esme_shopify_inventory_item_id, i.name]));
    const codes = items.map(i => i.name);
    const prefixOf = Object.fromEntries(groups.map(g => [g.name, g.esme_sku_prefix || g.name.slice(0, 3).toUpperCase()]));
    const ctx = { categories: groups.map(g => g.name), collections: cols.map(c => c.name) };
    const report = { variants: variants.length, linked: 0, created: 0, stocked: 0, skipped: [] };
    const opening = [];

    for (const v of variants) {
        const invId = v.inventoryItem?.id?.split('/').pop();
        if (!v.inventoryItem?.tracked) { report.skipped.push(`${v.product.title} / ${v.title}: inventory not tracked in Shopify`); continue; }
        if (byInv.has(invId)) continue;                                        // already linked on an earlier import
        const link = { esme_shopify_variant_id: v.id.split('/').pop(), esme_shopify_inventory_item_id: invId };
        const own = (v.sku || '').trim().toUpperCase();
        if (own && bySku.has(own)) { await erp.update('Item', own, link); report.linked++; continue; }
        if (!createMissing) continue;
        const m = mapVariant(v, ctx);
        // Esme's variants mostly have no SKU: give them one from the category prefix (EAR-00012) and link by inventory item.
        const sku = /^[A-Z0-9][A-Z0-9-]{1,39}$/.test(own) ? own : nextSkuFrom(prefixOf[m.category] || 'ACC', codes);
        codes.push(sku);
        await erp.insert({
            doctype: 'Item', item_code: sku, item_name: m.name, item_group: m.category, stock_uom: 'Nos', is_stock_item: 1,
            valuation_method: 'Moving Average', valuation_rate: Number(v.inventoryItem.unitCost?.amount) || 0,
            image: v.product.featuredMedia?.preview?.image?.url || '', esme_collection: m.collection, esme_finish: m.finish,
            esme_crystal_colour: m.colour, barcodes: [{ barcode: sku }], ...link,
        });
        await erp.insert({ doctype: 'Item Price', item_code: sku, price_list: config.erp.sellingPriceList, price_list_rate: Number(v.price) || 0 });
        report.created++;
        if (importStock && available(v) > 0) opening.push({ sku, qty: available(v), rate: Number(v.inventoryItem.unitCost?.amount) || 0 });
    }
    if (opening.length) {
        // Origin shopify: Shopify already holds these quantities, so nothing is pushed back.
        await postMovement(erp, { type: 'receipt', reason: 'Opening Stock', to: s.warehouse, reference: `shopify-import:${new Date().toISOString().slice(0, 10)}`, party: 'Shopify', lines: opening, origin: 'shopify' });
        report.stocked = opening.length;
    }
    return report;
}

// ---------- drift ----------

async function drift(erp) {
    const s = await syncSettings(erp);
    if (!s.locationId || !s.warehouse) throw new HttpError(422, 'Choose the Shopify location and the IMS online warehouse first');
    const items = await erp.list('Item', { fields: ['name', 'item_name', 'esme_shopify_inventory_item_id'], filters: [['esme_shopify_inventory_item_id', 'is', 'set'], ['disabled', '=', 0]], limit: 0 });
    const bins = await erp.list('Bin', { fields: ['item_code', 'actual_qty'], filters: [['warehouse', '=', s.warehouse]], limit: 0 });
    const ims = new Map(bins.map(b => [b.item_code, Number(b.actual_qty)]));
    const shop = new Map();
    for (let i = 0; i < items.length; i += 100) {
        const data = await gql(`query levels($ids: [ID!]!, $loc: ID!) { nodes(ids: $ids) { ... on InventoryItem { id inventoryLevel(locationId: $loc) { quantities(names: ["available"]) { name quantity } } } } }`,
            { ids: items.slice(i, i + 100).map(it => gid('InventoryItem', it.esme_shopify_inventory_item_id)), loc: gid('Location', s.locationId) });
        for (const n of data.nodes) if (n) shop.set(n.id.split('/').pop(), n.inventoryLevel?.quantities?.find(q => q.name === 'available')?.quantity ?? null);
    }
    return items.map(it => {
        const shopify = shop.get(it.esme_shopify_inventory_item_id) ?? null;
        const imsQty = ims.get(it.name) || 0;
        return { sku: it.name, name: it.item_name, inventory_item_id: it.esme_shopify_inventory_item_id, ims: imsQty, shopify, diff: shopify == null ? null : imsQty - shopify };
    });
}

/** Make Shopify match IMS for the given rows, compare-and-swap on the quantity we just read. */
async function pushAbsolute(rows, locationId) {
    const todo = rows.filter(r => r.shopify != null && r.diff !== 0);
    for (let i = 0; i < todo.length; i += 100) {
        const batch = todo.slice(i, i + 100);
        const data = await gql(`mutation set($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
            inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) { userErrors { code field message } }
        }`, {
            input: {
                name: 'available', reason: 'correction', referenceDocumentUri: 'esme-ims://drift-fix',
                quantities: batch.map(r => ({ inventoryItemId: gid('InventoryItem', r.inventory_item_id), locationId: gid('Location', locationId), quantity: r.ims, changeFromQuantity: r.shopify })),
            },
            idempotencyKey: idemKey(`set/${batch.map(r => `${r.sku}:${r.shopify}>${r.ims}`).join(',')}`),
        });
        assertNoUserErrors(data.inventorySetQuantities, 'inventory set');
    }
    return todo.length;
}

let timer;
function startScheduler() {
    if (!cfg.enabled || !cfg.syncMinutes || !config.erp.apiKey) return;
    let running = false;
    timer = setInterval(async () => {
        if (running) return;
        running = true;
        try { await syncOrders(client()); } catch (err) { log.error({ err: err.message }, 'scheduled shopify sync failed'); } finally { running = false; }
    }, cfg.syncMinutes * 60_000);
    timer.unref();
    log.info(`Shopify order sync every ${cfg.syncMinutes} min`);
}

module.exports = { mapVariant, listLocations, syncSettings, syncOrders, importCatalogue, drift, pushAbsolute, pushMovementDeltas, pushCountDeltas, startScheduler, idemKey };
