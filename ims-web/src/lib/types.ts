// Shapes returned by the IMS gateway (ims-gateway/src/routes/*).

export type StockStatus = 'in' | 'low' | 'out'
export type MovementType = 'receipt' | 'issue' | 'transfer'

export interface User {
  email: string
  fullName: string
  roles: string[]
  isManager: boolean
}

export interface Location {
  name: string
  label: string
  is_default?: boolean
  is_online?: boolean
}

export interface LocationSummary extends Location {
  skus: number
  units: number
  value: number
}

export interface Settings {
  default_warehouse: string
  online_warehouse: string
  low_stock_default: number
  shopify_location_id: string
  shopify_orders_synced_until: string | null
  shopify_last_sync_log: string
}

export interface Meta {
  categories: { name: string; prefix: string }[]
  collections: { name: string; is_active: boolean; launch_date: string | null }[]
  locations: Location[]
  finishes: string[]
  /** Crystal colour suggestions; any text is allowed */
  colours: string[]
  settings: Settings
  shopify: { enabled: boolean; shop: string }
  publicUrl: string
}

export interface ItemRow {
  sku: string
  name: string
  category: string
  collection: string | null
  finish: string | null
  crystal_colour: string | null
  image: string | null
  mrp: number | null
  /** Same as mrp (0 when unset); kept so sale totals can be computed without null checks */
  price: number
  cost: number
  on_hand: number
  stock: Record<string, number>
  stock_value: number
  retail_value: number
  reorder_level: number
  status: StockStatus
  disabled: boolean
  shopify_linked: boolean
  created: string
  modified: string
}

export interface ItemList {
  items: ItemRow[]
  total: number
  page: number
  pageSize: number
}

export interface ItemDetail {
  item: {
    sku: string
    name: string
    category: string
    collection: string | null
    finish: string | null
    crystal_colour: string | null
    description: string
    image: string | null
    mrp: number | null
    cost: number
    /** (mrp - cost) / mrp in percent, null without an MRP */
    margin: number | null
    status: StockStatus
    reorder_level: number | null
    reorder_qty: number | null
    disabled: boolean
    shopify_variant_id: string | null
    created: string
    modified: string
    modified_by: string
    on_hand: number
    stock_value: number
  }
  stock: { warehouse: string; qty: number; value: number }[]
  qr_url: string
  movements: {
    date: string
    time: string
    warehouse: string
    qty: number
    balance: number
    voucher_type: string
    voucher_no: string
    by: string
    reason: string
    reference: string | null
  }[]
}

export interface ItemInput {
  sku?: string
  name?: string
  category?: string
  collection?: string | null
  finish?: string | null
  crystal_colour?: string | null
  description?: string | null
  mrp?: number | null
  cost?: number | null
  reorder_level?: number | null
  reorder_qty?: number | null
  disabled?: boolean
  opening?: { warehouse?: string; qty: number }
}

export interface MovementInput {
  type: MovementType
  reason: string
  from?: string | null
  to?: string | null
  reference?: string | null
  party?: string | null
  sale_value?: number | null
  notes?: string | null
  posting_date?: string | null
  lines: { sku: string; qty: number; rate?: number | null }[]
}

export interface Movement {
  name: string
  date: string
  time: string
  type: MovementType
  reason: string | null
  reference: string | null
  party: string | null
  sale_value: number
  value: number
  by: string
  cancelled: boolean
  notes: string
  units: number
  lines: { sku: string; name: string; qty: number; from: string | null; to: string | null }[]
}

export interface Dashboard {
  days: number
  kpis: {
    skus: number
    in_stock_skus: number
    units: number
    stock_value: number
    retail_value: number
    low_stock: number
    out_of_stock: number
    sales_value: number
    units_sold: number
    units_received: number
  }
  flow: { date: string; in: number; out: number; sold: number }[]
  by_category: { name: string; skus: number; units: number; value: number; retail: number }[]
  by_collection: { name: string; skus: number; units: number; value: number; retail: number }[]
  by_location: { name: string; units: number }[]
  attention: ItemRow[]
  top_sellers: { sku: string; name: string; units: number; image: string | null; on_hand: number }[]
  recent: { name: string; date: string; time: string; purpose: string; reason: string | null; reference: string | null; by: string; value: number }[]
}

export interface CountResult {
  name: string | null
  adjustments: { sku: string; system: number; counted: number; diff: number }[]
}

export interface ShopifyStatus {
  enabled: boolean
  shop: string | null
  api_version: string
  auto_sync_minutes: number
  location_id: string | null
  warehouse: string | null
  synced_until: string | null
  last_log: string
  linked_items: number
  total_items: number
}

export interface DriftRow {
  sku: string
  name: string
  inventory_item_id: string
  ims: number
  shopify: number | null
  diff: number | null
}

export interface PublicItem {
  sku: string
  name: string
  category: string
  collection: string | null
  finish: string | null
  crystal_colour: string | null
  description: string
  image: string | null
  mrp: number | null
  available: boolean
}
