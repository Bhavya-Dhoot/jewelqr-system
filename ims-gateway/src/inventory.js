'use strict';
// Read models over ERPNext: catalogue, stock levels and prices assembled into the rows the UI shows.
// ponytail: loads the whole catalogue per request and filters in memory. Fine to ~10k SKUs;
// beyond that, move filtering into an ERPNext Query Report.

const config = require('./config');
const { computePrice } = require('./pricing');

const ITEM_FIELDS = [
    'name', 'item_name', 'item_group', 'image', 'description', 'disabled', 'modified', 'creation', 'valuation_rate',
    'esme_collection', 'esme_finish', 'esme_crystal_colour', 'esme_pricing_mode', 'esme_metal_purity', 'esme_metal_weight_g',
    'esme_shopify_variant_id', 'esme_shopify_inventory_item_id',
];
const ALL = 0; // limit_page_length=0 returns every row

async function loadSettings(erp) {
    const [settings, goldRates] = await Promise.all([
        erp.getSingle('Esme Settings'),
        erp.list('Esme Gold Rate', { fields: ['rate_date', 'rate_24k'], orderBy: 'rate_date desc, creation desc', limit: 1 }),
    ]);
    return {
        default_warehouse: settings.default_warehouse,
        online_warehouse: settings.online_warehouse,
        labour_rate_per_g: Number(settings.labour_rate_per_g) || 0,
        tax_percent: Number(settings.tax_percent) || 0,
        low_stock_default: Number(settings.low_stock_default) || 0,
        shopify_location_id: settings.shopify_location_id || '',
        shopify_orders_synced_until: settings.shopify_orders_synced_until || null,
        shopify_last_sync_log: settings.shopify_last_sync_log || '',
        gold_rate_24k: Number(goldRates[0]?.rate_24k) || 0,
        gold_rate_date: goldRates[0]?.rate_date || null,
    };
}

async function loadStoneTypes(erp) {
    const rows = await erp.list('Esme Stone Type', { fields: ['name', 'label', 'natural_rate', 'lab_rate', 'is_active'], limit: ALL, orderBy: 'label asc' });
    return rows.map(r => ({ code: r.name, label: r.label, natural_rate: Number(r.natural_rate) || 0, lab_rate: Number(r.lab_rate) || 0, is_active: Boolean(r.is_active) }));
}

function ratesFor(settings, stoneTypes) {
    return {
        gold_rate_24k: settings.gold_rate_24k,
        labour_rate_per_g: settings.labour_rate_per_g,
        tax_percent: settings.tax_percent,
        stones: Object.fromEntries(stoneTypes.map(s => [s.code, s])),
    };
}

async function loadLocations(erp) {
    const rows = await erp.list('Warehouse', { fields: ['name', 'warehouse_name', 'is_group', 'disabled'], filters: [['is_group', '=', 0], ['company', '=', config.erp.company]], limit: ALL, orderBy: 'warehouse_name asc' });
    return rows.filter(r => !r.disabled).map(r => ({ name: r.name, label: r.warehouse_name }));
}

/** Everything a catalogue view needs, keyed by SKU. */
async function loadCatalogue(erp) {
    const [items, bins, prices, reorders, stones, settings, stoneTypes] = await Promise.all([
        erp.list('Item', { fields: ITEM_FIELDS, filters: [['is_stock_item', '=', 1]], limit: ALL, orderBy: 'creation desc' }),
        erp.list('Bin', { fields: ['item_code', 'warehouse', 'actual_qty', 'stock_value', 'valuation_rate'], limit: ALL }),
        erp.list('Item Price', { fields: ['item_code', 'price_list_rate'], filters: [['price_list', '=', config.erp.sellingPriceList]], limit: ALL }),
        erp.request('GET', `/api/resource/Item%20Reorder?fields=${encodeURIComponent('["parent","warehouse","warehouse_reorder_level","warehouse_reorder_qty"]')}&parent=Item&limit_page_length=0`).then(r => r.data),
        erp.request('GET', `/api/resource/Esme%20Stone%20Line?fields=${encodeURIComponent('["parent","stone_type","source","weight_ct"]')}&parent=Item&limit_page_length=0`).then(r => r.data),
        loadSettings(erp),
        loadStoneTypes(erp),
    ]);

    const rates = ratesFor(settings, stoneTypes);
    const group = (rows, key) => rows.reduce((m, r) => (m.get(r[key])?.push(r) ?? m.set(r[key], [r]), m), new Map());
    const binsBy = group(bins, 'item_code');
    const reorderBy = group(reorders, 'parent');
    const stonesBy = group(stones, 'parent');
    const mrpBy = new Map(prices.map(p => [p.item_code, Number(p.price_list_rate)]));

    const rows = items.map(it => {
        const itemBins = binsBy.get(it.name) || [];
        const stock = Object.fromEntries(itemBins.filter(b => b.actual_qty).map(b => [b.warehouse, Number(b.actual_qty)]));
        const onHand = itemBins.reduce((s, b) => s + Number(b.actual_qty || 0), 0);
        const stockValue = itemBins.reduce((s, b) => s + Number(b.stock_value || 0), 0);
        const reorderLevel = (reorderBy.get(it.name) || []).reduce((s, r) => s + Number(r.warehouse_reorder_level || 0), 0) || settings.low_stock_default;
        const pricingMode = it.esme_pricing_mode || 'Fixed MRP';
        const price = computePrice({
            pricing_mode: pricingMode, mrp: mrpBy.get(it.name), metal_purity: it.esme_metal_purity,
            metal_weight_g: it.esme_metal_weight_g, stones: stonesBy.get(it.name) || [],
        }, rates);
        return {
            sku: it.name,
            name: it.item_name,
            category: it.item_group,
            collection: it.esme_collection || null,
            finish: it.esme_finish || null,
            crystal_colour: it.esme_crystal_colour || null,
            image: it.image || null,
            pricing_mode: pricingMode,
            mrp: mrpBy.get(it.name) ?? null,
            price: price.total,
            cost: onHand > 0 ? Math.round((stockValue / onHand) * 100) / 100 : Number(it.valuation_rate) || 0,
            on_hand: onHand,
            stock,
            stock_value: Math.round(stockValue),
            retail_value: Math.round(price.total * onHand),
            reorder_level: reorderLevel,
            status: onHand <= 0 ? 'out' : onHand <= reorderLevel ? 'low' : 'in',
            disabled: Boolean(it.disabled),
            shopify_linked: Boolean(it.esme_shopify_inventory_item_id),
            created: it.creation,
            modified: it.modified,
        };
    });
    return { rows, settings, stoneTypes, rates };
}

async function nextSku(erp, category) {
    const group = await erp.get('Item Group', category);
    const prefix = (group.esme_sku_prefix || category.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const last = await erp.list('Item', { fields: ['name'], filters: [['name', 'like', `${prefix}-%`]], orderBy: 'name desc', limit: 500 });
    const max = last.map(r => Number(/-(\d+)$/.exec(r.name)?.[1])).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
    return `${prefix}-${String(max + 1).padStart(5, '0')}`;
}

module.exports = { loadSettings, loadStoneTypes, loadLocations, loadCatalogue, ratesFor, nextSku, ITEM_FIELDS, ALL };
