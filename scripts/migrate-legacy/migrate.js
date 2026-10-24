#!/usr/bin/env node
'use strict';
// One-off migration: JewelQR v1.x (MongoDB) -> ERPNext IMS.
// Copies categories, stone types and rates, every item (as a "Metal Rate" piece with its gold and
// diamonds), item photos, and books opening stock (legacy pieces are one-of-a-kind: 1 each).
//
//   cd scripts/migrate-legacy && npm install
//   MONGO_URI=mongodb://user:pass@host:27017/jewelqr?authSource=admin \
//   ERP_URL=http://localhost:8085 ERP_ADMIN_PASSWORD=... \
//   node migrate.js --uploads ../../legacy-uploads [--opening-qty 1] [--warehouse "Stores - EC"] [--dry-run]
//
// Idempotent: items that already exist in ERPNext are skipped, so it can be re-run after a failure.
// Legacy photos: `git archive legacy-jewelqr-v1.7.1 jewelry-qr-backend/uploads | tar -x` or the server's uploads dir.

const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const DRY = process.argv.includes('--dry-run');
const ERP_URL = (process.env.ERP_URL || 'http://localhost:8085').replace(/\/$/, '');
const ABBR = process.env.ERP_COMPANY_ABBR || 'EC';
const COMPANY = process.env.ERP_COMPANY || 'Esme Crystal';
const UPLOADS = arg('uploads');
const OPENING_QTY = Number(arg('opening-qty', 1));
const WAREHOUSE = arg('warehouse', `Stores - ${ABBR}`);
const PURITIES = new Set(['24K', '22K', '18K', '14K']);

let sid;
async function req(method, p, body, isForm) {
    const res = await fetch(ERP_URL + p, {
        method,
        headers: { Accept: 'application/json', ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(sid ? { Cookie: `sid=${sid}` } : {}) },
        body: isForm ? body : body && JSON.stringify(body),
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = {}; }
    if (!res.ok) {
        let msg = json.exception || text.slice(0, 200);
        try { msg = JSON.parse(json._server_messages).map(m => JSON.parse(m).message).join(' '); } catch { /* keep */ }
        const e = new Error(`${method} ${p}: ${String(msg).replace(/<[^>]+>/g, '')}`); e.status = res.status; throw e;
    }
    return { json, res };
}
const enc = encodeURIComponent;
const get = async (dt, n) => { try { return (await req('GET', `/api/resource/${enc(dt)}/${enc(n)}`)).json.data; } catch (e) { if (e.status === 404) return null; throw e; } };
const list = async (dt, filters, fields = ['name']) => (await req('GET', `/api/resource/${enc(dt)}?fields=${enc(JSON.stringify(fields))}&filters=${enc(JSON.stringify(filters))}&limit_page_length=0`)).json.data;
const insert = async doc => (DRY ? doc : (await req('POST', `/api/resource/${enc(doc.doctype)}`, doc)).json.data);
const update = async (dt, n, patch) => (DRY ? patch : (await req('PUT', `/api/resource/${enc(dt)}/${enc(n)}`, patch)).json.data);

(async () => {
    if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI');
    const { res } = await req('POST', '/api/method/login', { usr: 'Administrator', pwd: process.env.ERP_ADMIN_PASSWORD || 'admin' });
    sid = res.headers.getSetCookie().map(c => /^sid=([^;]*)/.exec(c)?.[1]).find(Boolean);

    const mongo = await MongoClient.connect(process.env.MONGO_URI);
    const db = mongo.db();
    const settings = (await db.collection('settings').findOne({ _id: 'global_settings' })) || {};
    const items = await db.collection('items').find({}).toArray();
    console.log(`${DRY ? '[dry run] ' : ''}${items.length} legacy items`);

    // Rates
    const rates = settings.rates || {};
    const latest = (await list('Esme Gold Rate', [], ['rate_24k', 'rate_date'])).sort((a, b) => (a.rate_date < b.rate_date ? 1 : -1))[0];
    if (rates.goldRate && Number(latest?.rate_24k) !== rates.goldRate) await insert({ doctype: 'Esme Gold Rate', rate_date: new Date().toISOString().slice(0, 10), rate_24k: rates.goldRate, note: 'Migrated from JewelQR' });
    await update('Esme Settings', 'Esme Settings', { ...(rates.labourRate != null ? { labour_rate_per_g: rates.labourRate } : {}), ...(rates.taxPercent != null ? { tax_percent: rates.taxPercent } : {}) });

    // Stone types (diamonds keep natural / lab-grown rates; polki and stone are natural only)
    const aliases = settings.diamondTypeAliases || { marquise: 'mq', markish: 'mq' };
    const norm = t => { const k = String(t || 'round').toLowerCase().trim(); return aliases[k] || k; };
    const stoneDefs = { ...(settings.diamondPricing || {}) };
    for (const [k, v] of Object.entries(settings.polkiPricing || {})) stoneDefs[k] = { label: v.name || k, realRate: v.realRate, cvdRate: v.realRate };
    for (const it of items) for (const d of [...(it.diamonds || []), ...(it.polkiStones || [])]) if (!stoneDefs[norm(d.type_id)]) stoneDefs[norm(d.type_id)] = { label: d.type_name || d.type_id };
    for (const [code, v] of Object.entries(stoneDefs)) {
        if (await get('Esme Stone Type', code)) continue;
        await insert({ doctype: 'Esme Stone Type', stone_code: code, label: v.label || code, natural_rate: v.realRate || 0, lab_rate: v.cvdRate || 0, is_active: v.isActive === false ? 0 : 1 });
        console.log('· stone type', code);
    }

    // Categories: match on SKU prefix first (EAR, NCK...), else create
    const groups = await list('Item Group', [['parent_item_group', '=', 'Jewellery']], ['name', 'esme_sku_prefix']);
    const byPrefix = new Map(groups.map(g => [g.esme_sku_prefix, g.name]));
    async function groupFor(cat) {
        const prefix = cat?.prefix || 'OTH';
        if (byPrefix.has(prefix)) return byPrefix.get(prefix);
        const name = (cat?.name || 'Others').replace(/^DEL-/, '');
        if (!groups.find(g => g.name === name)) await insert({ doctype: 'Item Group', item_group_name: name, parent_item_group: 'Jewellery', is_group: 0, esme_sku_prefix: prefix });
        byPrefix.set(prefix, name);
        return name;
    }

    const report = { created: 0, skipped: 0, photos: 0, failed: [] };
    const opening = [];
    for (const it of items) {
        const sku = String(it.sku).toUpperCase();
        try {
            if (await get('Item', sku)) { report.skipped++; continue; }
            const purity = PURITIES.has(it.gold?.purity) ? it.gold.purity : '18K';
            const stones = [
                ...(it.diamonds || []).map(d => ({ stone_type: norm(d.type_id), source: d.source === 'cvd' ? 'Lab-grown' : 'Natural', weight_ct: d.weight_ct })),
                ...(it.polkiStones || []).map(p => ({ stone_type: norm(p.type_id), source: 'Natural', weight_ct: p.weight_ct })),
            ].filter(s => s.weight_ct > 0).slice(0, 6);
            await insert({
                doctype: 'Item', item_code: sku, item_name: (it.name || sku).slice(0, 140), item_group: await groupFor(it.category),
                stock_uom: 'Nos', is_stock_item: 1, valuation_method: 'Moving Average', disabled: it.deletedAt ? 1 : 0,
                esme_pricing_mode: 'Metal Rate', esme_metal_purity: purity, esme_metal_weight_g: it.gold?.weight_g || 0, esme_stones: stones,
                barcodes: [{ barcode: sku }],
            });
            report.created++;
            if (!it.deletedAt && OPENING_QTY > 0) opening.push(sku);

            const photo = UPLOADS && it.images?.primary && path.join(UPLOADS, it.images.primary.replace(/^\/?uploads\//, ''));
            if (photo && fs.existsSync(photo) && !DRY) {
                const form = new FormData();
                form.append('file', new Blob([fs.readFileSync(photo)], { type: 'image/webp' }), `${sku}-legacy.webp`);
                form.append('is_private', '0'); form.append('doctype', 'Item'); form.append('docname', sku); form.append('fieldname', 'image');
                const file = (await req('POST', '/api/method/upload_file', form, true)).json.message;
                await update('Item', sku, { image: file.file_url });
                report.photos++;
            }
        } catch (err) {
            report.failed.push(`${sku}: ${err.message}`);
        }
    }

    if (opening.length) {
        // Legacy items carried no cost, so the opening entry allows zero valuation; set costs later in the IMS.
        await insert({
            doctype: 'Stock Entry', stock_entry_type: 'Material Receipt', purpose: 'Material Receipt', company: COMPANY, docstatus: 1,
            esme_reason: 'Opening Stock', esme_reference: 'jewelqr-migration',
            items: opening.map(sku => ({ item_code: sku, qty: OPENING_QTY, t_warehouse: WAREHOUSE, allow_zero_valuation_rate: 1 })),
        });
    }
    await mongo.close();
    console.log(`${DRY ? '[dry run] ' : ''}created ${report.created}, skipped ${report.skipped} (already in ERPNext), photos ${report.photos}, opening stock ${opening.length} x ${OPENING_QTY} into ${WAREHOUSE}`);
    if (report.failed.length) { console.log('failed:\n  ' + report.failed.join('\n  ')); process.exitCode = 1; }
})().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
