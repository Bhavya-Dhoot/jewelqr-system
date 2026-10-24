'use strict';
// Lookups and admin masters: categories (Item Group), collections, locations (Warehouse),
// stone types and rates. ERPNext role permissions decide who may write.
const express = require('express');
const Joi = require('joi');
const config = require('../config');
const { loadSettings, loadStoneTypes, loadLocations, ALL } = require('../inventory');
const { validate, wrap } = require('../http');

const router = express.Router();

const FINISHES = ['Gold Plated', 'Rose Gold Plated', 'Silver Plated', 'Rhodium Plated', 'Gunmetal', 'Two-tone', 'Oxidised', 'Solid Gold', 'Sterling Silver'];

async function loadCategories(erp) {
    const rows = await erp.list('Item Group', { fields: ['name', 'esme_sku_prefix', 'is_group'], filters: [['parent_item_group', '=', 'Jewellery']], limit: ALL, orderBy: 'name asc' });
    return rows.filter(r => !r.is_group).map(r => ({ name: r.name, prefix: r.esme_sku_prefix || '' }));
}

router.get('/meta', wrap(async (req, res) => {
    const erp = req.erp;
    const [categories, collections, locations, stoneTypes, settings] = await Promise.all([
        loadCategories(erp),
        erp.list('Esme Collection', { fields: ['name', 'is_active', 'launch_date'], limit: ALL, orderBy: 'creation desc' }),
        loadLocations(erp),
        loadStoneTypes(erp),
        loadSettings(erp),
    ]);
    res.json({
        categories,
        collections: collections.map(c => ({ name: c.name, is_active: Boolean(c.is_active), launch_date: c.launch_date })),
        locations: locations.map(l => ({ ...l, is_default: l.name === settings.default_warehouse, is_online: l.name === settings.online_warehouse })),
        stoneTypes,
        finishes: FINISHES,
        settings,
        shopify: { enabled: config.shopify.enabled, shop: config.shopify.shop },
        publicUrl: config.publicUrl,
    });
}));

router.post('/categories', wrap(async (req, res) => {
    const c = validate(req.body, Joi.object({ name: Joi.string().trim().min(2).max(60).required(), prefix: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{2,4}$/).required() }));
    await req.erp.insert({ doctype: 'Item Group', item_group_name: c.name, parent_item_group: 'Jewellery', is_group: 0, esme_sku_prefix: c.prefix });
    res.status(201).json(c);
}));

router.put('/categories/:name', wrap(async (req, res) => {
    const c = validate(req.body, Joi.object({ prefix: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{2,4}$/).required() }));
    await req.erp.update('Item Group', req.params.name, { esme_sku_prefix: c.prefix });
    res.json({ name: req.params.name, ...c });
}));

const collectionSchema = Joi.object({ name: Joi.string().trim().min(2).max(80), launch_date: Joi.date().iso().raw().allow(null, ''), is_active: Joi.boolean() });

router.post('/collections', wrap(async (req, res) => {
    const c = validate(req.body, collectionSchema.keys({ name: Joi.string().trim().min(2).max(80).required() }));
    await req.erp.insert({ doctype: 'Esme Collection', collection_name: c.name, launch_date: c.launch_date || null, is_active: c.is_active === false ? 0 : 1 });
    res.status(201).json(c);
}));

router.put('/collections/:name', wrap(async (req, res) => {
    const c = validate(req.body, collectionSchema.fork(['name'], s => s.forbidden()));
    await req.erp.update('Esme Collection', req.params.name, {
        ...(c.launch_date !== undefined ? { launch_date: c.launch_date || null } : {}),
        ...(c.is_active !== undefined ? { is_active: c.is_active ? 1 : 0 } : {}),
    });
    res.json({ name: req.params.name });
}));

router.get('/locations', wrap(async (req, res) => {
    const [locations, bins, settings] = await Promise.all([
        loadLocations(req.erp),
        req.erp.list('Bin', { fields: ['warehouse', 'item_code', 'actual_qty', 'stock_value'], filters: [['actual_qty', '!=', 0]], limit: ALL }),
        loadSettings(req.erp),
    ]);
    res.json({
        locations: locations.map(l => {
            const own = bins.filter(b => b.warehouse === l.name);
            return {
                ...l, is_default: l.name === settings.default_warehouse, is_online: l.name === settings.online_warehouse,
                skus: own.filter(b => b.actual_qty > 0).length,
                units: own.reduce((s, b) => s + Number(b.actual_qty), 0),
                value: Math.round(own.reduce((s, b) => s + Number(b.stock_value), 0)),
            };
        }),
    });
}));

router.post('/locations', wrap(async (req, res) => {
    const { label } = validate(req.body, Joi.object({ label: Joi.string().trim().min(2).max(60).required() }));
    const parent = (await req.erp.list('Warehouse', { fields: ['name'], filters: [['is_group', '=', 1], ['company', '=', config.erp.company], ['parent_warehouse', 'in', ['', null]]], limit: 1 }))[0]?.name;
    const wh = await req.erp.insert({ doctype: 'Warehouse', warehouse_name: label, company: config.erp.company, is_group: 0, ...(parent ? { parent_warehouse: parent } : {}) });
    res.status(201).json({ name: wh.name, label });
}));

const ratesSchema = Joi.object({
    gold_rate_24k: Joi.number().positive().max(1e6),
    labour_rate_per_g: Joi.number().min(0).max(1e6),
    tax_percent: Joi.number().min(0).max(50),
    low_stock_default: Joi.number().integer().min(0).max(10000),
    default_warehouse: Joi.string().max(140),
    online_warehouse: Joi.string().max(140),
}).min(1);

router.put('/rates', wrap(async (req, res) => {
    const r = validate(req.body, ratesSchema);
    const { gold_rate_24k, ...settings } = r;
    if (gold_rate_24k) {
        // One rate per day: a second save today corrects today's rate instead of adding a row.
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
        const existing = await req.erp.list('Esme Gold Rate', { fields: ['name'], filters: [['rate_date', '=', today]], limit: 1 });
        if (existing.length) await req.erp.update('Esme Gold Rate', existing[0].name, { rate_24k: gold_rate_24k });
        else await req.erp.insert({ doctype: 'Esme Gold Rate', rate_date: today, rate_24k: gold_rate_24k });
    }
    if (Object.keys(settings).length) await req.erp.update('Esme Settings', 'Esme Settings', settings);
    res.json(await loadSettings(req.erp));
}));

router.get('/rates/history', wrap(async (req, res) => {
    const rows = await req.erp.list('Esme Gold Rate', { fields: ['rate_date', 'rate_24k', 'owner'], orderBy: 'rate_date desc, creation desc', limit: 180 });
    res.json({ history: rows.reverse().map(r => ({ date: r.rate_date, rate: Number(r.rate_24k), by: r.owner })) });
}));

const stoneSchema = Joi.object({
    code: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]{1,30}$/),
    label: Joi.string().trim().min(1).max(60),
    natural_rate: Joi.number().min(0).max(1e8),
    lab_rate: Joi.number().min(0).max(1e8),
    is_active: Joi.boolean(),
});

router.post('/stone-types', wrap(async (req, res) => {
    const s = validate(req.body, stoneSchema.fork(['code', 'label'], x => x.required()));
    await req.erp.insert({ doctype: 'Esme Stone Type', stone_code: s.code, label: s.label, natural_rate: s.natural_rate || 0, lab_rate: s.lab_rate || 0, is_active: s.is_active === false ? 0 : 1 });
    res.status(201).json(s);
}));

router.put('/stone-types/:code', wrap(async (req, res) => {
    const s = validate(req.body, stoneSchema.fork(['code'], x => x.forbidden()).min(1));
    await req.erp.update('Esme Stone Type', req.params.code, { ...s, ...(s.is_active !== undefined ? { is_active: s.is_active ? 1 : 0 } : {}) });
    res.json({ code: req.params.code });
}));

module.exports = router;
