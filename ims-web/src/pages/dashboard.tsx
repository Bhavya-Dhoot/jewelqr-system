import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRightIcon, PackagePlusIcon, PlusIcon } from 'lucide-react'
import { AreaChart, Area } from '@/components/charts/area-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { Bar } from '@/components/charts/bar'
import { BarYAxis } from '@/components/charts/bar-y-axis'
import { Grid } from '@/components/charts/grid'
import { XAxis } from '@/components/charts/x-axis'
import { ChartTooltip } from '@/components/charts/tooltip'
import NumberFlow from '@number-flow/react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { ItemThumb, PageHeader, Stat, StockBadge } from '@/components/common'
import { useMovementDialog } from '@/components/movement-dialog'
import { useDashboard } from '@/hooks/api'
import { formatINR, formatNumber, formatRelative, locationLabel, personLabel } from '@/lib/format'

const INR_COMPACT = { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 } as const
const Figure = ({ value, format }: { value: number; format?: Parameters<typeof NumberFlow>[0]['format'] }) => <NumberFlow value={value} format={format} locales="en-IN" />

export default function DashboardPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading, isError, error, refetch } = useDashboard(days)
  const { openMovement } = useMovementDialog()

  if (isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Could not load the dashboard</EmptyTitle>
          <EmptyDescription>{(error as Error).message}</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={() => refetch()}>Try again</Button>
      </Empty>
    )
  }

  const k = data?.kpis
  const flow = (data?.flow ?? []).map(d => ({ date: new Date(`${d.date}T00:00:00`), Received: d.in, 'Sold or used': d.out }))
  const categories = (data?.by_category ?? []).slice(0, 8).map(c => ({ name: c.name, Cost: Math.round(c.value), Retail: Math.round(c.retail) }))
  const locTotal = (data?.by_location ?? []).reduce((s, l) => s + l.units, 0)
  const locations = (data?.by_location ?? []).map(l => ({ name: locationLabel(l.name), Pieces: l.units }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={k ? `${formatNumber(k.units)} pieces across ${formatNumber(k.in_stock_skus)} SKUs in stock` : 'Loading stock…'}
        actions={
          <>
            <ToggleGroup type="single" variant="outline" size="sm" value={String(days)} onValueChange={v => v && setDays(Number(v))} aria-label="Date range">
              <ToggleGroupItem value="7">7d</ToggleGroupItem>
              <ToggleGroupItem value="30">30d</ToggleGroupItem>
              <ToggleGroupItem value="90">90d</ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" asChild><Link to="/inventory/new"><PlusIcon />New piece</Link></Button>
            <Button onClick={() => openMovement({ action: 'receive' })}><PackagePlusIcon />Receive stock</Button>
          </>
        }
      />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-5">
        {isLoading || !k ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />) : (
          <>
            <Stat label="Stock value (cost)" value={<Figure value={k.stock_value} format={INR_COMPACT} />} hint="Moving average" />
            <Stat label="Retail value" value={<Figure value={k.retail_value} format={INR_COMPACT} />} hint="At today's prices" />
            <Stat label="Pieces on hand" value={<Figure value={k.units} />} hint={`${formatNumber(k.skus)} active SKUs`} />
            <Stat label={`Sold, last ${days} days`} value={<Figure value={k.units_sold} />} hint={formatINR(k.sales_value)} />
            <Stat
              marked={k.low_stock + k.out_of_stock > 0}
              label="Need attention"
              value={<Link to="/inventory?stock=low" className="hover:underline"><Figure value={k.low_stock + k.out_of_stock} /></Link>}
              hint={`${k.low_stock} low, ${k.out_of_stock} out`}
              className="col-span-2 lg:col-span-1"
            />
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Stock in and out</CardTitle>
            <CardDescription>Pieces received vs. sold or written off per day. Transfers are excluded.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="aspect-[5/2] w-full" /> : flow.some(d => d.Received || d['Sold or used']) ? (
              <AreaChart data={flow} aspectRatio="5 / 2" margin={{ top: 16, right: 28, bottom: 32, left: 28 }} revealSignature={String(days)}>
                <Grid horizontal />
                <Area dataKey="Received" fill="var(--chart-1)" fillOpacity={0.12} />
                <Area dataKey="Sold or used" fill="var(--chart-3)" fillOpacity={0.12} />
                <XAxis />
                <ChartTooltip />
              </AreaChart>
            ) : <p className="py-16 text-center text-sm text-muted-foreground">No stock moved in this period.</p>}
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2.5 bg-chart-1" />Received {k ? formatNumber(k.units_received) : ''}</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 bg-chart-3" />Sold or used</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pieces by location</CardTitle>
            <CardDescription>Where the {formatNumber(locTotal)} pieces are</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-56" /> : locations.length ? (
              <div style={{ height: locations.length * 48 + 8 }}>
              <BarChart data={locations} xDataKey="name" orientation="horizontal" aspectRatio="auto" className="h-full" margin={{ top: 4, right: 40, bottom: 4, left: 96 }} barGap={0.4} revealSignature={String(days)}>
                <Bar dataKey="Pieces" fill="var(--chart-1)" lineCap="butt" showValue valueLabelFormatter={v => formatNumber(v)} />
                <BarYAxis showAllLabels />
                <ChartTooltip rows={p => [{ label: 'Pieces', value: `${formatNumber(Number(p.Pieces))} of ${formatNumber(locTotal)}`, color: 'var(--chart-1)' }]} />
              </BarChart>
              </div>
            ) : <p className="py-16 text-sm text-muted-foreground">No stock yet.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Value by category</CardTitle>
            <CardDescription>Cost of stock on hand vs. its retail value</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="aspect-[5/2] w-full" /> : categories.length ? (
              <>
                <div style={{ height: categories.length * 52 + 16 }}>
                <BarChart data={categories} xDataKey="name" orientation="horizontal" aspectRatio="auto" className="h-full" margin={{ top: 8, right: 16, bottom: 8, left: 96 }} barGap={0.3} revealSignature={String(days)}>
                  <Grid vertical />
                  <Bar dataKey="Cost" fill="var(--chart-3)" lineCap="butt" />
                  <Bar dataKey="Retail" fill="var(--chart-1)" lineCap="butt" />
                  <BarYAxis showAllLabels />
                  <ChartTooltip rows={p => [
                    { label: 'Cost', value: formatINR(Number(p.Cost)), color: 'var(--chart-3)' },
                    { label: 'Retail', value: formatINR(Number(p.Retail)), color: 'var(--chart-1)' },
                  ]} />
                </BarChart>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="size-2.5 bg-chart-3" />Cost</span>
                  <span className="flex items-center gap-1.5"><span className="size-2.5 bg-chart-1" />Retail</span>
                </div>
              </>
            ) : <p className="py-16 text-center text-sm text-muted-foreground">No stock on hand.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Low or out of stock</CardDescription>
            <CardAction><Button variant="ghost" size="sm" asChild><Link to="/inventory?stock=low">All<ArrowRightIcon /></Link></Button></CardAction>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64" /> : data?.attention.length ? (
              <ul className="-mx-2">
                {data.attention.map(r => (
                  <li key={r.sku}>
                    <Link to={`/inventory/${r.sku}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
                      <ItemThumb src={r.image} alt="" className="size-9" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{r.sku} · {r.on_hand} left, reorder at {r.reorder_level}</div>
                      </div>
                      <StockBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="py-12 text-center text-sm text-muted-foreground">Everything is above its reorder level.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Best sellers</CardTitle>
            <CardDescription>Pieces sold in the last {days} days</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48" /> : data?.top_sellers.length ? (
              <ol className="-mx-2">
                {data.top_sellers.map((s, i) => (
                  <li key={s.sku}>
                    <Link to={`/inventory/${s.sku}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
                      <span className="w-4 text-right text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                      <ItemThumb src={s.image} alt="" className="size-9" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{s.sku} · {s.on_hand} left</div>
                      </div>
                      <span className="text-sm font-medium tabular-nums">{s.units} sold</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : <p className="py-12 text-center text-sm text-muted-foreground">No sales recorded in this period.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardAction><Button variant="ghost" size="sm" asChild><Link to="/movements">All<ArrowRightIcon /></Link></Button></CardAction>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48" /> : data?.recent.length ? (
              <ul className="divide-y">
                {data.recent.map(m => (
                  <li key={m.name} className="flex items-center gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{m.reason || m.purpose.replace('Material ', '')}{m.reference && <span className="font-normal text-muted-foreground"> · {m.reference}</span>}</div>
                      <div className="text-xs text-muted-foreground">{formatRelative(m.date)} at {m.time} by {personLabel(m.by)}</div>
                    </div>
                    {m.value > 0 && <span className="tabular-nums text-muted-foreground">{formatINR(m.value)}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="py-12 text-center text-sm text-muted-foreground">No movements yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
