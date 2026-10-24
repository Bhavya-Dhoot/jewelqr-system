'use strict';
const express = require('express');
const Joi = require('joi');
const multer = require('multer');
const sharp = require('sharp');
const config = require('../config');
const { loadCatalogue, loadSettings, loadStoneTypes, ratesFor, nextSku } = require('../inventory');
const { computePrice } = require('../pricing');
const { postMovement } = require('../movements');
const { HttpError, validate, wrap } = require('../http');

const router = express.Router();

const stone = Joi.object({
    stone_type: Joi.string().max(140).required(),
    source: Joi.string().valid('Natural', 'Lab-grown').default('Natural'),
    weight_ct: Joi.number().positive().max(100).required(),
});

const itemFields = {
    name: Joi.string().trim().min(2).max(140),
    category: Joi.string().max(140),
    collection: Joi.string().max(140).allow(null, ''),
    finish: Joi.string().max(60).allow(null, ''),
    crystal_colour: Joi.string().trim().max(60).allow(null, ''),
    description: Joi.string().max(2000).allow(null, ''),
    pricing_mode: Joi.string().valid('Fixed MRP', 'Metal Rate'),
    mrp: Joi.number().min(0).max(1e8).allow(null),
    cost: Joi.number().min(0).max(1e8).allow(null),
    metal_purity: Joi.string().valid('24K', '22K', '18K', '14K').allow(null, ''),
    metal_weight_g: Joi.number().min(0).max(10000).allow(null),
    stones: Joi.array().items(stone).max(6),
    reorder_level: Joi.number().integer().min(0).max(100000).allow(null),
    reorder_qty: Joi.number().integer().min(0).max(100000).allow(null),
    disabled: Joi.boolean(),
};

const createSchema = Joi.object({
    ...itemFields,
    sku: Joi.string().trim().uppercase().pattern(/^[A-Z0-9][A-Z0-9-]{1,39}$/).message('SKU may only contain letters, digits and dashes'),
    name: itemFields.name.required(),
    category: itemFields.category.required(),
    pricing_mode: itemFields.pricing_mode.default('Fixed MRP'),
    opening: Joi.object({ warehouse: Joi.string().max(140), qty: Joi.number().integer().min(1).max(100000).required() }),
}).custom((v, helpers) => {
    if (v.pricing_mode === 'Metal Rate' && !(v.metal_weight_g > 0 && v.metal_purity)) return helpers.message('Metal Rate items need a gold purity and a gold weight above 0');
    return v;
});
const updateSchema = Joi.object(itemFields).min(1);

/** Map the IMS item shape onto ERPNext Item fields. Only keys present in the input are written. */
function toErpItem(input, settings) {
    const doc = {};
    const set = (key, erpKey, fn = v => v) => { if (input[key] !== undefined) doc[erpKey] = fn(input[key]); };
    set('name', 'item_name');
    set('category', 'item_group');
    set('collection', 'esme_collection', v => v || null);
    set('finish', 'esme_finish', v => v || '');
    set('crystal_colour', 'esme_crystal_colour', v => v || '');
    set('description', 'description', v => v || '');
    set('pricing_mode', 'esme_pricing_mode');
    set('cost', 'valuation_rate', v => v ?? 0);
    set('metal_purity', 'esme_metal_purity', v => v || '');
    set('metal_weight_g', 'esme_metal_weight_g', v => v ?? 0);
    set('stones', 'esme_stones', v => v.map(s => ({ stone_type: s.stone_type, source: s.source, weight_ct: s.weight_ct })));
    set('disabled', 'disabled', v => (v ? 1 : 0));
    if (input.reorder_level !== undefined) {
        doc.reorder_levels = input.reorder_level
            ? [{ warehouse: settings.default_warehouse, warehouse_reorder_level: input.reorder_level, warehouse_reorder_qty: input.reorder_qty || input.reorder_level * 2, material_request_type: 'Purchase' }]
            : [];
    }
    return doc;
}

async function upsertMrp(erp, sku, mrp) {
    const existing = await erp.list('Item Price', { fields: ['name'], filters: [['item_code', '=', sku], ['price_list', '=', config.erp.sellingPriceList]], limit: 1 });
    if (existing.length) await erp.update('Item Price', existing[0].name, { price_list_rate: mrp });
    else await erp.insert({ doctype: 'Item Price', item_code: sku, price_list: config.erp.sellingPriceList, price_list_rate: mrp });
}

// ---------- list ----------

const listSchema = Joi.object({
    q: Joi.string().trim().max(100).allow(''),
    category: Joi.string().max(140).allow(''),
    collection: Joi.string().max(140).allow(''),
    finish: Joi.string().max(60).allow(''),
    location: Joi.string().max(140).allow(''),
    stock: Joi.string().valid('in', 'low', 'out', '').allow(''),
    status: Joi.string().valid('active', 'archived', 'all').default('active'),
    sort: Joi.string().valid('newest', 'name', 'sku', 'stock', 'value').default('newest'),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(500).default(50),
});

router.get('/', wrap(async (req, res) => {
    const f = validate(req.query, listSchema);
    const { rows } = await loadCatalogue(req.erp);
    const q = f.q?.toLowerCase();
    let out = rows.filter(r =>
        (f.status === 'all' || (f.status === 'archived') === r.disabled)
        && (!f.category || r.category === f.category)
        && (!f.collection || r.collection === f.collection)
        && (!f.finish || r.finish === f.finish)
        && (!f.location || (r.stock[f.location] || 0) > 0)
        && (!f.stock || r.status === f.stock)
        && (!q || [r.sku, r.name, r.collection, r.crystal_colour, r.category].some(v => v?.toLowerCase().includes(q))));
    const sorters = {
        newest: (a, b) => (b.created > a.created ? 1 : -1),
        name: (a, b) => a.name.localeCompare(b.name),
        sku: (a, b) => a.sku.localeCompare(b.sku),
        stock: (a, b) => a.on_hand - b.on_hand,
        value: (a, b) => b.stock_value - a.stock_value,
    };
    out.sort(sorters[f.sort]);
    const total = out.length;
    out = out.slice((f.page - 1) * f.pageSize, f.page * f.pageSize);
    res.json({ items: out, total, page: f.page, pageSize: f.pageSize });
}));

router.get('/next-sku', wrap(async (req, res) => {
    const { category } = validate(req.query, Joi.object({ category: Joi.string().max(140).required() }));
    res.json({ sku: await nextSku(req.erp, category) });
}));

// ---------- detail ----------

router.get('/:sku', wrap(async (req, res) => {
    const sku = req.params.sku.toUpperCase();
    const erp = req.erp;
    const [item, bins, prices, settings, stoneTypes, ledger] = await Promise.all([
        erp.get('Item', sku),
        erp.list('Bin', { fields: ['warehouse', 'actual_qty', 'stock_value', 'valuation_rate'], filters: [['item_code', '=', sku]], limit: 0 }),
        erp.list('Item Price', { fields: ['price_list_rate'], filters: [['item_code', '=', sku], ['price_list', '=', config.erp.sellingPriceList]], limit: 1 }),
        loadSettings(erp),
        loadStoneTypes(erp),
        erp.list('Stock Ledger Entry', {
            fields: ['posting_date', 'posting_time', 'warehouse', 'actual_qty', 'qty_after_transaction', 'voucher_type', 'voucher_no', 'owner'],
            filters: [['item_code', '=', sku], ['is_cancelled', '=', 0]], orderBy: 'posting_date desc, posting_time desc, creation desc', limit: 50,
        }),
    ]);
    const entryNames = [...new Set(ledger.filter(l => l.voucher_type === 'Stock Entry').map(l => l.voucher_no))];
    const entries = entryNames.length
        ? await erp.list('Stock Entry', { fields: ['name', 'esme_reason', 'esme_reference', 'purpose'], filters: [['name', 'in', entryNames]], limit: 0 })
        : [];
    const entryBy = new Map(entries.map(e => [e.name, e]));
    // Stock Reconciliation ledger rows carry the new balance, not the change: derive it from the
    // previous row for the same warehouse (rows are newest first).
    const qtyChange = (l, i) => {
        if (l.voucher_type !== 'Stock Reconciliation') return Number(l.actual_qty);
        const prev = ledger.slice(i + 1).find(o => o.warehouse === l.warehouse);
        return Number(l.qty_after_transaction) - (prev ? Number(prev.qty_after_transaction) : 0);
    };
    const mrp = prices[0] ? Number(prices[0].price_list_rate) : null;
    const reorder = item.reorder_levels?.[0];
    const onHand = bins.reduce((s, b) => s + Number(b.actual_qty || 0), 0);
    const stockValue = bins.reduce((s, b) => s + Number(b.stock_value || 0), 0);
    const detail = {
        sku: item.name,
        name: item.item_name,
        category: item.item_group,
        collection: item.esme_collection || null,
        finish: item.esme_finish || null,
        crystal_colour: item.esme_crystal_colour || null,
        description: item.description ? item.description.replace(/<[^>]+>/g, '').trim() : '',
        image: item.image || null,
        pricing_mode: item.esme_pricing_mode || 'Fixed MRP',
        mrp,
        cost: onHand > 0 ? Math.round((stockValue / onHand) * 100) / 100 : Number(item.valuation_rate) || 0,
        metal_purity: item.esme_metal_purity || null,
        metal_weight_g: Number(item.esme_metal_weight_g) || 0,
        stones: (item.esme_stones || []).map(s => ({ stone_type: s.stone_type, source: s.source, weight_ct: Number(s.weight_ct) })),
        reorder_level: reorder ? Number(reorder.warehouse_reorder_level) : null,
        reorder_qty: reorder ? Number(reorder.warehouse_reorder_qty) : null,
        disabled: Boolean(item.disabled),
        shopify_variant_id: item.esme_shopify_variant_id || null,
        created: item.creation,
        modified: item.modified,
        modified_by: item.modified_by,
        on_hand: onHand,
        stock_value: Math.round(stockValue),
    };
    res.json({
        item: detail,
        stock: bins.filter(b => Number(b.actual_qty) !== 0).map(b => ({ warehouse: b.warehouse, qty: Number(b.actual_qty), value: Math.round(Number(b.stock_value)) })),
        price: computePrice(detail, ratesFor(settings, stoneTypes)),
        qr_url: `${config.publicUrl}/s/${encodeURIComponent(detail.sku)}`,
        movements: ledger.map((l, i) => ({
            date: l.posting_date, time: String(l.posting_time).slice(0, 5), warehouse: l.warehouse,
            qty: qtyChange(l, i), balance: Number(l.qty_after_transaction),
            voucher_type: l.voucher_type, voucher_no: l.voucher_no, by: l.owner,
            reason: entryBy.get(l.voucher_no)?.esme_reason || (l.voucher_type === 'Stock Reconciliation' ? 'Stock count' : entryBy.get(l.voucher_no)?.purpose || l.voucher_type),
            reference: entryBy.get(l.voucher_no)?.esme_reference || null,
        })),
    });
}));

// ---------- create / update ----------

router.post('/', wrap(async (req, res) => {
    const input = validate(req.body, createSchema);
    const erp = req.erp;
    const settings = await loadSettings(erp);
    const base = {
        doctype: 'Item', stock_uom: 'Nos', is_stock_item: 1, include_item_in_manufacturing: 0, valuation_method: 'Moving Average',
        ...toErpItem({ reorder_level: null, ...input }, settings),
    };

    let created;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
        const sku = input.sku || await nextSku(erp, input.category);
        try {
            created = await erp.insert({ ...base, item_code: sku, barcodes: [{ barcode: sku }] });
        } catch (err) {
            // Someone took this SKU between lookup and insert; generated SKUs retry, chosen ones don't.
            if (err.status !== 409 || input.sku) throw err.status === 409 ? new HttpError(409, `SKU ${sku} already exists`) : err;
        }
    }
    if (!created) throw new HttpError(409, 'Could not allocate a unique SKU, please retry');

    if (input.mrp != null) await upsertMrp(erp, created.name, input.mrp);
    if (input.opening?.qty) {
        await postMovement(erp, {
            type: 'receipt', reason: 'Opening Stock', to: input.opening.warehouse || settings.default_warehouse,
            lines: [{ sku: created.name, qty: input.opening.qty, rate: input.cost || 0 }],
        });
    }
    res.status(201).json({ sku: created.name });
}));

router.put('/:sku', wrap(async (req, res) => {
    const sku = req.params.sku.toUpperCase();
    const input = validate(req.body, updateSchema);
    const settings = await loadSettings(req.erp);
    const patch = toErpItem(input, settings);
    if (Object.keys(patch).length) await req.erp.update('Item', sku, patch);
    if (input.mrp != null) await upsertMrp(req.erp, sku, input.mrp);
    res.json({ sku });
}));

// Archive = disable. ERPNext keeps the item and its ledger; nothing is deleted.
router.delete('/:sku', wrap(async (req, res) => {
    await req.erp.update('Item', req.params.sku.toUpperCase(), { disabled: 1 });
    res.status(204).end();
}));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => cb(/^image\/(jpeg|png|webp|heic|heif|avif)$/.test(file.mimetype) ? null : new HttpError(415, 'Upload a JPEG, PNG, WebP or HEIC image'), true),
});

router.post('/:sku/image', upload.single('image'), wrap(async (req, res) => {
    if (!req.file) throw new HttpError(422, 'No image uploaded');
    const sku = req.params.sku.toUpperCase();
    const buffer = await sharp(req.file.buffer).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const file = await req.erp.upload({ buffer, filename: `${sku}-${Date.now()}.webp`, contentType: 'image/webp', doctype: 'Item', docname: sku, fieldname: 'image' });
    await req.erp.update('Item', sku, { image: file.file_url });
    res.json({ image: file.file_url });
}));

module.exports = router;
