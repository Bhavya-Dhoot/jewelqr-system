import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { DownloadIcon, PlusIcon, PrinterIcon, SearchIcon, TableIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { ItemThumb, PageHeader, StockBadge } from '@/components/common'
import { useDebounced } from '@/components/command-search'
import { printLabels } from '@/components/qr-label'
import { StockLevelsEditor } from '@/components/stock-levels-editor'
import { useItems, useMe, useMeta, type ItemFilters } from '@/hooks/api'
import { api, qs } from '@/lib/api'
import { formatINR, formatNumber, locationLabel } from '@/lib/format'
import type { ItemList, ItemRow } from '@/lib/types'

const PAGE_SIZE = 50
const ALL = '__all'

function csvEscape(v: unknown) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function InventoryPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { data: meta } = useMeta()
  const [q, setQ] = useState(params.get('q') ?? '')
  const debouncedQ = useDebounced(q, 250)
  // Selection keeps whole rows so it survives paging and filtering.
  const [selected, setSelected] = useState<Map<string, ItemRow>>(new Map())
  const [editing, setEditing] = useState(false)
  const { data: me } = useMe()

  const filters: ItemFilters = {
    q: debouncedQ,
    category: params.get('category') ?? '',
    collection: params.get('collection') ?? '',
    location: params.get('location') ?? '',
    stock: (params.get('stock') ?? '') as ItemFilters['stock'],
    price: (params.get('price') ?? '') as ItemFilters['price'],
    status: (params.get('status') ?? 'active') as ItemFilters['status'],
    sort: (params.get('sort') ?? 'newest') as ItemFilters['sort'],
    page: Number(params.get('page') ?? 1),
    pageSize: PAGE_SIZE,
  }
  const { data, isLoading, isFetching, isError, error } = useItems(filters)

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && value !== ALL) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  useEffect(() => { if ((params.get('q') ?? '') !== debouncedQ) set('q', debouncedQ) }, [debouncedQ]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = Boolean(filters.q || filters.category || filters.collection || filters.location || filters.stock || filters.price || filters.status !== 'active')
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const rows = data?.items ?? []
  const allOnPage = rows.length > 0 && rows.every(r => selected.has(r.sku))
  const toggle = (r: ItemRow) => setSelected(s => { const n = new Map(s); if (n.has(r.sku)) n.delete(r.sku); else n.set(r.sku, r); return n })

  const selectedRows = useMemo(() => [...selected.values()], [selected])

  async function exportCsv(only?: ItemRow[]) {
    const all = only ? { items: only } : await api.get<ItemList>(`/items${qs({ ...filters, page: 1, pageSize: 500 })}`)
    const locs = meta?.locations.map(l => l.name) ?? []
    const header = ['SKU', 'Name', 'Category', 'Collection', 'Finish', 'Crystal colour', 'MRP', 'Unit cost', 'On hand', ...locs.map(locationLabel), 'Stock value', 'Retail value', 'Status']
    const lines = all.items.map(r => [r.sku, r.name, r.category, r.collection, r.finish, r.crystal_colour, r.mrp, r.cost, r.on_hand, ...locs.map(l => r.stock[l] || 0), r.stock_value, r.retail_value, r.status].map(csvEscape).join(','))
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `esme-inventory-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const labelsFor = (list: ItemRow[]) => list.map(r => ({ sku: r.sku, name: r.name, price: r.price, url: `${meta?.publicUrl ?? location.origin}/s/${r.sku}` }))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        description={data ? `${formatNumber(data.total)} ${filtered ? 'matching' : ''} pieces` : 'Loading…'}
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv()}><DownloadIcon />Export</Button>
            <Button asChild><Link to="/inventory/new"><PlusIcon />New piece</Link></Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput placeholder="Search SKU, name, colour…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search inventory" />
          {q && <InputGroupAddon align="inline-end"><button type="button" onClick={() => setQ('')} aria-label="Clear search"><XIcon className="size-4" /></button></InputGroupAddon>}
        </InputGroup>
        <div className="grid w-full grid-cols-2 gap-2 sm:contents">
          <Select value={filters.category || ALL} onValueChange={v => set('category', v)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Category"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {meta?.categories.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.collection || ALL} onValueChange={v => set('collection', v)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Collection"><SelectValue placeholder="Collection" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All collections</SelectItem>
              {meta?.collections.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.location || ALL} onValueChange={v => set('location', v)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Location"><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All locations</SelectItem>
              {meta?.locations.map(l => <SelectItem key={l.name} value={l.name}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.price || ALL} onValueChange={v => set('price', v)}>
            <SelectTrigger className="w-full sm:w-36" aria-label="Price"><SelectValue placeholder="Price" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All prices</SelectItem>
              <SelectItem value="under5k">Under ₹5k</SelectItem>
              <SelectItem value="5to10k">₹5k to ₹10k</SelectItem>
              <SelectItem value="over10k">Above ₹10k</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.sort} onValueChange={v => set('sort', v === 'newest' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-36" aria-label="Sort"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="sku">SKU</SelectItem>
              <SelectItem value="stock">Lowest stock</SelectItem>
              <SelectItem value="value">Highest value</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ToggleGroup type="single" variant="outline" value={filters.stock || 'all'} onValueChange={v => v && set('stock', v === 'all' ? '' : v)} className="sm:ml-auto" aria-label="Stock level">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="in">In</ToggleGroupItem>
          <ToggleGroupItem value="low">Low</ToggleGroupItem>
          <ToggleGroupItem value="out">Out</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {isError ? (
        <Empty><EmptyHeader><EmptyTitle>Could not load inventory</EmptyTitle><EmptyDescription>{(error as Error).message}</EmptyDescription></EmptyHeader></Empty>
      ) : !isLoading && rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{filtered ? 'No pieces match these filters' : 'No pieces yet'}</EmptyTitle>
            <EmptyDescription>{filtered ? 'Try a different search or clear the filters.' : 'Add your first piece, or import your catalogue from Shopify.'}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            {filtered
              ? <Button variant="outline" onClick={() => { setQ(''); setParams({}, { replace: true }) }}>Clear filters</Button>
              : <><Button asChild><Link to="/inventory/new">New piece</Link></Button><Button variant="outline" asChild><Link to="/shopify">Import from Shopify</Link></Button></>}
          </EmptyContent>
        </Empty>
      ) : (
        <div className={isFetching && !isLoading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10 pl-4">
                    <Checkbox checked={allOnPage} aria-label="Select all on this page"
                      onCheckedChange={c => setSelected(s => { const n = new Map(s); rows.forEach(r => (c ? n.set(r.sku, r) : n.delete(r.sku))); return n })} />
                  </TableHead>
                  <TableHead>Piece</TableHead>
                  <TableHead className="hidden xl:table-cell">Collection</TableHead>
                  <TableHead className="hidden 2xl:table-cell">Finish</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Stock value</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={8} className="px-4"><Skeleton className="h-10" /></TableCell></TableRow>
                )) : rows.map(r => (
                  <TableRow key={r.sku} className="cursor-pointer" onClick={() => navigate(`/inventory/${r.sku}`)} data-state={selected.has(r.sku) ? 'selected' : undefined}>
                    <TableCell className="pl-4" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selected.has(r.sku)} onCheckedChange={() => toggle(r)} aria-label={`Select ${r.sku}`} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ItemThumb src={r.image} alt="" />
                        <div className="min-w-0">
                          <Link to={`/inventory/${r.sku}`} className="block max-w-[22rem] truncate font-medium hover:underline" onClick={e => e.stopPropagation()}>{r.name}</Link>
                          <div className="text-xs text-muted-foreground tabular-nums">{r.sku} · {r.category}{r.disabled && ' · Archived'}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground xl:table-cell">{r.collection ?? '-'}</TableCell>
                    <TableCell className="hidden text-muted-foreground 2xl:table-cell">{r.finish ?? '-'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Tooltip>
                        <TooltipTrigger className="cursor-default underline decoration-dotted underline-offset-4 decoration-muted-foreground/40">{formatNumber(r.on_hand)}</TooltipTrigger>
                        <TooltipContent side="left">
                          {Object.keys(r.stock).length ? Object.entries(r.stock).map(([w, n]) => <div key={w} className="tabular-nums">{locationLabel(w)}: {n}</div>) : 'No stock anywhere'}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(r.mrp)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground xl:table-cell">{formatINR(r.stock_value)}</TableCell>
                    <TableCell className="pr-4"><StockBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile list */}
          <ul className="divide-y rounded-xl border md:hidden">
            {isLoading ? Array.from({ length: 6 }).map((_, i) => <li key={i} className="p-3"><Skeleton className="h-12" /></li>) : rows.map(r => (
              <li key={r.sku}>
                <Link to={`/inventory/${r.sku}`} className="flex items-center gap-3 p-3 active:bg-muted">
                  <ItemThumb src={r.image} alt="" className="size-12" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{r.sku} · {formatINR(r.price)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium tabular-nums">{r.on_hand}</div>
                    <StockBadge status={r.status} className="mt-0.5" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground tabular-nums">Page {filters.page} of {pages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={filters.page! <= 1} onClick={() => set('page', String(filters.page! - 1))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={filters.page! >= pages} onClick={() => set('page', String(filters.page! + 1))}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {selected.size > 0 && (
        // Bulk actions for the selection, after Medusa's command bar.
        <div role="toolbar" aria-label="Selected pieces" className="no-print fixed inset-x-3 bottom-4 z-30 mx-auto flex max-w-fit items-center gap-1 overflow-x-auto bg-foreground p-1.5 text-background sm:bottom-6">
          <span className="px-3 text-sm font-medium whitespace-nowrap tabular-nums">{selected.size} selected</span>
          <span className="h-5 w-px bg-background/30" aria-hidden />
          <Button size="sm" variant="ghost" className="text-background hover:bg-background/15 hover:text-background" onClick={() => printLabels(labelsFor(selectedRows))}><PrinterIcon />Labels</Button>
          {me?.isManager && (
            <Button size="sm" variant="ghost" className="text-background hover:bg-background/15 hover:text-background" onClick={() => setEditing(true)}><TableIcon />Edit stock</Button>
          )}
          <Button size="sm" variant="ghost" className="text-background hover:bg-background/15 hover:text-background" onClick={() => exportCsv(selectedRows)}><DownloadIcon />Export</Button>
          <Button size="icon-sm" variant="ghost" className="text-background hover:bg-background/15 hover:text-background" onClick={() => setSelected(new Map())} aria-label="Clear selection"><XIcon /></Button>
        </div>
      )}
      <StockLevelsEditor open={editing} onOpenChange={o => { setEditing(o); if (!o) setSelected(new Map()) }} items={selectedRows} locations={meta?.locations ?? []} />
    </div>
  )
}
