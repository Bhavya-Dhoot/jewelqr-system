'use strict';
// End-to-end check against a running gateway + ERPNext (dev data). Creates a test item,
// moves stock through every movement type and asserts the balances ERPNext reports.
//   GATEWAY=http://localhost:3000 IMS_USER=staff@esmecrystal.local IMS_PASSWORD=... node scripts/smoke.js
const assert = require('node:assert');
const BASE = process.env.GATEWAY || 'http://localhost:3000';
let cookie = '';
async function api(method, path, body) {
    const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body && JSON.stringify(body) });
    const set = res.headers.getSetCookie().find(c => c.startsWith('esme_sid='));
    if (set) cookie = set.split(';')[0];
    const json = res.status === 204 ? null : await res.json();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error}`);
    return json;
}
(async () => {
    const { user } = await api('POST', '/api/auth/login', { email: process.env.IMS_USER || 'manager@esmecrystal.local', password: process.env.IMS_PASSWORD || 'Manager@Demo2026' });
    console.log('login ok:', user.email, user.roles.join(','));
    const meta = await api('GET', '/api/meta');
    const stores = meta.locations.find(l => l.is_default).name;
    const studio = meta.locations.find(l => l.label === 'Studio').name;

    const { sku } = await api('POST', '/api/items', { name: 'Smoke Test Hoops', category: 'Earrings', finish: 'Gold Plated', mrp: 2500, cost: 800, reorder_level: 2, opening: { qty: 10 } });
    console.log('created', sku);
    await api('POST', '/api/stock/movements', { type: 'receipt', reason: 'Purchase', to: stores, lines: [{ sku, qty: 5, rate: 900 }], reference: 'PO-SMOKE' });
    await api('POST', '/api/stock/movements', { type: 'transfer', reason: 'Transfer', from: stores, to: studio, lines: [{ sku, qty: 3 }] });
    const sale = await api('POST', '/api/stock/movements', { type: 'issue', reason: 'Sale - Store', from: stores, lines: [{ sku, qty: 2 }], sale_value: 5000 });
    await assert.rejects(api('POST', '/api/stock/movements', { type: 'issue', reason: 'Damaged', from: studio, lines: [{ sku, qty: 99 }] }), /stock|qty|quantity|available/i, 'negative stock must be refused');
    const count = await api('POST', '/api/stock/counts', { warehouse: studio, lines: [{ sku, counted: 2 }] });
    assert.strictEqual(count.adjustments[0].diff, -1);

    let d = await api('GET', `/api/items/${sku}`);
    const at = wh => d.stock.find(s => s.warehouse === wh)?.qty || 0;
    assert.strictEqual(at(stores), 10);   // 10 + 5 - 3 - 2
    assert.strictEqual(at(studio), 2);    // 3 counted down to 2
    assert.strictEqual(d.item.on_hand, 12);
    assert.strictEqual(d.price.total, 2500);
    console.log('balances ok: stores 10, studio 2; moving-average cost', d.item.cost);

    await api('POST', `/api/stock/movements/${sale.name}/cancel`);
    d = await api('GET', `/api/items/${sku}`);
    assert.strictEqual(d.item.on_hand, 14, 'cancelled sale returns stock');

    const list = await api('GET', `/api/items?q=${sku}`);
    assert.strictEqual(list.items[0].sku, sku);
    const dash = await api('GET', '/api/dashboard?days=30');
    assert.ok(dash.kpis.units > 0 && dash.flow.length === 30);
    const pub = await api('GET', `/api/public/items/${sku}`);
    assert.strictEqual(pub.price.total, 2500); assert.strictEqual(pub.cost, undefined);
    const metal = await api('GET', '/api/public/items/PND-00001').catch(() => null);
    if (metal) console.log('metal-rate demo price', metal.price.total, metal.price.lines.map(l => `${l.label}=${l.value}`).join(' | '));

    await api('DELETE', `/api/items/${sku}`);
    console.log('archived', sku, '\nSMOKE PASS');
})().catch(err => { console.error('SMOKE FAIL:', err.message); process.exit(1); });
