'use strict';
const express = require('express');
const Joi = require('joi');
const config = require('../config');
const shopify = require('../shopify');
const { requireManager } = require('../auth');
const { validate, wrap } = require('../http');

const router = express.Router();

router.get('/status', wrap(async (req, res) => {
    const s = await req.erp.getSingle('Esme Settings');
    const [linked, total] = await Promise.all([
        req.erp.count('Item', [['esme_shopify_inventory_item_id', 'is', 'set'], ['disabled', '=', 0]]),
        req.erp.count('Item', [['disabled', '=', 0], ['is_stock_item', '=', 1]]),
    ]);
    res.json({
        enabled: config.shopify.enabled,
        shop: config.shopify.shop || null,
        api_version: config.shopify.apiVersion,
        auto_sync_minutes: config.shopify.syncMinutes,
        location_id: s.shopify_location_id || null,
        warehouse: s.online_warehouse || null,
        synced_until: s.shopify_orders_synced_until || null,
        last_log: s.shopify_last_sync_log || '',
        linked_items: linked,
        total_items: total,
    });
}));

router.get('/locations', requireManager, wrap(async (req, res) => {
    res.json({ locations: await shopify.listLocations() });
}));

router.put('/settings', requireManager, wrap(async (req, res) => {
    const s = validate(req.body, Joi.object({ location_id: Joi.string().max(100).allow(''), warehouse: Joi.string().max(140) }).min(1));
    await req.erp.update('Esme Settings', 'Esme Settings', {
        ...(s.location_id !== undefined ? { shopify_location_id: s.location_id.split('/').pop() } : {}),
        ...(s.warehouse ? { online_warehouse: s.warehouse } : {}),
    });
    res.json({ ok: true });
}));

router.post('/import', requireManager, wrap(async (req, res) => {
    const opts = validate(req.body || {}, Joi.object({ createMissing: Joi.boolean().default(true), importStock: Joi.boolean().default(true) }));
    res.json(await shopify.importCatalogue(req.erp, opts));
}));

router.post('/sync', requireManager, wrap(async (req, res) => {
    res.json(await shopify.syncOrders(req.erp));
}));

router.get('/drift', requireManager, wrap(async (req, res) => {
    const rows = await shopify.drift(req.erp);
    res.json({ rows: rows.sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0)) });
}));

router.post('/push', requireManager, wrap(async (req, res) => {
    const { skus } = validate(req.body || {}, Joi.object({ skus: Joi.array().items(Joi.string().max(140)).max(5000) }));
    const { locationId } = await shopify.syncSettings(req.erp);
    const rows = (await shopify.drift(req.erp)).filter(r => !skus || skus.includes(r.sku));
    res.json({ updated: await shopify.pushAbsolute(rows, locationId) });
}));

module.exports = router;
