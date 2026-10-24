'use strict';
const express = require('express');
const Joi = require('joi');
const { loadCatalogue, ALL } = require('../inventory');
const { validate, wrap } = require('../http');

const router = express.Router();

const iso = d => d.toISOString().slice(0, 10);

router.get('/', wrap(async (req, res) => {
    const { days } = validate(req.query, Joi.object({ days: Joi.number().integer().valid(7, 30, 90, 365).default(30) }));
    const erp = req.erp;
    const since = new Date(Date.now() - (days - 1) * 86400_000);
    const sinceIso = iso(since);

    const [{ rows }, ledger, entries] = await Promise.all([
        loadCatalogue(erp),
        erp.list('Stock Ledger Entry', {
            fields: ['posting_date', 'item_code', 'actual_qty', 'voucher_type', 'voucher_no'],
            filters: [['posting_date', '>=', sinceIso], ['is_cancelled', '=', 0]], limit: ALL,
        }),
        erp.list('Stock Entry', {
            fields: ['name', 'posting_date', 'posting_time', 'purpose', 'esme_reason', 'esme_reference', 'esme_sale_value', 'owner', 'docstatus', 'total_incoming_value', 'total_outgoing_value'],
            filters: [['posting_date', '>=', sinceIso], ['docstatus', '=', 1]], orderBy: 'posting_date desc, posting_time desc, creation desc', limit: ALL,
        }),
    ]);

    const active = rows.filter(r => !r.disabled);
    const entryBy = new Map(entries.map(e => [e.name, e]));
    const isTransfer = name => entryBy.get(name)?.purpose === 'Material Transfer';
    const isSale = name => /^Sale/.test(entryBy.get(name)?.esme_reason || '');

    // Daily units in / out (transfers are internal and net to zero, so they are left out).
    const byDay = new Map();
    for (let d = new Date(since); d <= new Date(); d = new Date(d.getTime() + 86400_000)) byDay.set(iso(d), { date: iso(d), in: 0, out: 0, sold: 0 });
    const soldBySku = new Map();
    for (const l of ledger) {
        if (isTransfer(l.voucher_no)) continue;
        const day = byDay.get(l.posting_date);
        if (!day) continue;
        const q = Number(l.actual_qty);
        if (q > 0) day.in += q; else day.out += -q;
        if (q < 0 && isSale(l.voucher_no)) { day.sold += -q; soldBySku.set(l.item_code, (soldBySku.get(l.item_code) || 0) - q); }
    }

    const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
    const groupSum = (arr, key) => {
        const m = new Map();
        for (const r of arr) {
            const k = key(r) || 'Unassigned';
            const g = m.get(k) || { name: k, skus: 0, units: 0, value: 0, retail: 0 };
            g.skus += r.on_hand > 0 ? 1 : 0; g.units += r.on_hand; g.value += r.stock_value; g.retail += r.retail_value;
            m.set(k, g);
        }
        return [...m.values()].filter(g => g.units > 0).sort((a, b) => b.value - a.value);
    };

    const byLocation = new Map();
    for (const r of active) for (const [wh, qty] of Object.entries(r.stock)) byLocation.set(wh, (byLocation.get(wh) || 0) + qty);
    const sales = entries.filter(e => isSale(e.name));
    const rowBy = new Map(rows.map(r => [r.sku, r]));

    res.json({
        days,
        kpis: {
            skus: active.length,
            in_stock_skus: active.filter(r => r.on_hand > 0).length,
            units: sum(active, r => r.on_hand),
            stock_value: sum(active, r => r.stock_value),
            retail_value: sum(active, r => r.retail_value),
            low_stock: active.filter(r => r.status === 'low').length,
            out_of_stock: active.filter(r => r.status === 'out').length,
            sales_value: Math.round(sum(sales, e => Number(e.esme_sale_value) || 0)),
            units_sold: sum([...soldBySku.values()], q => q),
            units_received: sum([...byDay.values()], d => d.in),
        },
        flow: [...byDay.values()],
        by_category: groupSum(active, r => r.category),
        by_collection: groupSum(active, r => r.collection).slice(0, 8),
        by_location: [...byLocation.entries()].map(([name, units]) => ({ name, units })).sort((a, b) => b.units - a.units),
        attention: active.filter(r => r.status !== 'in').sort((a, b) => a.on_hand - b.on_hand).slice(0, 8),
        top_sellers: [...soldBySku.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([sku, units]) => ({ sku, units, name: rowBy.get(sku)?.name || sku, image: rowBy.get(sku)?.image || null, on_hand: rowBy.get(sku)?.on_hand ?? 0 })),
        recent: entries.slice(0, 8).map(e => ({
            name: e.name, date: e.posting_date, time: String(e.posting_time).slice(0, 5), purpose: e.purpose, reason: e.esme_reason || null,
            reference: e.esme_reference || null, by: e.owner, value: Number(e.esme_sale_value) || Number(e.total_incoming_value || e.total_outgoing_value) || 0,
        })),
    });
}));

module.exports = router;
