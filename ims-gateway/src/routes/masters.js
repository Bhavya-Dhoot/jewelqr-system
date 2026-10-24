'use strict';
// Lookups and admin masters: categories (Item Group), collections, locations (Warehouse) and
// IMS settings. ERPNext role permissions decide who may write.
const express = require('express');
const Joi = require('joi');
const config = require('../config');
const { loadSettings, loadLocations, ALL } = require('../inventory');
const { validate, wrap } = require('../http');

const router = express.Router();

// Esme Crystal's finishes and crystal colours (as on esmecrystal.com). Colours are suggestions; any text is allowed.
const FINISHES = ['Gold Plated', 'Rose Gold Plated', 'Silver Plated', 'Gunmetal', 'Two-tone'];
const COLOURS = ['Clear', 'Pink', 'Barbie Pink', 'Blue', 'Green', 'Emerald Green', 'Lilac', 'Purple', 'Red', 'Black', 'Multicolour'];

async function loadCategories(erp) {
    const rows = await erp.list('Item Group', { fields: ['name', 'esme_sku_prefix', 'is_group'], filters: [['parent_item_group', '=', 'Jewellery']], limit: ALL, orderBy: 'name asc' });
    return rows.filter(r => !r.is_group).map(r => ({ name: r.name, prefix: r.esme_sku_prefix || '' }));
}

router.get('/meta', wrap(async (req, res) => {
    const erp = req.erp;
    const [categories, collections, locations, settings] = await Promise.all([
        loadCategories(erp),
        erp.list('Esme Collection', { fields: ['name', 'is_active', 'launch_date'], limit: ALL, orderBy: 'creation desc' }),
        loadLocations(erp),
        loadSettings(erp),
    ]);
    res.json({
        categories,
        collections: collections.map(c => ({ name: c.name, is_active: Boolean(c.is_active), launch_date: c.launch_date })),
        locations: locations.map(l => ({ ...l, is_default: l.name === settings.default_warehouse, is_online: l.name === settings.online_warehouse })),
        finishes: FINISHES,
        colours: COLOURS,
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

const settingsSchema = Joi.object({
    low_stock_default: Joi.number().integer().min(0).max(10000),
    default_warehouse: Joi.string().max(140),
    online_warehouse: Joi.string().max(140),
}).min(1);

router.put('/settings', wrap(async (req, res) => {
    const patch = validate(req.body, settingsSchema);
    await req.erp.update('Esme Settings', 'Esme Settings', patch);
    res.json(await loadSettings(req.erp));
}));

module.exports = router;
