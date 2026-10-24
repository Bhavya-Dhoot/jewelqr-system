// In-browser stand-in for the IMS gateway and ERPNext, used only by the demo build (VITE_DEMO=1).
// Same routes and response shapes as ims-gateway/src/routes, with ERPNext's stock rules kept:
// moving-average cost per location, no negative stock, cancel to reverse, counts post only differences.
// State lives in this browser's localStorage; nothing leaves the device.
// ponytail: cancelling an older entry does not repost later ledger balances (ERPNext would); fine for a demo.

const KEY = 'esme-ims-demo-v1'
const COMPANY_SUFFIX = ' - EC'
const STORES = `Stores${COMPANY_SUFFIX}`, ONLINE = `Online Store${COMPANY_SUFFIX}`
const ADMIN = 'Administrator'

const USERS: Record<string, { password: string; fullName: string; manager: boolean }> = {
  'manager@esmecrystal.local': { password: 'Manager@Demo2026', fullName: 'Demo Manager', manager: true },
  'staff@esmecrystal.local': { password: 'Staff@Demo2026', fullName: 'Demo Staff', manager: false },
}
const CATEGORIES = [
  ['Earrings', 'EAR'], ['Ear Cuffs', 'ECF'], ['Necklaces', 'NCK'], ['Pendants', 'PND'], ['Rings', 'RNG'],
  ['Bracelets', 'BRC'], ['Brooches', 'BRH'], ['Bag Charms', 'BCH'], ['Watch Charms', 'WCH'], ['Lapel Pins', 'LPN'],
  ['Cufflinks', 'CFL'], ['Button Covers', 'BTC'], ['Jewellery Sets', 'SET'], ["Men's Jewellery", 'MEN'], ['Accessories', 'ACC'],
]
const COLLECTIONS = ['Tyohaar Edit', 'Origin', 'Prism 3.0', 'Un-Titled', 'The Daily Edit', 'Eye-Conic', 'A Summer Song', 'Rhythm',
  'Minimus', "Darlin'", 'Elements', 'Unshaped', 'La Fleur', 'Like Wildflowers', 'Limited Edition']
const FINISHES = ['Gold Plated', 'Rose Gold Plated', 'Silver Plated', 'Gunmetal', 'Two-tone']
const COLOURS = ['Clear', 'Pink', 'Barbie Pink', 'Blue', 'Green', 'Emerald Green', 'Lilac', 'Purple', 'Red', 'Black', 'Multicolour']
const REASONS = {
  receipt: ['Purchase', 'Production', 'Opening Stock', 'Customer Return'],
  issue: ['Sale - Store', 'Sale - Online', 'Sample / Gift', 'Damaged', 'Lost', 'Return to Supplier'],
  transfer: ['Transfer'],
}
const PRICE_BANDS: Record<string, [number, number]> = { under5k: [0, 5000], '5to10k': [5000, 10000], over10k: [10000, Infinity] }
const PURPOSE = { receipt: 'Material Receipt', issue: 'Material Issue', transfer: 'Material Transfer' } as const
type MType = keyof typeof PURPOSE
const TYPE_OF: Record<string, MType> = { 'Material Receipt': 'receipt', 'Material Issue': 'issue', 'Material Transfer': 'transfer' }

// Real Esme Crystal designs and MRPs (esmecrystal.com); costs and quantities are sample values.
// Photos load from Esme's own Shopify CDN. sku, name, category, collection, finish, colour, cost, mrp, reorder, opening qty, photo
const CDN = 'https://cdn.shopify.com/s/files/1/0502/3049/3337/'
const DEMO_ITEMS: [string, string, string, string, string, string, number, number, number, number, string][] = [
  ['EAR-00001', 'Sage Drop Earrings', 'Earrings', 'Prism 3.0', 'Gold Plated', 'Green', 1050, 2999, 4, 18, 'files/Image_20260923_160601.jpg?v=1790159833'],
  ['EAR-00002', 'The Colette Earrings', 'Earrings', 'The Daily Edit', 'Gold Plated', 'Clear', 1400, 4080, 3, 14, 'files/30_3312b938-ce62-41fd-8140-3151154625ae.jpg?v=1782753198'],
  ['EAR-00003', 'Evil Eye Dangler', 'Earrings', 'Rhythm', 'Gold Plated', 'Blue', 1600, 4700, 3, 10, 'products/ESME-EMT-ER-20-C5_c28c7d96-cd71-4207-af8e-e56ff9222b8f.jpg?v=1660168275'],
  ['ECF-00001', 'Cadenza Magnetic Earcuffs', 'Ear Cuffs', 'Origin', 'Gold Plated', 'Pearl', 950, 2800, 3, 12, 'files/4_33b00a7f-7981-4dd5-8413-bd47cd54ec1f.jpg?v=1792314815'],
  ['NCK-00001', 'Ciela Mesh Necklace', 'Necklaces', 'Origin', 'Gold Plated', 'Clear', 1050, 3100, 3, 12, 'files/Image_20261008_160750.jpg?v=1791456202'],
  ['PND-00001', 'Tova Pendant', 'Pendants', 'Prism 3.0', 'Gold Plated', 'Green', 1200, 3600, 3, 15, 'files/Image_20261018_023918.jpg?v=1792306870'],
  ['RNG-00001', 'Elio Rings', 'Rings', 'Prism 3.0', 'Gold Plated', 'Pink', 1150, 3400, 3, 16, 'files/Image_20261018_014305.jpg?v=1792307227'],
  ['RNG-00002', 'Lunelle Drop Stack', 'Rings', 'The Daily Edit', 'Gold Plated', 'Clear', 2100, 6000, 2, 6, 'files/4_02ba950a-bb01-40c6-bfec-e62bb21ec166.jpg?v=1777387477'],
  ['BRC-00001', 'Oryn Bracelet', 'Bracelets', 'Prism 3.0', 'Gold Plated', 'Multicolour', 1250, 3700, 2, 8, 'files/Image_20261018_012709.jpg?v=1792305673'],
  ['BRH-00001', 'Masquerade Mask Brooch', 'Brooches', 'The Daily Edit', 'Gold Plated', '', 1000, 3000, 2, 7, 'files/Image_20261008_170758.jpg?v=1791459497'],
]

interface Item {
  sku: string; name: string; category: string; collection: string | null; finish: string | null; crystal_colour: string | null
  description: string; image: string | null; mrp: number | null; cost: number; reorder_level: number | null; reorder_qty: number | null
  disabled: boolean; created: string; modified: string; modified_by: string
}
interface Line { sku: string; qty: number; from: string | null; to: string | null; rate: number }
interface Entry {
  name: string; date: string; time: string; seq: number; purpose: string; reason: string; reference: string; party: string
  sale_value: number; notes: string; by: string; cancelled: boolean; lines: Line[]; value: number
}
interface Sle { seq: number; date: string; time: string; sku: string; warehouse: string; qty: number; after: number; voucher_type: string; voucher_no: string; by: string; cancelled: boolean }
interface Recon { name: string; date: string; time: string; seq: number; by: string; notes: string; difference_value: number }
interface State {
  v: 1; day: string; dirty: boolean; user: string | null; seq: number; ste: number; reco: number
  items: Item[]; bins: Record<string, { qty: number; value: number }>; entries: Entry[]; sles: Sle[]; recons: Recon[]
  categories: { name: string; prefix: string }[]; collections: { name: string; is_active: boolean; launch_date: string | null }[]
  locations: { name: string; label: string }[]
  settings: { default_warehouse: string; online_warehouse: string; low_stock_default: number; shopify_location_id: string; shopify_orders_synced_until: string | null; shopify_last_sync_log: string }
}

class DemoError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
const fail = (status: number, message: string): never => { throw new DemoError(status, message) }

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const today = () => new Date().toLocaleDateString('sv-SE')
const dayIso = (offset: number) => new Date(Date.now() + offset * 86400000).toLocaleDateString('sv-SE')
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
const stamp = () => `${today()} ${nowTime()}`
const round = (n: number) => Math.round(n)

let S: State

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)) } catch { /* private mode or full: the demo still works for this visit */ }
}

// ---------- the stock rules ----------

const binKey = (sku: string, wh: string) => `${sku}|${wh}`
const bin = (sku: string, wh: string) => (S.bins[binKey(sku, wh)] ??= { qty: 0, value: 0 })
const itemOf = (sku: string) => S.items.find(i => i.sku === sku) ?? fail(404, `Item ${sku} not found`)
const rateAt = (sku: string, wh: string) => { const b = bin(sku, wh); return b.qty > 0 ? b.value / b.qty : itemOf(sku).cost }
const label = (wh: string) => S.locations.find(l => l.name === wh)?.label ?? wh

function sle(e: { date: string; time: string; voucher_type: string; voucher_no: string; by: string }, sku: string, wh: string, qty: number) {
  S.sles.push({ seq: ++S.seq, ...e, sku, warehouse: wh, qty, after: bin(sku, wh).qty, cancelled: false })
}

function moveIn(sku: string, wh: string, qty: number, rate: number) {
  const b = bin(sku, wh); b.qty += qty; b.value += qty * rate
}
function moveOut(sku: string, wh: string, qty: number) {
  const b = bin(sku, wh), rate = rateAt(sku, wh)
  b.qty -= qty; b.value = b.qty === 0 ? 0 : b.value - qty * rate
  return rate
}
function needStock(lines: { sku: string; qty: number }[], wh: string) {
  for (const l of lines) {
    const have = bin(l.sku, wh).qty
    if (have < l.qty) fail(417, `Not enough stock: ${l.sku} has ${have} at ${label(wh)}, ${l.qty} needed`)
  }
}

interface MovementIn { type: MType; reason: string; from?: string | null; to?: string | null; reference?: string | null; party?: string | null; sale_value?: number | null; notes?: string | null; posting_date?: string | null; lines: { sku: string; qty: number; rate?: number | null }[] }

function postMovement(m: MovementIn, by: string, time?: string) {
  if (!PURPOSE[m.type]) fail(422, 'Choose receive, sell, move or write off')
  if (!REASONS[m.type].includes(m.reason)) fail(422, `Reason must be one of: ${REASONS[m.type].join(', ')}`)
  if (m.type !== 'issue' && !m.to) fail(422, 'Choose the location stock goes to')
  if (m.type !== 'receipt' && !m.from) fail(422, 'Choose the location stock comes from')
  if (m.type === 'transfer' && m.from === m.to) fail(422, 'From and To must be different locations')
  if (!m.lines?.length) fail(422, 'Add at least one piece')
  const merged = new Map<string, { sku: string; qty: number; rate: number | null }>()
  for (const l of m.lines) {
    const sku = String(l.sku).trim().toUpperCase(), qty = Number(l.qty)
    if (!Number.isInteger(qty) || qty < 1) fail(422, 'Quantities must be whole numbers of at least 1')
    itemOf(sku)
    const prev = merged.get(sku)
    merged.set(sku, { sku, qty: (prev?.qty ?? 0) + qty, rate: l.rate ?? prev?.rate ?? null })
  }
  const lines = [...merged.values()]
  if (m.type !== 'receipt') needStock(lines, m.from!)

  const e: Entry = {
    name: `MAT-STE-${(m.posting_date || today()).slice(0, 4)}-${pad(++S.ste, 5)}`, date: m.posting_date || today(), time: time || nowTime(), seq: ++S.seq,
    purpose: PURPOSE[m.type], reason: m.reason, reference: m.reference || '', party: m.party || '', sale_value: Number(m.sale_value) || 0,
    notes: m.notes || '', by, cancelled: false, lines: [], value: 0,
  }
  const v = { date: e.date, time: e.time, voucher_type: 'Stock Entry', voucher_no: e.name, by }
  for (const l of lines) {
    let rate = l.rate && l.rate > 0 ? l.rate : itemOf(l.sku).cost
    if (m.type !== 'receipt') { rate = moveOut(l.sku, m.from!, l.qty); sle(v, l.sku, m.from!, -l.qty) }
    if (m.type !== 'issue') { moveIn(l.sku, m.to!, l.qty, rate); sle(v, l.sku, m.to!, l.qty) }
    e.lines.push({ sku: l.sku, qty: l.qty, from: m.type !== 'receipt' ? m.from! : null, to: m.type !== 'issue' ? m.to! : null, rate })
    e.value += l.qty * rate
  }
  S.entries.push(e)
  return e
}

function cancelEntry(name: string) {
  const e = S.entries.find(x => x.name === name) ?? fail(404, `${name} not found`)
  if (e.cancelled) fail(409, `${name} is already cancelled`)
  // Undo in reverse: what came in must still be there to take back out.
  for (const l of e.lines) if (l.to && bin(l.sku, l.to).qty < l.qty) fail(417, `Cannot cancel: ${l.sku} has already moved on from ${label(l.to)}`)
  for (const l of e.lines) {
    if (l.to) { const b = bin(l.sku, l.to); b.qty -= l.qty; b.value = b.qty === 0 ? 0 : b.value - l.qty * l.rate }
    if (l.from) moveIn(l.sku, l.from, l.qty, l.rate)
  }
  e.cancelled = true
  for (const r of S.sles) if (r.voucher_no === name) r.cancelled = true
}

function postCount(input: { warehouse: string; notes?: string; lines: { sku: string; counted: number }[] }, by: string, date?: string, time?: string) {
  if (!input.warehouse) fail(422, 'Choose the location you counted')
  const unknown = input.lines.filter(l => !S.items.some(i => i.sku === l.sku)).map(l => l.sku)
  if (unknown.length) fail(422, `Unknown SKU: ${unknown.join(', ')}`)
  const adjustments = input.lines.map(l => {
    const system = bin(l.sku, input.warehouse).qty
    return { sku: l.sku, system, counted: Number(l.counted), diff: Number(l.counted) - system, valuation_rate: rateAt(l.sku, input.warehouse) }
  })
  const changed = adjustments.filter(a => a.diff !== 0)
  if (!changed.length) return { name: null, adjustments }
  const r: Recon = { name: `MAT-RECO-${(date || today()).slice(0, 4)}-${pad(++S.reco, 5)}`, date: date || today(), time: time || nowTime(), seq: ++S.seq, by, notes: input.notes || '', difference_value: 0 }
  for (const a of changed) {
    const b = bin(a.sku, input.warehouse), before = b.value
    b.qty = a.counted; b.value = a.counted * a.valuation_rate
    r.difference_value += b.value - before
    sle({ date: r.date, time: r.time, voucher_type: 'Stock Reconciliation', voucher_no: r.name, by }, a.sku, input.warehouse, a.diff)
  }
  r.difference_value = round(r.difference_value)
  S.recons.push(r)
  return { name: r.name, adjustments }
}

// ---------- seed: the same catalogue and 30 days of history as `provision.js --demo` ----------

function rng(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function seed(): State {
  S = {
    v: 1, day: today(), dirty: false, user: 'manager@esmecrystal.local', seq: 0, ste: 0, reco: 0,
    items: [], bins: {}, entries: [], sles: [], recons: [],
    categories: CATEGORIES.map(([name, prefix]) => ({ name, prefix })),
    collections: COLLECTIONS.map(name => ({ name, is_active: true, launch_date: null })),
    locations: ['Damaged', 'Exhibition', 'Online Store', 'Stores', 'Studio'].map(l => ({ name: `${l}${COMPANY_SUFFIX}`, label: l })),
    settings: { default_warehouse: STORES, online_warehouse: ONLINE, low_stock_default: 2, shopify_location_id: '', shopify_orders_synced_until: null, shopify_last_sync_log: '' },
  }
  DEMO_ITEMS.forEach(([sku, name, category, collection, finish, colour, cost, mrp, reorder, , photo], i) => {
    const created = `${dayIso(-30)} 09:${pad(i)}:00`
    S.items.push({
      sku, name, category, collection, finish, crystal_colour: colour || null, cost, mrp, reorder_level: reorder, reorder_qty: reorder * 4, disabled: false,
      description: `${collection} collection, ${finish.toLowerCase()}${colour ? ` with ${colour.toLowerCase()} crystals` : ''}. Sample data.`,
      image: `${CDN}${photo}&width=800`, created, modified: created, modified_by: ADMIN,
    })
  })
  const rand = rng(7), mrpOf = Object.fromEntries(DEMO_ITEMS.map(r => [r[0], r[7]]))
  const at = (day: number, time: string, m: MovementIn) => postMovement({ ...m, posting_date: dayIso(day) }, ADMIN, time)
  at(-30, '10:05:00', { type: 'receipt', reason: 'Opening Stock', reference: 'OPENING-2026', to: STORES, lines: DEMO_ITEMS.map(r => ({ sku: r[0], qty: r[9], rate: r[6] })) })
  const transfer = (day: number, lines: [string, number][]) => {
    const send = lines.map(([sku, qty]) => ({ sku, qty: Math.min(qty, bin(sku, STORES).qty) })).filter(l => l.qty > 0)
    if (send.length) at(day, '11:30:00', { type: 'transfer', reason: 'Transfer', reference: `ALLOC-${dayIso(day)}`, from: STORES, to: ONLINE, lines: send })
  }
  transfer(-29, [['EAR-00001', 4], ['EAR-00002', 4], ['NCK-00001', 3], ['RNG-00001', 4], ['PND-00001', 3], ['ECF-00001', 3]])
  let bill = 1040, order = 2210
  for (let day = -28; day <= 0; day++) {
    if (day === -18) at(day, '10:05:00', { type: 'receipt', reason: 'Purchase', reference: 'PO-0412', party: 'Jaipur workshop', to: STORES, lines: [{ sku: 'EAR-00001', qty: 10, rate: 1080 }, { sku: 'RNG-00001', qty: 8, rate: 1180 }, { sku: 'PND-00001', qty: 6, rate: 1230 }] })
    if (day === -14) transfer(day, [['EAR-00001', 4], ['EAR-00003', 3], ['BRC-00001', 2], ['RNG-00002', 2]])
    if (day === -7) transfer(day, [['EAR-00002', 3], ['NCK-00001', 2], ['PND-00001', 3], ['RNG-00001', 3], ['ECF-00001', 2], ['EAR-00001', 3]]) // demo only: restock the online store
    if (day === -7) at(day, '17:20:00', { type: 'issue', reason: 'Damaged', reference: 'QC-0021', from: STORES, lines: [{ sku: 'BRH-00001', qty: 1 }] })
    const weekend = [0, 6].includes(new Date(Date.now() + day * 86400000).getDay())
    for (const [wh, reason, n] of [[STORES, 'Sale - Store', Math.floor(rand() * (weekend ? 4 : 2.6))], [ONLINE, 'Sale - Online', Math.floor(rand() * 2.4)]] as const) {
      for (let k = 0; k < n; k++) {
        const pool = S.items.map(i => i.sku).filter(sku => bin(sku, wh).qty > 0)
        if (!pool.length) break
        const sku = pool[Math.floor(rand() * pool.length)]
        const qty = rand() < 0.15 && bin(sku, wh).qty > 1 ? 2 : 1
        const online = reason === 'Sale - Online', time = `${12 + k}:${pad(Math.floor(rand() * 60))}:00`
        if (day === 0 && time > nowTime()) continue // today's history stops at the current time
        at(day, time, {
          type: 'issue', reason, from: wh, reference: online ? `shopify:#${order++}` : `BILL-${bill++}`, party: online ? 'Shopify' : '',
          sale_value: mrpOf[sku] * qty, lines: [{ sku, qty }],
        })
      }
    }
    if (day === -3) postCount({ warehouse: STORES, notes: 'Monthly shelf count', lines: [{ sku: 'ECF-00001', counted: Math.max(0, bin('ECF-00001', STORES).qty - 1) }] }, ADMIN, dayIso(day), '18:00:00')
  }
  return S
}

function load() {
  if (S) return
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null') as State | null
    // Untouched sample data is re-dated each day so the last 30 days stay populated.
    if (saved?.v === 1 && (saved.dirty || saved.day === today())) { S = saved; return }
  } catch { /* unreadable: start fresh */ }
  seed(); save()
}

export function resetDemo() {
  try { localStorage.removeItem(KEY) } catch { /* nothing stored */ }
  location.assign('/')
}

// ---------- read models (as ims-gateway/src/inventory.js) ----------

function catalogue() {
  return S.items.map(it => {
    const own = Object.entries(S.bins).filter(([k]) => k.startsWith(`${it.sku}|`)).map(([k, b]) => ({ wh: k.slice(it.sku.length + 1), ...b }))
    const stock = Object.fromEntries(own.filter(b => b.qty).map(b => [b.wh, b.qty]))
    const onHand = own.reduce((s, b) => s + b.qty, 0), stockValue = own.reduce((s, b) => s + b.value, 0)
    const reorder = it.reorder_level || S.settings.low_stock_default
    return {
      sku: it.sku, name: it.name, category: it.category, collection: it.collection, finish: it.finish, crystal_colour: it.crystal_colour,
      image: it.image, mrp: it.mrp, price: it.mrp ?? 0,
      cost: onHand > 0 ? Math.round((stockValue / onHand) * 100) / 100 : it.cost,
      on_hand: onHand, stock, stock_value: round(stockValue), retail_value: round((it.mrp ?? 0) * onHand), reorder_level: reorder,
      status: (onHand <= 0 ? 'out' : onHand <= reorder ? 'low' : 'in') as 'in' | 'low' | 'out',
      disabled: it.disabled, shopify_linked: false, created: it.created, modified: it.modified,
    }
  })
}
type Row = ReturnType<typeof catalogue>[number]

const entriesNewest = () => [...S.entries].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time) || b.seq - a.seq)

function nextSku(category: string) {
  const prefix = (S.categories.find(c => c.name === category)?.prefix || category.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const max = S.items.map(i => i.sku).filter(c => c.startsWith(`${prefix}-`)).map(c => Number(/-(\d+)$/.exec(c)?.[1])).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0)
  return `${prefix}-${pad(max + 1, 5)}`
}

function me() {
  const u = USERS[S.user ?? ''] ?? fail(401, 'Please sign in')
  const roles = ['Stock User', 'Sales Master Manager', 'Item Manager', ...(u.manager ? ['Stock Manager'] : []), 'All', 'Guest', 'Desk User']
  return { email: S.user!, fullName: u.fullName, roles, isManager: u.manager }
}
const manager = () => { if (!me().isManager) fail(403, 'Only Stock Managers can do this') }

async function shrink(file: File) {
  if (!/^image\//.test(file.type)) fail(415, 'Upload a JPEG, PNG, WebP or HEIC image')
  const img = await createImageBitmap(file)
  const k = Math.min(1, 800 / Math.max(img.width, img.height))
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/webp', 0.82)
}

// ---------- routes ----------

type Body = Record<string, unknown> | unknown[] | FormData | undefined
type In = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

async function route(method: string, path: string, body: Body): Promise<[number, unknown]> {
  const url = new URL(path, 'http://demo'), q = Object.fromEntries(url.searchParams), p = url.pathname
  const b = (body && !(body instanceof FormData) ? body : {}) as In
  let m: RegExpMatchArray | null = null
  const is = (verb: string, re: RegExp) => method === verb && (m = p.match(re)) !== null
  const arg = () => decodeURIComponent((m as RegExpMatchArray)[1])

  if (is('GET', /^\/health$/)) return [200, { ok: true, erpnext: 'demo', shopify: 'off' }]
  if (is('POST', /^\/auth\/login$/)) {
    const email = String(b.email || '').trim().toLowerCase()
    if (USERS[email]?.password !== b.password) fail(401, 'Invalid login credentials')
    S.user = email; save(); return [200, { user: me() }]
  }
  if (is('POST', /^\/auth\/logout$/)) { S.user = null; save(); return [204, undefined] }
  if (is('GET', /^\/public\/items\/([^/]+)$/)) {
    const it = S.items.find(i => i.sku === arg().toUpperCase())
    if (!it || it.disabled) fail(404, 'Item not found')
    const { sku, name, category, collection, finish, crystal_colour, description, image, mrp } = it!
    return [200, { sku, name, category, collection, finish, crystal_colour, description, image, mrp, available: catalogue().find(r => r.sku === sku)!.on_hand > 0 }]
  }

  const user = me() // everything below needs a signed-in user
  if (is('GET', /^\/auth\/me$/)) return [200, { user }]

  if (is('GET', /^\/meta$/)) return [200, {
    categories: [...S.categories].sort((a, c) => a.name.localeCompare(c.name)), collections: [...S.collections].reverse(),
    locations: [...S.locations].sort((a, c) => a.label.localeCompare(c.label)).map(l => ({ ...l, is_default: l.name === S.settings.default_warehouse, is_online: l.name === S.settings.online_warehouse })),
    finishes: FINISHES, colours: COLOURS, settings: S.settings, shopify: { enabled: false, shop: '' }, publicUrl: location.origin,
  }]

  if (is('GET', /^\/items$/)) {
    const page = Math.max(1, Number(q.page) || 1), pageSize = Math.min(500, Number(q.pageSize) || 50), status = q.status || 'active', s = q.q?.toLowerCase()
    const out = catalogue().filter(r =>
      (status === 'all' || (status === 'archived') === r.disabled)
      && (!q.category || r.category === q.category) && (!q.collection || r.collection === q.collection) && (!q.finish || r.finish === q.finish)
      && (!q.location || (r.stock[q.location] || 0) > 0) && (!q.stock || r.status === q.stock)
      && (!q.price || (r.price >= PRICE_BANDS[q.price][0] && r.price < PRICE_BANDS[q.price][1]))
      && (!s || [r.sku, r.name, r.collection, r.crystal_colour, r.category].some(v => v?.toLowerCase().includes(s))))
    const sorters: Record<string, (a: Row, c: Row) => number> = {
      newest: (a, c) => (c.created > a.created ? 1 : -1), name: (a, c) => a.name.localeCompare(c.name), sku: (a, c) => a.sku.localeCompare(c.sku),
      stock: (a, c) => a.on_hand - c.on_hand, value: (a, c) => c.stock_value - a.stock_value,
    }
    out.sort(sorters[q.sort || 'newest'] ?? sorters.newest)
    return [200, { items: out.slice((page - 1) * pageSize, page * pageSize), total: out.length, page, pageSize }]
  }
  if (is('GET', /^\/items\/next-sku$/)) return [200, { sku: nextSku(q.category || '') }]
  if (is('POST', /^\/items$/)) {
    const name = String(b.name || '').trim()
    if (name.length < 2) fail(422, 'Name must be at least 2 characters')
    if (!S.categories.some(c => c.name === b.category)) fail(422, 'Choose a category')
    const own = b.sku ? String(b.sku).trim().toUpperCase() : ''
    if (own && !/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(own)) fail(422, 'SKU may only contain letters, digits and dashes')
    const sku = own || nextSku(b.category)
    if (S.items.some(i => i.sku === sku)) fail(409, `SKU ${sku} already exists`)
    const t = stamp()
    S.items.push({
      sku, name, category: b.category, collection: b.collection || null, finish: b.finish || null, crystal_colour: b.crystal_colour || null,
      description: b.description || '', image: null, mrp: b.mrp ?? null, cost: Number(b.cost) || 0,
      reorder_level: b.reorder_level || null, reorder_qty: b.reorder_level ? b.reorder_qty || b.reorder_level * 2 : null,
      disabled: false, created: t, modified: t, modified_by: user.email,
    })
    if (b.opening?.qty) postMovement({ type: 'receipt', reason: 'Opening Stock', to: b.opening.warehouse || S.settings.default_warehouse, lines: [{ sku, qty: Number(b.opening.qty), rate: Number(b.cost) || 0 }] }, user.email)
    return [201, { sku }]
  }
  if (is('POST', /^\/items\/([^/]+)\/image$/)) {
    const it = itemOf(arg().toUpperCase())
    const file = body instanceof FormData ? body.get('image') : null
    if (!(file instanceof File)) fail(422, 'No image uploaded')
    it.image = await shrink(file as File); it.modified = stamp(); it.modified_by = user.email
    return [200, { image: it.image }]
  }
  if (is('GET', /^\/items\/([^/]+)$/)) {
    const it = itemOf(arg().toUpperCase()), row = catalogue().find(r => r.sku === it.sku)!
    const ledger = S.sles.filter(l => l.sku === it.sku && !l.cancelled).sort((a, c) => (c.date + c.time).localeCompare(a.date + a.time) || c.seq - a.seq).slice(0, 50)
    const entry = (no: string) => S.entries.find(e => e.name === no)
    return [200, {
      item: {
        sku: it.sku, name: it.name, category: it.category, collection: it.collection, finish: it.finish, crystal_colour: it.crystal_colour,
        description: it.description, image: it.image, mrp: it.mrp, cost: row.cost, margin: it.mrp ? Math.round(((it.mrp - row.cost) / it.mrp) * 1000) / 10 : null,
        status: row.on_hand <= 0 ? 'out' : row.on_hand <= (it.reorder_level ?? S.settings.low_stock_default) ? 'low' : 'in',
        reorder_level: it.reorder_level, reorder_qty: it.reorder_qty, disabled: it.disabled, shopify_variant_id: null,
        created: it.created, modified: it.modified, modified_by: it.modified_by, on_hand: row.on_hand, stock_value: row.stock_value,
      },
      stock: Object.entries(S.bins).filter(([k, v]) => k.startsWith(`${it.sku}|`) && v.qty !== 0).map(([k, v]) => ({ warehouse: k.slice(it.sku.length + 1), qty: v.qty, value: round(v.value) })),
      qr_url: `${location.origin}/s/${encodeURIComponent(it.sku)}`,
      movements: ledger.map(l => ({
        date: l.date, time: l.time.slice(0, 5), warehouse: l.warehouse, qty: l.qty, balance: l.after, voucher_type: l.voucher_type, voucher_no: l.voucher_no, by: l.by,
        reason: entry(l.voucher_no)?.reason || (l.voucher_type === 'Stock Reconciliation' ? 'Stock count' : entry(l.voucher_no)?.purpose || l.voucher_type),
        reference: entry(l.voucher_no)?.reference || null,
      })),
    }]
  }
  if (is('PUT', /^\/items\/([^/]+)$/)) {
    const it = itemOf(arg().toUpperCase())
    if (b.name !== undefined) { if (String(b.name).trim().length < 2) fail(422, 'Name must be at least 2 characters'); it.name = String(b.name).trim() }
    for (const k of ['category', 'collection', 'finish', 'crystal_colour', 'description'] as const) if (b[k] !== undefined) (it as unknown as In)[k] = b[k] || (k === 'description' ? '' : null)
    if (b.cost !== undefined) it.cost = Number(b.cost) || 0
    if (b.mrp != null) it.mrp = Number(b.mrp)
    if (b.disabled !== undefined) it.disabled = Boolean(b.disabled)
    if (b.reorder_level !== undefined) { it.reorder_level = b.reorder_level || null; it.reorder_qty = b.reorder_level ? b.reorder_qty || b.reorder_level * 2 : null }
    it.modified = stamp(); it.modified_by = user.email
    return [200, { sku: it.sku }]
  }
  if (is('DELETE', /^\/items\/([^/]+)$/)) { const it = itemOf(arg().toUpperCase()); it.disabled = true; it.modified = stamp(); return [204, undefined] }

  if (is('GET', /^\/stock\/reasons$/)) return [200, REASONS]
  if (is('POST', /^\/stock\/movements$/)) return [201, { name: postMovement(b as MovementIn, user.email).name }]
  if (is('POST', /^\/stock\/movements\/([^/]+)\/cancel$/)) { const name = arg(); cancelEntry(name); return [200, { name, cancelled: true }] }
  if (is('GET', /^\/stock\/movements$/)) {
    const page = Math.max(1, Number(q.page) || 1), pageSize = Math.min(200, Number(q.pageSize) || 30), s = q.q?.toLowerCase()
    const out = entriesNewest().filter(e => (!q.type || TYPE_OF[e.purpose] === q.type) && (!q.reason || e.reason === q.reason)
      && (!q.from || e.date >= q.from) && (!q.to || e.date <= q.to) && (!s || [e.name, e.reference, e.party].some(v => v.toLowerCase().includes(s))))
    return [200, {
      total: out.length,
      movements: out.slice((page - 1) * pageSize, page * pageSize).map(e => ({
        name: e.name, date: e.date, time: e.time.slice(0, 5), type: TYPE_OF[e.purpose], reason: e.reason || null, reference: e.reference || null, party: e.party || null,
        sale_value: e.sale_value, value: round(e.value), by: e.by, cancelled: e.cancelled, notes: e.notes, units: e.lines.reduce((t, l) => t + l.qty, 0),
        lines: e.lines.map(l => ({ sku: l.sku, name: S.items.find(i => i.sku === l.sku)?.name ?? l.sku, qty: l.qty, from: l.from, to: l.to })),
      })),
    }]
  }
  if (is('GET', /^\/stock\/counts$/)) return [200, { counts: [...S.recons].sort((a, c) => c.date.localeCompare(a.date) || c.seq - a.seq).slice(0, 20).map(r => ({ name: r.name, date: r.date, by: r.by, difference_value: r.difference_value, notes: r.notes })) }]
  if (is('POST', /^\/stock\/counts$/)) { manager(); return [201, postCount(b as { warehouse: string; notes?: string; lines: { sku: string; counted: number }[] }, user.email)] }

  if (is('GET', /^\/dashboard$/)) {
    const days = [7, 30, 90, 365].includes(Number(q.days)) ? Number(q.days) : 30
    const since = dayIso(-(days - 1)), rows = catalogue(), active = rows.filter(r => !r.disabled)
    const entries = entriesNewest().filter(e => !e.cancelled && e.date >= since)
    const entryBy = new Map(entries.map(e => [e.name, e]))
    const isSale = (no: string) => /^Sale/.test(entryBy.get(no)?.reason || '')
    const byDay = new Map<string, { date: string; in: number; out: number; sold: number }>()
    for (let d = -(days - 1); d <= 0; d++) byDay.set(dayIso(d), { date: dayIso(d), in: 0, out: 0, sold: 0 })
    const soldBySku = new Map<string, number>()
    for (const l of S.sles) {
      // Transfers net to zero and counts post balances, not movements, so neither is flow.
      if (l.cancelled || l.voucher_type !== 'Stock Entry' || entryBy.get(l.voucher_no)?.purpose === 'Material Transfer') continue
      const day = byDay.get(l.date)
      if (!day) continue
      if (l.qty > 0) day.in += l.qty; else day.out -= l.qty
      if (l.qty < 0 && isSale(l.voucher_no)) { day.sold -= l.qty; soldBySku.set(l.sku, (soldBySku.get(l.sku) || 0) - l.qty) }
    }
    const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((t, x) => t + f(x), 0)
    const groupSum = (key: (r: Row) => string | null) => {
      const g = new Map<string, { name: string; skus: number; units: number; value: number; retail: number }>()
      for (const r of active) {
        const k = key(r) || 'Unassigned', x = g.get(k) || { name: k, skus: 0, units: 0, value: 0, retail: 0 }
        x.skus += r.on_hand > 0 ? 1 : 0; x.units += r.on_hand; x.value += r.stock_value; x.retail += r.retail_value; g.set(k, x)
      }
      return [...g.values()].filter(x => x.units > 0).sort((a, c) => c.value - a.value)
    }
    const byLocation = new Map<string, number>()
    for (const r of active) for (const [wh, n] of Object.entries(r.stock)) byLocation.set(wh, (byLocation.get(wh) || 0) + n)
    const rowBy = new Map(rows.map(r => [r.sku, r]))
    return [200, {
      days,
      kpis: {
        skus: active.length, in_stock_skus: active.filter(r => r.on_hand > 0).length, units: sum(active, r => r.on_hand),
        stock_value: sum(active, r => r.stock_value), retail_value: sum(active, r => r.retail_value),
        low_stock: active.filter(r => r.status === 'low').length, out_of_stock: active.filter(r => r.status === 'out').length,
        sales_value: round(sum(entries.filter(e => isSale(e.name)), e => e.sale_value)), units_sold: sum([...soldBySku.values()], n => n),
        units_received: sum([...byDay.values()], d => d.in),
      },
      flow: [...byDay.values()],
      by_category: groupSum(r => r.category), by_collection: groupSum(r => r.collection).slice(0, 8),
      by_location: [...byLocation.entries()].map(([name, units]) => ({ name, units })).sort((a, c) => c.units - a.units),
      attention: active.filter(r => r.status !== 'in').sort((a, c) => a.on_hand - c.on_hand).slice(0, 8),
      top_sellers: [...soldBySku.entries()].sort((a, c) => c[1] - a[1]).slice(0, 5).map(([sku, units]) => ({ sku, units, name: rowBy.get(sku)?.name || sku, image: rowBy.get(sku)?.image || null, on_hand: rowBy.get(sku)?.on_hand ?? 0 })),
      recent: entries.slice(0, 8).map(e => ({ name: e.name, date: e.date, time: e.time.slice(0, 5), purpose: e.purpose, reason: e.reason || null, reference: e.reference || null, by: e.by, value: e.sale_value || round(e.value) })),
    }]
  }

  if (is('GET', /^\/locations$/)) return [200, {
    locations: [...S.locations].sort((a, c) => a.label.localeCompare(c.label)).map(l => {
      const own = Object.entries(S.bins).filter(([k, v]) => k.endsWith(`|${l.name}`) && v.qty !== 0).map(([, v]) => v)
      return { ...l, is_default: l.name === S.settings.default_warehouse, is_online: l.name === S.settings.online_warehouse, skus: own.filter(v => v.qty > 0).length, units: sum0(own.map(v => v.qty)), value: round(sum0(own.map(v => v.value))) }
    }),
  }]
  if (is('POST', /^\/locations$/)) {
    manager()
    const lbl = String(b.label || '').trim()
    if (lbl.length < 2) fail(422, 'Name the location')
    const name = `${lbl}${COMPANY_SUFFIX}`
    if (S.locations.some(l => l.name === name)) fail(409, `${lbl} already exists`)
    S.locations.push({ name, label: lbl }); return [201, { name, label: lbl }]
  }
  if (is('PUT', /^\/settings$/)) {
    manager()
    if (b.low_stock_default !== undefined) S.settings.low_stock_default = Number(b.low_stock_default) || 0
    if (b.default_warehouse) S.settings.default_warehouse = b.default_warehouse
    if (b.online_warehouse) S.settings.online_warehouse = b.online_warehouse
    return [200, S.settings]
  }
  if (is('POST', /^\/categories$/)) {
    manager()
    const name = String(b.name || '').trim(), prefix = String(b.prefix || '').trim().toUpperCase()
    if (name.length < 2 || !/^[A-Z0-9]{2,4}$/.test(prefix)) fail(422, 'A category needs a name and a 2 to 4 character prefix')
    if (S.categories.some(c => c.name === name)) fail(409, `${name} already exists`)
    S.categories.push({ name, prefix }); return [201, { name, prefix }]
  }
  if (is('PUT', /^\/categories\/(.+)$/)) {
    manager()
    const c = S.categories.find(x => x.name === arg()) ?? fail(404, 'Category not found'), prefix = String(b.prefix || '').trim().toUpperCase()
    if (!/^[A-Z0-9]{2,4}$/.test(prefix)) fail(422, 'Prefix must be 2 to 4 letters or digits')
    c.prefix = prefix; return [200, c]
  }
  if (is('POST', /^\/collections$/)) {
    manager()
    const name = String(b.name || '').trim()
    if (name.length < 2) fail(422, 'Name the collection')
    if (S.collections.some(c => c.name === name)) fail(409, `${name} already exists`)
    S.collections.push({ name, is_active: b.is_active !== false, launch_date: b.launch_date || null }); return [201, { name }]
  }
  if (is('PUT', /^\/collections\/(.+)$/)) {
    manager()
    const c = S.collections.find(x => x.name === arg()) ?? fail(404, 'Collection not found')
    if (b.is_active !== undefined) c.is_active = Boolean(b.is_active)
    if (b.launch_date !== undefined) c.launch_date = b.launch_date || null
    return [200, { name: c.name }]
  }

  if (is('GET', /^\/shopify\/status$/)) return [200, {
    enabled: false, shop: null, api_version: '2026-10', auto_sync_minutes: 0, location_id: null, warehouse: S.settings.online_warehouse,
    synced_until: null, last_log: '', linked_items: 0, total_items: S.items.filter(i => !i.disabled).length,
  }]
  if (p.startsWith('/shopify/')) fail(503, 'Shopify is not connected in this demo')
  return fail(404, 'Not found')
}
const sum0 = (xs: number[]) => xs.reduce((a, c) => a + c, 0)

/** The demo's answer to `fetch('/api' + path)`: a status and a JSON body. */
export async function handle(method: string, path: string, body: Body): Promise<{ status: number; data: unknown }> {
  load()
  await new Promise(r => setTimeout(r, 60 + Math.random() * 90)) // a little latency, so loading states read as they would live
  const before = JSON.stringify([S.items.length, S.seq, S.entries.length])
  try {
    const [status, data] = await route(method, path, body)
    if (method !== 'GET') { if (!path.startsWith('/auth/')) S.dirty = true; save() }
    return { status, data }
  } catch (err) {
    if (err instanceof DemoError) {
      // A failed write must not leave half a change behind.
      if (method !== 'GET' && JSON.stringify([S.items.length, S.seq, S.entries.length]) !== before) { S = undefined as unknown as State; load() }
      return { status: err.status, data: { error: err.message } }
    }
    throw err
  }
}
