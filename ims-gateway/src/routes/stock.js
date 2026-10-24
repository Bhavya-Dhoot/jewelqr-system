'use strict';
const express = require('express');
const Joi = require('joi');
const { postMovement, postCount } = require('../movements');
const { validate, wrap } = require('../http');

const router = express.Router();

const REASONS = {
    receipt: ['Purchase', 'Production', 'Opening Stock', 'Customer Return'],
    issue: ['Sale - Store', 'Sale - Online', 'Sample / Gift', 'Damaged', 'Lost', 'Return to Supplier'],
    transfer: ['Transfer'],
};

const sku = Joi.string().trim().uppercase().max(140).required();

const movementSchema = Joi.object({
    type: Joi.string().valid('receipt', 'issue', 'transfer').required(),
    reason: Joi.string().max(60).required(),
    from: Joi.string().max(140).allow(null, ''),
    to: Joi.string().max(140).allow(null, ''),
    reference: Joi.string().trim().max(140).allow(null, ''),
    party: Joi.string().trim().max(140).allow(null, ''),
    sale_value: Joi.number().min(0).max(1e9).allow(null),
    notes: Joi.string().trim().max(1000).allow(null, ''),
    posting_date: Joi.date().iso().max('now').raw().allow(null, ''),
    lines: Joi.array().min(1).max(500).items(Joi.object({
        sku,
        qty: Joi.number().integer().min(1).max(100000).required(),
        rate: Joi.number().min(0).max(1e8).allow(null),
    })).required(),
}).custom((v, h) => (REASONS[v.type].includes(v.reason) ? v : h.message(`Reason must be one of: ${REASONS[v.type].join(', ')}`)));

router.get('/reasons', (req, res) => res.json(REASONS));

router.post('/movements', wrap(async (req, res) => {
    const m = validate(req.body, movementSchema);
    const entry = await postMovement(req.erp, m);
    res.status(201).json({ name: entry.name });
}));

const listSchema = Joi.object({
    type: Joi.string().valid('receipt', 'issue', 'transfer', '').allow(''),
    reason: Joi.string().max(60).allow(''),
    q: Joi.string().trim().max(100).allow(''),
    from: Joi.date().iso().raw().allow(''),
    to: Joi.date().iso().raw().allow(''),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(200).default(30),
});
const PURPOSE_TYPE = { 'Material Receipt': 'receipt', 'Material Issue': 'issue', 'Material Transfer': 'transfer' };

router.get('/movements', wrap(async (req, res) => {
    const f = validate(req.query, listSchema);
    const filters = [['purpose', 'in', Object.keys(PURPOSE_TYPE)], ['docstatus', '!=', 0]];
    if (f.type) filters.push(['purpose', '=', Object.keys(PURPOSE_TYPE).find(k => PURPOSE_TYPE[k] === f.type)]);
    if (f.reason) filters.push(['esme_reason', '=', f.reason]);
    if (f.from) filters.push(['posting_date', '>=', f.from]);
    if (f.to) filters.push(['posting_date', '<=', f.to]);
    const orFilters = f.q ? [['name', 'like', `%${f.q}%`], ['esme_reference', 'like', `%${f.q}%`], ['esme_party', 'like', `%${f.q}%`]] : undefined;

    const [entries, total] = await Promise.all([
        req.erp.list('Stock Entry', {
            fields: ['name', 'posting_date', 'posting_time', 'purpose', 'esme_reason', 'esme_reference', 'esme_party', 'esme_sale_value', 'total_incoming_value', 'total_outgoing_value', 'owner', 'docstatus', 'remarks'],
            filters, orFilters, orderBy: 'posting_date desc, posting_time desc, creation desc', limit: f.pageSize, start: (f.page - 1) * f.pageSize,
        }),
        f.q ? Promise.resolve(null) : req.erp.count('Stock Entry', filters),
    ]);
    const lines = entries.length
        ? await req.erp.request('GET', `/api/resource/Stock%20Entry%20Detail?${new URLSearchParams({
            fields: JSON.stringify(['parent', 'item_code', 'item_name', 'qty', 's_warehouse', 't_warehouse', 'basic_rate']),
            filters: JSON.stringify([['parent', 'in', entries.map(e => e.name)]]), parent: 'Stock Entry', limit_page_length: '0',
        })}`).then(r => r.data)
        : [];
    res.json({
        total: total ?? entries.length,
        movements: entries.map(e => {
            const own = lines.filter(l => l.parent === e.name);
            return {
                name: e.name, date: e.posting_date, time: String(e.posting_time).slice(0, 5), type: PURPOSE_TYPE[e.purpose],
                reason: e.esme_reason || null, reference: e.esme_reference || null, party: e.esme_party || null,
                sale_value: Number(e.esme_sale_value) || 0, value: Number(e.total_incoming_value || e.total_outgoing_value) || 0,
                by: e.owner, cancelled: e.docstatus === 2, notes: e.remarks || '',
                units: own.reduce((s, l) => s + Number(l.qty), 0),
                lines: own.map(l => ({ sku: l.item_code, name: l.item_name, qty: Number(l.qty), from: l.s_warehouse || null, to: l.t_warehouse || null })),
            };
        }),
    });
}));

// Mistakes are reversed by cancelling (ERPNext writes reversing ledger entries; nothing is deleted).
router.post('/movements/:name/cancel', wrap(async (req, res) => {
    await req.erp.call('frappe.client.cancel', { doctype: 'Stock Entry', name: req.params.name });
    res.json({ name: req.params.name, cancelled: true });
}));

const countSchema = Joi.object({
    warehouse: Joi.string().max(140).required(),
    notes: Joi.string().trim().max(1000).allow(null, ''),
    lines: Joi.array().min(1).max(2000).items(Joi.object({ sku, counted: Joi.number().integer().min(0).max(100000).required() })).required(),
});

router.post('/counts', wrap(async (req, res) => {
    const input = validate(req.body, countSchema);
    res.status(201).json(await postCount(req.erp, input));
}));

router.get('/counts', wrap(async (req, res) => {
    const rows = await req.erp.list('Stock Reconciliation', {
        fields: ['name', 'posting_date', 'owner', 'docstatus', 'difference_amount', 'esme_notes'],
        filters: [['docstatus', '=', 1], ['purpose', '=', 'Stock Reconciliation']], orderBy: 'posting_date desc, creation desc', limit: 20,
    });
    res.json({ counts: rows.map(r => ({ name: r.name, date: r.posting_date, by: r.owner, difference_value: Math.round(Number(r.difference_amount) || 0), notes: r.esme_notes || '' })) });
}));

module.exports = router;
