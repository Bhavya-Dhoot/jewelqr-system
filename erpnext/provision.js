#!/usr/bin/env node
'use strict';
// Idempotent ERPNext provisioning for the Esme Crystal IMS.
// Creates the company (setup wizard), categories, locations, the custom fields and custom DocTypes
// the IMS relies on, and a service user whose API keys the gateway uses.
//
//   ERP_URL=http://localhost:8085 ERP_ADMIN_PASSWORD=admin node erpnext/provision.js [--demo [--demo-images <dir>]]
//
// Safe to re-run: every step checks before it creates. --demo adds a sample catalogue + stock moves.

const ERP_URL = (process.env.ERP_URL || 'http://localhost:8085').replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ERP_ADMIN_PASSWORD || 'admin';
const COMPANY = process.env.ERP_COMPANY || 'Esme Crystal';
const ABBR = process.env.ERP_COMPANY_ABBR || 'EC';
const DEMO = process.argv.includes('--demo');

let sid;
async function req(method, path, body) {
    const res = await fetch(ERP_URL + path, {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(sid ? { Cookie: `sid=${sid}` } : {}) },
        body: body && JSON.stringify(body),
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
    if (!res.ok) {
        let msg = json.exception || json.raw || text.slice(0, 300);
        try { msg = JSON.parse(json._server_messages).map(m => JSON.parse(m).message).join(' ') || msg; } catch { /* keep */ }
        const err = new Error(`${method} ${path} -> ${res.status}: ${String(msg).replace(/<[^>]+>/g, '')}`);
        err.status = res.status; err.excType = json.exc_type;
        throw err;
    }
    return { json, res };
}
const enc = encodeURIComponent;
const call = async (method, args) => (await req('POST', `/api/method/${method}`, args)).json.message;
const get = async (dt, name) => { try { return (await req('GET', `/api/resource/${enc(dt)}/${enc(name)}`)).json.data; } catch (e) { if (e.status === 404) return null; throw e; } };
const list = async (dt, filters, fields = ['name'], limit = 500) => (await req('GET', `/api/resource/${enc(dt)}?fields=${enc(JSON.stringify(fields))}&filters=${enc(JSON.stringify(filters || []))}&limit_page_length=${limit}`)).json.data;
const insert = async doc => (await req('POST', `/api/resource/${enc(doc.doctype)}`, doc)).json.data;
const update = async (dt, name, patch) => (await req('PUT', `/api/resource/${enc(dt)}/${enc(name)}`, patch)).json.data;

async function upsert(doc, name = doc.name) {
    const existing = await get(doc.doctype, name);
    if (!existing) { await insert(doc); return 'created'; }
    return 'exists';
}

const log = (...a) => console.log('·', ...a);

async function login() {
    const { res } = await req('POST', '/api/method/login', { usr: 'Administrator', pwd: ADMIN_PASSWORD });
    sid = res.headers.getSetCookie().map(c => /^sid=([^;]*)/.exec(c)?.[1]).find(Boolean);
    if (!sid) throw new Error('Login did not return a session');
    log('logged in as Administrator');
}

async function setupWizard() {
    const done = (await list('Company', [], ['name'])).length > 0;
    if (done) return log('company exists, setup wizard already complete');
    log('running setup wizard (takes ~1 min)');
    const year = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    await call('frappe.desk.page.setup_wizard.setup_wizard.setup_complete', {
        args: {
            language: 'English', country: 'India', timezone: 'Asia/Kolkata', time_zone: 'Asia/Kolkata', currency: 'INR',
            full_name: 'Esme Admin', company_name: COMPANY, company_abbr: ABBR, chart_of_accounts: 'Standard',
            fy_start_date: `${year}-04-01`, fy_end_date: `${year + 1}-03-31`, setup_demo: 0, enable_telemetry: 0,
        },
    });
    for (let i = 0; i < 60 && !(await list('Company', [], ['name'])).length; i++) await new Promise(r => setTimeout(r, 3000));
    if (!(await list('Company', [], ['name'])).length) throw new Error('Setup wizard did not create the company');
    log('company created:', COMPANY);
}

// ---------- custom DocTypes ----------

const perms = (managerRoles, userRoles = ['Stock User', 'Sales User']) => [
    ...managerRoles.map(role => ({ role, read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1 })),
    ...userRoles.map(role => ({ role, read: 1, report: 1 })),
];

const DOCTYPES = [
    {
        name: 'Esme Collection', autoname: 'field:collection_name', title_field: 'collection_name', sort_field: 'creation',
        fields: [
            { fieldname: 'collection_name', label: 'Collection', fieldtype: 'Data', reqd: 1, unique: 1, in_list_view: 1 },
            { fieldname: 'launch_date', label: 'Launch Date', fieldtype: 'Date', in_list_view: 1 },
            { fieldname: 'is_active', label: 'Active', fieldtype: 'Check', default: '1', in_list_view: 1 },
            { fieldname: 'description', label: 'Description', fieldtype: 'Small Text' },
        ],
        permissions: perms(['Stock Manager', 'Item Manager', 'System Manager']),
    },
    {
        name: 'Esme Settings', issingle: 1,
        fields: [
            { fieldname: 'low_stock_default', label: 'Default Low-stock Level', fieldtype: 'Int', default: '2' },
            { fieldname: 'default_warehouse', label: 'Default Location', fieldtype: 'Link', options: 'Warehouse' },
            { fieldname: 'online_warehouse', label: 'Shopify Location (Warehouse)', fieldtype: 'Link', options: 'Warehouse' },
            { fieldname: 'shopify_location_id', label: 'Shopify Location ID', fieldtype: 'Data' },
            { fieldname: 'shopify_orders_synced_until', label: 'Shopify Orders Synced Until', fieldtype: 'Datetime', read_only: 1 },
            { fieldname: 'shopify_last_sync_log', label: 'Last Sync Log', fieldtype: 'Small Text', read_only: 1 },
        ],
        permissions: perms(['Stock Manager', 'System Manager']),
        track_changes: 1,
    },
];

async function ensureDocTypes() {
    for (const dt of DOCTYPES) {
        const existing = await get('DocType', dt.name);
        const doc = { doctype: 'DocType', module: 'Stock', custom: 1, engine: 'InnoDB', ...dt };
        if (!existing) { await insert(doc); log('doctype created:', dt.name); continue; }
        // Add any fields introduced since the last run, keep everything else.
        const have = new Set(existing.fields.map(f => f.fieldname));
        const missing = dt.fields.filter(f => !have.has(f.fieldname));
        if (missing.length) {
            await update('DocType', dt.name, { fields: [...existing.fields, ...missing] });
            log('doctype updated:', dt.name, missing.map(f => f.fieldname).join(', '));
        }
    }
}

// ---------- custom fields on standard DocTypes ----------

const CUSTOM_FIELDS = [
    // Item: jewellery attributes
    { dt: 'Item', fieldname: 'esme_section', label: 'Jewellery', fieldtype: 'Section Break', insert_after: 'description', collapsible: 0 },
    { dt: 'Item', fieldname: 'esme_collection', label: 'Collection', fieldtype: 'Link', options: 'Esme Collection', insert_after: 'esme_section', in_standard_filter: 1 },
    { dt: 'Item', fieldname: 'esme_finish', label: 'Finish', fieldtype: 'Select', options: '\nGold Plated\nRose Gold Plated\nSilver Plated\nGunmetal\nTwo-tone', insert_after: 'esme_collection', in_standard_filter: 1 },
    { dt: 'Item', fieldname: 'esme_crystal_colour', label: 'Crystal Colour', fieldtype: 'Data', insert_after: 'esme_finish' },
    { dt: 'Item', fieldname: 'esme_shopify_section', label: 'Shopify', fieldtype: 'Section Break', insert_after: 'esme_crystal_colour', collapsible: 1 },
    { dt: 'Item', fieldname: 'esme_shopify_variant_id', label: 'Shopify Variant ID', fieldtype: 'Data', insert_after: 'esme_shopify_section', read_only: 1 },
    { dt: 'Item', fieldname: 'esme_shopify_inventory_item_id', label: 'Shopify Inventory Item ID', fieldtype: 'Data', insert_after: 'esme_shopify_variant_id', read_only: 1 },
    // Item Group = category. Prefix drives auto SKUs (EAR-00001).
    { dt: 'Item Group', fieldname: 'esme_sku_prefix', label: 'SKU Prefix', fieldtype: 'Data', insert_after: 'item_group_name', length: 4 },
    // Stock Entry: why stock moved, and the business reference (invoice, Shopify order...)
    { dt: 'Stock Entry', fieldname: 'esme_reason', label: 'Reason', fieldtype: 'Select', options: '\nPurchase\nProduction\nOpening Stock\nCustomer Return\nSale - Store\nSale - Online\nSample / Gift\nDamaged\nLost\nReturn to Supplier\nTransfer', insert_after: 'stock_entry_type', in_standard_filter: 1 },
    { dt: 'Stock Entry', fieldname: 'esme_reference', label: 'Reference', fieldtype: 'Data', insert_after: 'esme_reason', in_standard_filter: 1 },
    { dt: 'Stock Entry', fieldname: 'esme_party', label: 'Supplier / Customer', fieldtype: 'Data', insert_after: 'esme_reference' },
    { dt: 'Stock Entry', fieldname: 'esme_sale_value', label: 'Sale Value', fieldtype: 'Currency', insert_after: 'esme_party' },
    // Stock Reconciliation has no remarks field; counts keep their note here.
    { dt: 'Stock Reconciliation', fieldname: 'esme_notes', label: 'Notes', fieldtype: 'Small Text', insert_after: 'set_warehouse' },
];

async function ensureCustomFields() {
    for (const f of CUSTOM_FIELDS) {
        const name = `${f.dt}-${f.fieldname}`;
        if (await get('Custom Field', name)) continue;
        await insert({ doctype: 'Custom Field', ...f });
        log('custom field:', name);
    }
}

// ---------- masters ----------

// Esme Crystal's categories (esmecrystal.com navigation). The prefix gives each new piece its SKU.
const CATEGORIES = [
    ['Earrings', 'EAR'], ['Ear Cuffs', 'ECF'], ['Necklaces', 'NCK'], ['Pendants', 'PND'], ['Rings', 'RNG'],
    ['Bracelets', 'BRC'], ['Brooches', 'BRH'], ['Bag Charms', 'BCH'], ['Watch Charms', 'WCH'], ['Lapel Pins', 'LPN'],
    ['Cufflinks', 'CFL'], ['Button Covers', 'BTC'], ['Jewellery Sets', 'SET'], ["Men's Jewellery", 'MEN'], ['Accessories', 'ACC'],
];
const COLLECTIONS = ['Tyohaar Edit', 'Origin', 'Prism 3.0', 'Un-Titled', 'The Daily Edit', 'Eye-Conic', 'A Summer Song', 'Rhythm',
    'Minimus', "Darlin'", 'Elements', 'Unshaped', 'La Fleur', 'Like Wildflowers', 'Limited Edition'];
const LOCATIONS = ['Online Store', 'Studio', 'Exhibition', 'Damaged'];


async function ensureMasters() {
    const root = 'Jewellery';
    await upsert({ doctype: 'Item Group', name: root, item_group_name: root, parent_item_group: 'All Item Groups', is_group: 1 }, root);
    for (const [name, prefix] of CATEGORIES) {
        if (await upsert({ doctype: 'Item Group', item_group_name: name, parent_item_group: root, is_group: 0, esme_sku_prefix: prefix }, name) === 'created') log('category:', name, prefix);
    }

    const parent = `All Warehouses - ${ABBR}`;
    for (const loc of LOCATIONS) {
        if (await upsert({ doctype: 'Warehouse', warehouse_name: loc, parent_warehouse: parent, company: COMPANY, is_group: 0 }, `${loc} - ${ABBR}`) === 'created') log('location:', loc);
    }
    // Manufacturing warehouses ERPNext creates by default are noise for a jewellery brand: hide them.
    for (const unused of ['Work In Progress', 'Finished Goods', 'Goods In Transit']) {
        const wh = await get('Warehouse', `${unused} - ${ABBR}`);
        if (wh && !wh.disabled) {
            try { await update('Warehouse', wh.name, { disabled: 1 }); log('hidden location:', unused); }
            catch (e) { log(`note: kept ${unused} (${e.message.slice(0, 80)})`); }
        }
    }

    for (const c of COLLECTIONS) if (await upsert({ doctype: 'Esme Collection', collection_name: c, is_active: 1 }, c) === 'created') log('collection:', c);

    const settings = await get('Esme Settings', 'Esme Settings');
    const patch = {};
    if (!settings?.default_warehouse) patch.default_warehouse = `Stores - ${ABBR}`;
    if (!settings?.online_warehouse) patch.online_warehouse = `Online Store - ${ABBR}`;
    if (!settings?.low_stock_default) patch.low_stock_default = 2;
    if (Object.keys(patch).length) await update('Esme Settings', 'Esme Settings', patch);

    await update('Stock Settings', 'Stock Settings', {
        item_naming_by: 'Item Code', valuation_method: 'Moving Average', allow_negative_stock: 0,
        default_warehouse: `Stores - ${ABBR}`, stock_uom: 'Nos', show_barcode_field: 1,
    });
    // ERPNext v16 takes the valuation method from the Company first, then Stock Settings.
    const company = await get('Company', COMPANY);
    if (company.valuation_method !== undefined && company.valuation_method !== 'Moving Average') {
        try { await update('Company', COMPANY, { valuation_method: 'Moving Average' }); }
        catch (e) { log('note: company valuation method stays', company.valuation_method, '(stock already posted); IMS sets Moving Average per item'); }
    }
    log('stock settings: moving average valuation, negative stock blocked');
}

// ---------- users ----------
// IMS staff:   Stock User + Item Manager + Sales Master Manager  (items, prices, stock moves)
// IMS manager: the above + Stock Manager                          (stock counts, rates, settings, Shopify)
const STAFF_ROLES = ['Stock User', 'Item Manager', 'Sales Master Manager'];
const MANAGER_ROLES = [...STAFF_ROLES, 'Stock Manager'];
const SERVICE_ROLES = MANAGER_ROLES;

async function ensureRoles(user, roles) {
    const have = new Set((user.roles || []).map(r => r.role));
    const missing = roles.filter(r => !have.has(r));
    if (!missing.length) return;
    await update('User', user.name, { roles: [...(user.roles || []).map(r => ({ role: r.role })), ...missing.map(role => ({ role }))] });
    log('roles added to', user.name + ':', missing.join(', '));
}

async function ensureServiceUser() {
    const email = 'ims-service@esmecrystal.local';
    let user = await get('User', email);
    if (!user) {
        user = await insert({
            doctype: 'User', email, first_name: 'IMS Service', user_type: 'System User', send_welcome_email: 0, enabled: 1,
            roles: SERVICE_ROLES.map(role => ({ role })),
        });
        log('service user created:', email);
    } else await ensureRoles(user, SERVICE_ROLES);
    if (user.api_key && !process.argv.includes('--rotate-keys')) {
        return log('service user already has API keys (re-run with --rotate-keys to issue new ones)');
    }
    const keys = await call('frappe.core.doctype.user.user.generate_keys', { user: email });
    const fresh = await get('User', email);
    console.log('\n  Put these in ims-gateway/.env:\n');
    console.log(`  ERP_API_KEY=${fresh.api_key}`);
    console.log(`  ERP_API_SECRET=${keys.api_secret}\n`);
}

// ---------- demo data (sample catalogue, clearly fictional) ----------
// --demo seeds a sample catalogue and 30 days of history (receipts, store and online sales, transfers,
// a write-off, a count) so the dashboard has something to show. Deterministic: same data every run.

const DEMO_ITEMS = [
    // Real Esme Crystal designs and MRPs (esmecrystal.com); costs and quantities are sample values.
    // sku, name, category, collection, finish, crystal colour, cost, mrp, reorder level, opening qty
    ['EAR-00001', 'Sage Drop Earrings', 'Earrings', 'Prism 3.0', 'Gold Plated', 'Green', 1050, 2999, 4, 18],
    ['EAR-00002', 'The Colette Earrings', 'Earrings', 'The Daily Edit', 'Gold Plated', 'Clear', 1400, 4080, 3, 14],
    ['EAR-00003', 'Evil Eye Dangler', 'Earrings', 'Rhythm', 'Gold Plated', 'Blue', 1600, 4700, 3, 10],
    ['ECF-00001', 'Cadenza Magnetic Earcuffs', 'Ear Cuffs', 'Origin', 'Gold Plated', 'Pearl', 950, 2800, 3, 12],
    ['NCK-00001', 'Ciela Mesh Necklace', 'Necklaces', 'Origin', 'Gold Plated', 'Clear', 1050, 3100, 3, 12],
    ['PND-00001', 'Tova Pendant', 'Pendants', 'Prism 3.0', 'Gold Plated', 'Green', 1200, 3600, 3, 15],
    ['RNG-00001', 'Elio Rings', 'Rings', 'Prism 3.0', 'Gold Plated', 'Pink', 1150, 3400, 3, 16],
    ['RNG-00002', 'Lunelle Drop Stack', 'Rings', 'The Daily Edit', 'Gold Plated', 'Clear', 2100, 6000, 2, 6],
    ['BRC-00001', 'Oryn Bracelet', 'Bracelets', 'Prism 3.0', 'Gold Plated', 'Multicolour', 1250, 3700, 2, 8],
    ['BRH-00001', 'Masquerade Mask Brooch', 'Brooches', 'The Daily Edit', 'Gold Plated', '', 1000, 3000, 2, 7],
];

function rng(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
const dayIso = offset => new Date(Date.now() + offset * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });

// Product photos are not in the repo: pass --demo-images <dir> with <SKU>.jpg files to attach them.
const IMAGES_ARG = process.argv.indexOf('--demo-images');
const DEMO_IMAGES = IMAGES_ARG > 0 ? process.argv[IMAGES_ARG + 1] : process.env.ERP_DEMO_IMAGES;

async function uploadImage(sku) {
    const fs = require('node:fs'), path = require('node:path');
    const file = DEMO_IMAGES && path.join(DEMO_IMAGES, `${sku}.jpg`);
    if (!file || !fs.existsSync(file)) return;
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), `${sku}.jpg`);
    for (const [k, v] of Object.entries({ is_private: '0', doctype: 'Item', docname: sku, fieldname: 'image' })) form.append(k, v);
    const res = await fetch(`${ERP_URL}/api/method/upload_file`, { method: 'POST', headers: { Cookie: `sid=${sid}`, Accept: 'application/json' }, body: form });
    const url = (await res.json()).message?.file_url;
    if (url) await update('Item', sku, { image: url });
}

async function demo() {
    for (const [email, first, roles, pwd] of [
        ['staff@esmecrystal.local', 'Demo Staff', STAFF_ROLES, process.env.ERP_DEMO_STAFF_PASSWORD || 'Staff@Demo2026'],
        ['manager@esmecrystal.local', 'Demo Manager', MANAGER_ROLES, process.env.ERP_DEMO_MANAGER_PASSWORD || 'Manager@Demo2026'],
    ]) {
        const u = await get('User', email);
        if (u) { await ensureRoles(u, roles); continue; }
        await insert({ doctype: 'User', email, first_name: first, user_type: 'System User', send_welcome_email: 0, new_password: pwd, roles: roles.map(role => ({ role })) });
        log('demo user:', email);
    }
    if (await get('Item', 'EAR-00001')) return log('demo catalogue already present');

    const stores = `Stores - ${ABBR}`, online = `Online Store - ${ABBR}`;
    for (const [code, name, group, collection, finish, colour, cost, mrp, reorder] of DEMO_ITEMS) {
        await insert({
            doctype: 'Item', item_code: code, item_name: name, item_group: group, stock_uom: 'Nos', is_stock_item: 1, valuation_method: 'Moving Average',
            valuation_rate: cost, esme_collection: collection, esme_finish: finish, esme_crystal_colour: colour,
            description: `${collection} collection, ${finish.toLowerCase()}${colour ? ` with ${colour.toLowerCase()} crystals` : ''}. Sample data.`,
            barcodes: [{ barcode: code }],
            reorder_levels: [{ warehouse: stores, warehouse_reorder_level: reorder, warehouse_reorder_qty: reorder * 4, material_request_type: 'Purchase' }],
        });
        await insert({ doctype: 'Item Price', item_code: code, price_list: 'Standard Selling', price_list_rate: mrp });
        await uploadImage(code);
    }

    // 30 days of history, posted in date order so ERPNext never has to repost.
    const rand = rng(7), bal = {}, add = (wh, sku, q) => { bal[wh] ??= {}; bal[wh][sku] = (bal[wh][sku] || 0) + q; };
    const mrpOf = Object.fromEntries(DEMO_ITEMS.map(r => [r[0], r[7]])), costOf = Object.fromEntries(DEMO_ITEMS.map(r => [r[0], r[6]]));
    const entry = (day, time, doc) => insert({ doctype: 'Stock Entry', company: COMPANY, docstatus: 1, posting_date: dayIso(day), posting_time: time, set_posting_time: 1, ...doc });
    const receipt = async (day, reason, ref, party, lines) => {
        await entry(day, '10:05:00', { stock_entry_type: 'Material Receipt', purpose: 'Material Receipt', esme_reason: reason, esme_reference: ref, esme_party: party, items: lines.map(([sku, qty, rate]) => ({ item_code: sku, qty, t_warehouse: stores, basic_rate: rate })) });
        lines.forEach(([sku, qty]) => add(stores, sku, qty));
    };
    const transfer = async (day, lines) => {
        await entry(day, '11:30:00', { stock_entry_type: 'Material Transfer', purpose: 'Material Transfer', esme_reason: 'Transfer', esme_reference: `ALLOC-${dayIso(day)}`, items: lines.map(([sku, qty]) => ({ item_code: sku, qty, s_warehouse: stores, t_warehouse: online })) });
        lines.forEach(([sku, qty]) => { add(stores, sku, -qty); add(online, sku, qty); });
    };

    await receipt(-30, 'Opening Stock', 'OPENING-2026', '', DEMO_ITEMS.map(r => [r[0], r[9], r[6]]));
    await transfer(-29, [['EAR-00001', 4], ['EAR-00002', 4], ['NCK-00001', 3], ['RNG-00001', 4], ['PND-00001', 3], ['ECF-00001', 3]]);
    let bill = 1040, order = 2210;
    for (let day = -28; day <= 0; day++) {
        if (day === -18) await receipt(day, 'Purchase', 'PO-0412', 'Jaipur workshop', [['EAR-00001', 10, 1080], ['RNG-00001', 8, 1180], ['PND-00001', 6, 1230]]);
        if (day === -14) await transfer(day, [['EAR-00001', 4], ['EAR-00003', 3], ['BRC-00001', 2], ['RNG-00002', 2]]);
        if (day === -7) {
            await entry(day, '17:20:00', { stock_entry_type: 'Material Issue', purpose: 'Material Issue', esme_reason: 'Damaged', esme_reference: 'QC-0021', items: [{ item_code: 'BRH-00001', qty: 1, s_warehouse: stores }] });
            add(stores, 'BRH-00001', -1);
        }
        // Store sales (busier at weekends), then online orders.
        const weekend = [0, 6].includes(new Date(Date.now() + day * 86400000).getDay());
        for (const [wh, reason, n] of [[stores, 'Sale - Store', Math.floor(rand() * (weekend ? 4 : 2.6))], [online, 'Sale - Online', Math.floor(rand() * 2.4)]]) {
            for (let k = 0; k < n; k++) {
                const pool = Object.entries(bal[wh] || {}).filter(([, q]) => q > 0);
                if (!pool.length) break;
                const [sku] = pool[Math.floor(rand() * pool.length)];
                const qty = rand() < 0.15 && bal[wh][sku] > 1 ? 2 : 1;
                const online_ = reason === 'Sale - Online';
                await entry(day, `${12 + k}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00`, {
                    stock_entry_type: 'Material Issue', purpose: 'Material Issue', esme_reason: reason,
                    esme_reference: online_ ? `shopify:#${order++}` : `BILL-${bill++}`, esme_party: online_ ? 'Shopify' : '',
                    esme_sale_value: mrpOf[sku] * qty, items: [{ item_code: sku, qty, s_warehouse: wh }],
                });
                add(wh, sku, -qty);
            }
        }
        if (day === -3) {
            const counted = Math.max(0, (bal[stores]['ECF-00001'] || 0) - 1);
            await insert({
                doctype: 'Stock Reconciliation', company: COMPANY, purpose: 'Stock Reconciliation', docstatus: 1, posting_date: dayIso(day), posting_time: '18:00:00',
                set_posting_time: 1, esme_notes: 'Monthly shelf count', items: [{ item_code: 'ECF-00001', warehouse: stores, qty: counted, valuation_rate: costOf['ECF-00001'] }],
            });
            bal[stores]['ECF-00001'] = counted;
        }
    }
    log('demo catalogue + 30 days of sample history created');
}

(async () => {
    console.log(`Provisioning ${ERP_URL}`);
    await login();
    await setupWizard();
    await ensureDocTypes();
    await ensureCustomFields();
    await ensureMasters();
    await ensureServiceUser();
    if (DEMO) await demo();
    console.log('Done.');
})().catch(err => { console.error('\nProvisioning failed:', err.message); process.exit(1); });
