'use strict';
// Stock movements are ERPNext Stock Entries (submitted on creation), so the stock ledger,
// moving-average valuation and the negative-stock guard are all ERPNext's.

const config = require('./config');
const { HttpError } = require('./http');
const { loadSettings } = require('./inventory');
const log = require('./log');

const PURPOSE = { receipt: 'Material Receipt', issue: 'Material Issue', transfer: 'Material Transfer' };

/**
 * @param {object} m { type, reason, from, to, reference, party, sale_value, notes, posting_date, lines: [{sku, qty, rate}], origin }
 */
async function postMovement(erp, m) {
    if (m.type !== 'issue' && !m.to) throw new HttpError(422, 'Choose the location stock goes to');
    if (m.type !== 'receipt' && !m.from) throw new HttpError(422, 'Choose the location stock comes from');
    if (m.type === 'transfer' && m.from === m.to) throw new HttpError(422, 'From and To must be different locations');

    // Merge duplicate SKUs (a scan-heavy flow often adds the same piece twice).
    const merged = new Map();
    for (const l of m.lines) {
        const prev = merged.get(l.sku);
        merged.set(l.sku, { sku: l.sku, qty: (prev?.qty || 0) + l.qty, rate: l.rate ?? prev?.rate });
    }
    const lines = [...merged.values()];

    // Receipts need a valuation rate; fall back to the item's standard cost.
    if (m.type === 'receipt') {
        const missing = lines.filter(l => !(l.rate > 0)).map(l => l.sku);
        if (missing.length) {
            const items = await erp.list('Item', { fields: ['name', 'valuation_rate'], filters: [['name', 'in', missing]], limit: 0 });
            const cost = new Map(items.map(i => [i.name, Number(i.valuation_rate) || 0]));
            for (const l of lines) if (!(l.rate > 0)) l.rate = cost.get(l.sku) || 0;
        }
    }

    const doc = {
        doctype: 'Stock Entry',
        stock_entry_type: PURPOSE[m.type],
        purpose: PURPOSE[m.type],
        company: config.erp.company,
        docstatus: 1,
        esme_reason: m.reason || (m.type === 'transfer' ? 'Transfer' : ''),
        esme_reference: m.reference || '',
        esme_party: m.party || '',
        esme_sale_value: m.sale_value || 0,
        remarks: m.notes || '',
        ...(m.posting_date ? { posting_date: m.posting_date, set_posting_time: 1 } : {}),
        items: lines.map(l => ({
            item_code: l.sku,
            qty: l.qty,
            ...(m.type !== 'issue' ? { t_warehouse: m.to } : {}),
            ...(m.type !== 'receipt' ? { s_warehouse: m.from } : {}),
            ...(m.type === 'receipt' ? (l.rate > 0 ? { basic_rate: l.rate } : { allow_zero_valuation_rate: 1 }) : {}),
        })),
    };
    const entry = await erp.insert(doc);

    // Keep Shopify in step when the Online location changed (unless Shopify itself caused it).
    if (m.origin !== 'shopify') {
        require('./shopify').pushMovementDeltas(entry).catch(err => log.warn({ err: err.message, entry: entry.name }, 'shopify delta push failed; use Shopify > Fix drift'));
    }
    return entry;
}

/** Stock count: post only the lines that differ from the system quantity. */
async function postCount(erp, { warehouse, lines, notes }) {
    const skus = lines.map(l => l.sku);
    const [bins, items] = await Promise.all([
        erp.list('Bin', { fields: ['item_code', 'actual_qty', 'valuation_rate'], filters: [['warehouse', '=', warehouse], ['item_code', 'in', skus]], limit: 0 }),
        erp.list('Item', { fields: ['name', 'valuation_rate'], filters: [['name', 'in', skus]], limit: 0 }),
    ]);
    const binBy = new Map(bins.map(b => [b.item_code, b]));
    const costBy = new Map(items.map(i => [i.name, Number(i.valuation_rate) || 0]));
    const unknown = skus.filter(s => !costBy.has(s));
    if (unknown.length) throw new HttpError(422, `Unknown SKU: ${unknown.join(', ')}`);

    const adjustments = lines.map(l => {
        const system = Number(binBy.get(l.sku)?.actual_qty || 0);
        return { sku: l.sku, system, counted: l.counted, diff: l.counted - system, valuation_rate: Number(binBy.get(l.sku)?.valuation_rate) || costBy.get(l.sku) };
    });
    const changed = adjustments.filter(a => a.diff !== 0);
    if (!changed.length) return { name: null, adjustments };

    const entry = await erp.insert({
        doctype: 'Stock Reconciliation', company: config.erp.company, purpose: 'Stock Reconciliation', docstatus: 1, esme_notes: notes || '',
        items: changed.map(a => ({ item_code: a.sku, warehouse, qty: a.counted, valuation_rate: a.valuation_rate || 0, allow_zero_valuation_rate: a.valuation_rate ? 0 : 1 })),
    });
    const settings = await loadSettings(erp);
    if (warehouse === settings.online_warehouse) {
        require('./shopify').pushCountDeltas(changed).catch(err => log.warn({ err: err.message }, 'shopify count push failed'));
    }
    return { name: entry.name, adjustments };
}

module.exports = { postMovement, postCount, PURPOSE };
