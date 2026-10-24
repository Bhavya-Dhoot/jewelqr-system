import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import {
  ArrowLeftRightIcon, ArrowRightIcon, ChevronDownIcon, PackagePlusIcon, ScanLineIcon, SearchIcon, ShoppingCartIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ItemThumb, PageHeader, StockBadge } from '@/components/common'
import { useMovementDialog } from '@/components/movement-dialog'
import { Scanner, skuFromQr } from '@/components/scanner'
import { useItem, useMeta } from '@/hooks/api'
import { ApiError } from '@/lib/api'
import { formatINR, formatNumber, locationLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StockStatus } from '@/lib/types'

interface Recent { sku: string; name: string; image: string | null }

const MAX_RECENT = 10

function ScanResult({ sku, onNext, onResolved }: { sku: string; onNext: () => void; onResolved: (r: Recent) => void }) {
  const { data, isLoading, isError, error, refetch } = useItem(sku)
  const { data: meta } = useMeta()
  const { openMovement } = useMovementDialog()
  const [showPrice, setShowPrice] = useState(false)

  useEffect(() => {
    if (data) onResolved({ sku: data.item.sku, name: data.item.name, image: data.item.image })
  }, [data, onResolved])

  if (isLoading) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex gap-4">
          <Skeleton className="size-24 rounded-md" />
          <div className="flex-1 space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/3" /></div>
        </div>
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-24" />
      </div>
    )
  }

  if (isError || !data) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>{notFound ? `No piece with SKU ${sku}` : `Could not load ${sku}`}</EmptyTitle>
          <EmptyDescription>
            {notFound ? 'Check the label and scan again, or search the inventory by name.' : (error as Error | null)?.message ?? 'Something went wrong.'}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center">
          <Button onClick={onNext}><ScanLineIcon />Scan next</Button>
          {notFound
            ? <Button variant="outline" asChild><Link to={`/inventory?q=${encodeURIComponent(sku)}`}>Search inventory</Link></Button>
            : <Button variant="outline" onClick={() => refetch()}>Try again</Button>}
        </EmptyContent>
      </Empty>
    )
  }

  const { item, price, stock } = data
  const level = item.reorder_level || meta?.settings.low_stock_default || 0
  const status: StockStatus = item.on_hand <= 0 ? 'out' : item.on_hand <= level ? 'low' : 'in'
  const stockRows = stock.filter(s => s.qty !== 0)
  const facets = [item.category, item.collection, item.finish, item.crystal_colour].filter(Boolean).join(' · ')

  return (
    <div className="space-y-5 rounded-xl border bg-card p-4">
      <div className="flex gap-4">
        <ItemThumb src={item.image} alt={item.name} className="size-24 rounded-lg sm:size-28" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <h2 className="text-lg leading-tight font-semibold text-balance">{item.name}</h2>
          <p className="text-sm text-muted-foreground tabular-nums">{item.sku}</p>
          {facets && <p className="text-xs text-muted-foreground">{facets}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <StockBadge status={status} />
            {item.disabled && <Badge variant="outline" className="text-muted-foreground">Archived</Badge>}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <div className="text-4xl font-semibold tracking-tight tabular-nums">{formatINR(price.total)}</div>
          <Badge variant="secondary">{price.mode === 'Metal Rate' ? 'Metal rate, incl. tax' : 'Fixed MRP, incl. taxes'}</Badge>
        </div>
        <button
          type="button"
          aria-expanded={showPrice}
          onClick={() => setShowPrice(s => !s)}
          className="flex w-full items-center justify-between rounded-md py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Price breakdown
          <ChevronDownIcon className={cn('size-4 transition-transform', showPrice && 'rotate-180')} />
        </button>
        {showPrice && (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <ul className="space-y-2">
              {price.lines.map((l, i) => (
                <li key={i} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div>{l.label}</div>
                    {l.detail && <div className="text-xs text-muted-foreground">{l.detail}</div>}
                  </div>
                  <div className="tabular-nums">{formatINR(l.value)}</div>
                </li>
              ))}
            </ul>
            {price.tax > 0 && (
              <div className="space-y-1 border-t pt-2 text-muted-foreground">
                <div className="flex justify-between gap-3"><span>Subtotal</span><span className="tabular-nums">{formatINR(price.subtotal)}</span></div>
                <div className="flex justify-between gap-3"><span>Tax{price.tax_percent != null ? ` (${price.tax_percent}%)` : ''}</span><span className="tabular-nums">{formatINR(price.tax)}</span></div>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t pt-2 font-medium"><span>Total</span><span className="tabular-nums">{formatINR(price.total)}</span></div>
            {price.missing_stone_rates && price.missing_stone_rates.length > 0 && (
              <p role="alert" className="text-xs text-destructive">No rate set for {price.missing_stone_rates.join(', ')}. This price is incomplete.</p>
            )}
          </div>
        )}
      </div>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">Stock by location</h3>
          <span className="text-sm text-muted-foreground tabular-nums">{formatNumber(item.on_hand)} in total</span>
        </div>
        {stockRows.length ? (
          <ul className="divide-y rounded-lg border">
            {stockRows.map(s => (
              <li key={s.warehouse} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="truncate">{locationLabel(s.warehouse)}</span>
                <span className="font-medium tabular-nums">{formatNumber(s.qty)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Not in stock at any location.</p>}
      </section>

      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Button size="lg" onClick={() => openMovement({ action: 'sell', sku: item.sku })}><ShoppingCartIcon />Sell</Button>
          <Button size="lg" variant="outline" onClick={() => openMovement({ action: 'move', sku: item.sku })}><ArrowLeftRightIcon />Move</Button>
          <Button size="lg" variant="outline" onClick={() => openMovement({ action: 'receive', sku: item.sku })}><PackagePlusIcon />Receive</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" variant="secondary" onClick={onNext}><ScanLineIcon />Scan next</Button>
          <Button size="lg" variant="ghost" asChild><Link to={`/inventory/${item.sku}`}>View details<ArrowRightIcon /></Link></Button>
        </div>
      </div>
    </div>
  )
}

export default function ScanPage() {
  const [sku, setSku] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [recent, setRecent] = useState<Recent[]>([])
  const result = useRef<HTMLDivElement>(null)

  const remember = useCallback(
    (r: Recent) => setRecent(prev => [r, ...prev.filter(x => x.sku !== r.sku)].slice(0, MAX_RECENT)),
    [],
  )

  // On a phone the result sits below the scanner: bring it into view when a piece is opened.
  useEffect(() => {
    if (sku) result.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [sku])

  function find(e: FormEvent) {
    e.preventDefault()
    const parsed = skuFromQr(manual)
    if (!parsed) {
      toast.error('Enter a SKU such as EAR-00012')
      return
    }
    setSku(parsed)
    setManual('')
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Scan" description="Point the camera at a QR label to see the piece, its price and where it is." />

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <Scanner
            paused={sku != null}
            onSku={setSku}
            className={sku ? 'aspect-[5/2] sm:aspect-[5/2] lg:aspect-square' : 'aspect-square sm:aspect-[4/3] lg:aspect-square'}
          />
          <form onSubmit={find} className="flex items-end gap-2">
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor="scan-sku">Or type a SKU</FieldLabel>
              <Input
                id="scan-sku"
                value={manual}
                onChange={e => setManual(e.target.value)}
                placeholder="EAR-00012"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="uppercase placeholder:normal-case"
              />
            </Field>
            <Button type="submit" disabled={!manual.trim()}><SearchIcon />Find</Button>
          </form>
        </div>

        <div className="min-w-0 space-y-5">
          <div ref={result} aria-live="polite">
            {sku ? (
              <ScanResult key={sku} sku={sku} onNext={() => setSku(null)} onResolved={remember} />
            ) : (
              <Empty className="hidden border lg:flex">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><ScanLineIcon /></EmptyMedia>
                  <EmptyTitle>Ready to scan</EmptyTitle>
                  <EmptyDescription>Scan a label or type a SKU. The piece appears here with its price and stock.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>

          {recent.length > 0 && (
            <section aria-label="Recent scans" className="space-y-2">
              <h2 className="text-sm font-medium">Recent scans</h2>
              <ul className="divide-y overflow-hidden rounded-xl border">
                {recent.map(r => (
                  <li key={r.sku}>
                    <button
                      type="button"
                      onClick={() => setSku(r.sku)}
                      className={cn('flex w-full items-center gap-3 p-3 text-left active:bg-muted', r.sku === sku && 'bg-muted/60')}
                    >
                      <ItemThumb src={r.image} alt="" className="size-9" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{r.sku}</div>
                      </div>
                      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
