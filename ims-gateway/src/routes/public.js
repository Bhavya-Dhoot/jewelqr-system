'use strict';
// Unauthenticated item view for customers scanning a label. Uses the service account and
// returns only what is already public on the storefront: no cost, no stock counts, no locations.
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { client } = require('../erp');
const { wrap, HttpError } = require('../http');

const router = express.Router();
router.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));

router.get('/items/:sku', wrap(async (req, res) => {
    const sku = String(req.params.sku).toUpperCase().slice(0, 40);
    if (!/^[A-Z0-9-]+$/.test(sku)) throw new HttpError(404, 'Item not found');
    const erp = client();
    let item;
    try { item = await erp.get('Item', sku); } catch (e) { if (e.status === 404) throw new HttpError(404, 'Item not found'); throw e; }
    if (item.disabled) throw new HttpError(404, 'Item not found');
    const [prices, bins] = await Promise.all([
        erp.list('Item Price', { fields: ['price_list_rate'], filters: [['item_code', '=', sku], ['price_list', '=', config.erp.sellingPriceList]], limit: 1 }),
        erp.list('Bin', { fields: ['actual_qty'], filters: [['item_code', '=', sku], ['actual_qty', '>', 0]], limit: 1 }),
    ]);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
        sku: item.name,
        name: item.item_name,
        category: item.item_group,
        collection: item.esme_collection || null,
        finish: item.esme_finish || null,
        crystal_colour: item.esme_crystal_colour || null,
        description: item.description ? item.description.replace(/<[^>]+>/g, '').trim() : '',
        image: item.image || null,
        mrp: prices[0] ? Number(prices[0].price_list_rate) : null,
        available: bins.length > 0,
    });
}));

module.exports = router;
