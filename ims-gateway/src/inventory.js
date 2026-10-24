'use strict';
// Read models over ERPNext: catalogue, stock levels and prices assembled into the rows the UI shows.
// ponytail: loads the whole catalogue per request and filters in memory. Fine to ~10k SKUs;
// beyond that, move filtering into an ERPNext Query Report.

const config = require('./config');

const ITEM_FIELDS = [
    'name', 'item_name', 'item_group', 'image', 'description', 'disabled', 'modified', 'creation', 'valuation_rate',
    'esme_collection', 'esme_finish', 'esme_crystal_colour', 'esme_shopify_variant_id', 'esme_shopify_inventory_item_id',
];
const ALL = 0; // limit_page_length=0 returns every row

// Esme Crystal's own price bands (as on esmecrystal.com).
const PRICE_BANDS = { under5k: [0, 5000], '5to10k': [5000, 10000], over10k: [10000, Infinity] };

async function loadSettings(erp) {
    const settings = await erp.getSingle('Esme Settings');
    return {
        default_warehouse: settings.default_warehouse,
        online_warehouse: settings.online_warehouse,
        low_stock_default: Number(settings.low_stock_default) || 0,
        shopify_location_id: settings.shopify_location_id || '',
        shopify_orders_synced_until: settings.shopify_orders_synced_until || null,
        shopify_last_sync_log: settings.shopify_last_sync_log || '',
    };
}

async function loadLocations(erp) {
    const rows = await erp.list('Warehouse', { fields: ['name', 'warehouse_name', 'is_group', 'disabled'], filters: [['is_group', '=', 0], ['company', '=', config.erp.company]], limit: ALL, orderBy: 'warehouse_name asc' });
    return rows.filter(r => !r.disabled).map(r => ({ name: r.name, label: r.warehouse_name }));
}

/** Everything a catalogue view needs, keyed by SKU. Price is the MRP (Item Price on the selling price list). */
async function loadCatalogue(erp) {
    const [items, bins, prices, reorders, settings] = await Promise.all([
        erp.list('Item', { fields: ITEM_FIELDS, filters: [['is_stock_item', '=', 1]], limit: ALL, orderBy: 'creation desc' }),
        erp.list('Bin', { fields: ['item_code', 'warehouse', 'actual_qty', 'stock_value', 'valuation_rate'], limit: ALL }),
        erp.list('Item Price', { fields: ['item_code', 'price_list_rate'], filters: [['price_list', '=', config.erp.sellingPriceList]], limit: ALL }),
        erp.request('GET', `/api/resource/Item%20Reorder?fields=${encodeURIComponent('["parent","warehouse","warehouse_reorder_level","warehouse_reorder_qty"]')}&parent=Item&limit_page_length=0`).then(r => r.data),
        loadSettings(erp),
    ]);

    const group = (rows, key) => rows.reduce((m, r) => (m.get(r[key])?.push(r) ?? m.set(r[key], [r]), m), new Map());
    const binsBy = group(bins, 'item_code');
    const reorderBy = group(reorders, 'parent');
    const mrpBy = new Map(prices.map(p => [p.item_code, Number(p.price_list_rate)]));

    const rows = items.map(it => {
        const itemBins = binsBy.get(it.name) || [];
        const stock = Object.fromEntries(itemBins.filter(b => b.actual_qty).map(b => [b.warehouse, Number(b.actual_qty)]));
        const onHand = itemBins.reduce((s, b) => s + Number(b.actual_qty || 0), 0);
        const stockValue = itemBins.reduce((s, b) => s + Number(b.stock_value || 0), 0);
        const reorderLevel = (reorderBy.get(it.name) || []).reduce((s, r) => s + Number(r.warehouse_reorder_level || 0), 0) || settings.low_stock_default;
        const mrp = mrpBy.get(it.name) ?? null;
        return {
            sku: it.name,
            name: it.item_name,
            category: it.item_group,
            collection: it.esme_collection || null,
            finish: it.esme_finish || null,
            crystal_colour: it.esme_crystal_colour || null,
            image: it.image || null,
            mrp,
            price: mrp ?? 0,
            cost: onHand > 0 ? Math.round((stockValue / onHand) * 100) / 100 : Number(it.valuation_rate) || 0,
            on_hand: onHand,
            stock,
            stock_value: Math.round(stockValue),
            retail_value: Math.round((mrp ?? 0) * onHand),
            reorder_level: reorderLevel,
            status: onHand <= 0 ? 'out' : onHand <= reorderLevel ? 'low' : 'in',
            disabled: Boolean(it.disabled),
            shopify_linked: Boolean(it.esme_shopify_inventory_item_id),
            created: it.creation,
            modified: it.modified,
        };
    });
    return { rows, settings };
}

/** Next SKU for a prefix given the existing item codes: highest numeric suffix + 1, zero-padded to 5. */
function nextSkuFrom(prefix, codes) {
    const max = codes.filter(c => c.startsWith(`${prefix}-`)).map(c => Number(/-(\d+)$/.exec(c)?.[1])).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
    return `${prefix}-${String(max + 1).padStart(5, '0')}`;
}

async function nextSku(erp, category) {
    const group = await erp.get('Item Group', category);
    const prefix = (group.esme_sku_prefix || category.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const last = await erp.list('Item', { fields: ['name'], filters: [['name', 'like', `${prefix}-%`]], orderBy: 'name desc', limit: 500 });
    return nextSkuFrom(prefix, last.map(r => r.name));
}

module.exports = { loadSettings, loadLocations, loadCatalogue, nextSku, nextSkuFrom, PRICE_BANDS, ITEM_FIELDS, ALL };
