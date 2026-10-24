// Shapes returned by the IMS gateway (ims-gateway/src/routes/*).

export type StockStatus = 'in' | 'low' | 'out'
export type PricingMode = 'Fixed MRP' | 'Metal Rate'
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

export interface StoneType {
  code: string
  label: string
  natural_rate: number
  lab_rate: number
  is_active: boolean
}

export interface Settings {
  default_warehouse: string
  online_warehouse: string
  labour_rate_per_g: number
  tax_percent: number
  low_stock_default: number
  shopify_location_id: string
  shopify_orders_synced_until: string | null
  shopify_last_sync_log: string
  gold_rate_24k: number
  gold_rate_date: string | null
}

export interface Meta {
  categories: { name: string; prefix: string }[]
  collections: { name: string; is_active: boolean; launch_date: string | null }[]
  locations: Location[]
  stoneTypes: StoneType[]
  finishes: string[]
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
  pricing_mode: PricingMode
  mrp: number | null
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

export interface StoneLine {
  stone_type: string
  source: 'Natural' | 'Lab-grown'
  weight_ct: number
}

export interface PriceLine {
  label: string
  detail?: string
  value: number
}

export interface Price {
  mode: PricingMode
  lines: PriceLine[]
  subtotal: number
  tax: number
  tax_percent?: number
  total: number
  missing_stone_rates?: string[]
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
    pricing_mode: PricingMode
    mrp: number | null
    cost: number
    metal_purity: string | null
    metal_weight_g: number
    stones: StoneLine[]
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
  price: Price
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
  pricing_mode?: PricingMode
  mrp?: number | null
  cost?: number | null
  metal_purity?: string | null
  metal_weight_g?: number | null
  stones?: StoneLine[]
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
  gold_rate: { date: string; rate: number }[]
  settings: { gold_rate_24k: number; gold_rate_date: string | null }
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
  pricing_mode: PricingMode
  metal_purity: string | null
  metal_weight_g: number | null
  stones: { label: string; source: string; weight_ct: number }[]
  price: { total: number; lines: { label: string; value: number }[]; tax: number; tax_percent: number | null }
  available: boolean
}
