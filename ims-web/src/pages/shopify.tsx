import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CloudUploadIcon, DownloadIcon, RefreshCwIcon, ShoppingBagIcon, TriangleAlertIcon } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/common'
import { useAdminMutation, useMe, useMeta, useShopifyDrift, useShopifyStatus } from '@/hooks/api'
import { api } from '@/lib/api'
import { formatNumber, locationLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ShopifyStatus } from '@/lib/types'

// Response shapes of POST /shopify/import, POST /shopify/sync and GET /shopify/locations (not in lib/types.ts).
interface ImportReport { variants: number; linked: number; created: number; stocked: number; skipped: string[] }
interface SyncReport { orders: number; recorded: number; already: number; returns: number; failed: string[]; unmatched: string[] }
interface ShopifyLocation { id: string; name: string }

const SCOPES = ['read_products', 'read_inventory', 'write_inventory', 'read_orders', 'read_locations']
const MAX_PUSH = 5000
const SHOWN_DRIFT_ROWS = 200

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong')

function formatDateTime(s: string | null) {
  if (!s) return 'Never'
  const d = new Date(s.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatNumber(Math.abs(n))}`

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">{children}</code>
}

function Step({ n, title, description, children }: { n: number; title: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">{n}</span>
          <div className="min-w-0 space-y-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function Figures({ items }: { items: [string, number][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-muted/50 p-4 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-xl font-semibold tracking-tight tabular-nums">{formatNumber(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function IssueList({ title, items, destructive }: { title: string; items: string[]; destructive?: boolean }) {
  if (!items.length) return null
  return (
    <div className="space-y-1.5">
      <div className={cn('text-sm font-medium tabular-nums', destructive && 'text-destructive')}>{title} ({formatNumber(items.length)})</div>
      <ScrollArea className={cn('rounded-lg border', items.length > 5 && 'h-40')}>
        <ul className="divide-y text-xs">
          {items.map((t, i) => <li key={i} className="px-3 py-1.5 break-words">{t}</li>)}
        </ul>
      </ScrollArea>
    </div>
  )
}

function StatusItem({ label, children, numeric, className }: { label: string; children: React.ReactNode; numeric?: boolean; className?: string }) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn('text-base font-semibold tracking-tight break-words', numeric && 'tabular-nums')}>{children}</div>
    </div>
  )
}

/* -------------------------------------------------------------------- Setup */

function SetupPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Connect your Shopify store</CardTitle>
          <CardDescription>Shopify is not connected yet. This is a one-time setup on the gateway, after which stock and orders stay in step.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-5 text-sm">
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums">1</span>
              <p>In the Shopify Dev Dashboard, create an app in the same organisation as your store, then install it on the store.</p>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums">2</span>
              <div className="min-w-0 space-y-2">
                <p>Give the app these access scopes.</p>
                <div className="flex flex-wrap gap-1.5">{SCOPES.map(s => <Badge key={s} variant="outline" className="font-mono">{s}</Badge>)}</div>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums">3</span>
              <div className="min-w-0 space-y-2">
                <p>Set these variables in the gateway environment.</p>
                <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed">{`SHOPIFY_SHOP=your-store.myshopify.com\nSHOPIFY_CLIENT_ID=<client id of the app>\nSHOPIFY_CLIENT_SECRET=<client secret of the app>`}</pre>
                <p className="text-muted-foreground">
                  Instead of the client id and secret you can set a static <Code>SHOPIFY_ACCESS_TOKEN</Code>. Optionally set <Code>SHOPIFY_SYNC_MINUTES</Code> to
                  pull orders automatically every that many minutes. Leave it unset to sync by hand.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums">4</span>
              <p>Restart the gateway, then reload this page to map locations and import your catalogue.</p>
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How sync works</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-3 pl-4 text-sm marker:text-muted-foreground">
            <li>Each Shopify order becomes a &quot;Sale - Online&quot; stock issue from the warehouse mapped to your Shopify location.</li>
            <li>Stock movements the IMS records at that warehouse are pushed to Shopify as changes in quantity.</li>
            <li>A drift check compares both sides and can make Shopify match the IMS when they disagree.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

/* ---------------------------------------------------------------- Connected */

function Connected({ s }: { s: ShopifyStatus }) {
  const { data: meta } = useMeta()
  const mapped = Boolean(s.location_id && s.warehouse)

  // Step 1: mapping
  const locations = useQuery({
    queryKey: ['shopify-locations'],
    queryFn: () => api.get<{ locations: ShopifyLocation[] }>('/shopify/locations').then(r => r.locations),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const [loc, setLoc] = useState(s.location_id ?? '')
  const [wh, setWh] = useState(s.warehouse ?? '')
  const mappingDirty = loc !== (s.location_id ?? '') || wh !== (s.warehouse ?? '')
  const saveMap = useAdminMutation((b: { location_id: string; warehouse: string }) => api.put('/shopify/settings', b))

  // Step 2: import
  const [createMissing, setCreateMissing] = useState(true)
  const [importStock, setImportStock] = useState(true)
  const importM = useAdminMutation(
    (b: { createMissing: boolean; importStock: boolean }) => api.post('/shopify/import', b),
    ['shopify-drift', 'item', 'movements', 'counts'],
  )
  const importReport = importM.data as ImportReport | undefined

  // Step 3: orders
  const syncM = useAdminMutation(() => api.post('/shopify/sync'), ['shopify-drift', 'item', 'movements', 'counts'])
  const syncReport = syncM.data as SyncReport | undefined

  // Drift
  const drift = useShopifyDrift(mapped)
  const pushM = useAdminMutation((skus: string[] | undefined) => api.post('/shopify/push', skus ? { skus } : {}), ['shopify-drift'])
  const [onlyMismatches, setOnlyMismatches] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)

  const busy = saveMap.isPending || importM.isPending || syncM.isPending || pushM.isPending

  const rows = drift.data ?? []
  // Largest gap first. Pieces missing from the Shopify location (no diff) follow the real gaps; matching pieces come last.
  const rank = (d: number | null) => (d == null ? 0.5 : Math.abs(d))
  const sorted = [...rows].sort((a, b) => rank(b.diff) - rank(a.diff))
  const shown = onlyMismatches ? sorted.filter(r => r.diff !== 0) : sorted
  const visible = shown.slice(0, SHOWN_DRIFT_ROWS)
  const pushable = new Set(rows.filter(r => r.diff != null && r.diff !== 0).map(r => r.sku))
  const selectedSkus = [...selected].filter(sku => pushable.has(sku))
  const targetSkus = selectedSkus.length ? selectedSkus : [...pushable]
  const visiblePushable = visible.filter(r => pushable.has(r.sku))
  const allVisibleSelected = visiblePushable.length > 0 && visiblePushable.every(r => selected.has(r.sku))
  const missingAtLocation = rows.filter(r => r.shopify == null).length

  const toggleRow = (sku: string) => setSelected(prev => { const n = new Set(prev); if (n.has(sku)) n.delete(sku); else n.add(sku); return n })
  const toggleAll = (on: boolean) => setSelected(prev => { const n = new Set(prev); visiblePushable.forEach(r => (on ? n.add(r.sku) : n.delete(r.sku))); return n })

  const knownLocation = locations.data?.some(l => l.id.split('/').pop() === loc)

  return (
    <div className="space-y-6">
      <section aria-label="Connection status" className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-xl border bg-card p-5 lg:grid-cols-5">
        <StatusItem label="Shop" className="col-span-2 lg:col-span-1">{s.shop}</StatusItem>
        <StatusItem label="API version" numeric>{s.api_version}</StatusItem>
        <StatusItem label="Linked pieces" numeric>{formatNumber(s.linked_items)} of {formatNumber(s.total_items)}</StatusItem>
        <StatusItem label="Last order sync" numeric>{formatDateTime(s.synced_until)}</StatusItem>
        <StatusItem label="Auto-sync" numeric>{s.auto_sync_minutes ? `Every ${s.auto_sync_minutes} min` : 'Off, manual only'}</StatusItem>
      </section>

      <Step n={1} title="Location mapping" description="Choose which Shopify location holds your online stock and which IMS warehouse it corresponds to.">
        {locations.isError && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Could not load Shopify locations</AlertTitle>
            <AlertDescription>{(locations.error as Error).message}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="shopify-location">Shopify location</FieldLabel>
            <Select value={loc} onValueChange={setLoc} disabled={locations.isLoading || busy}>
              <SelectTrigger id="shopify-location" className="w-full"><SelectValue placeholder={locations.isLoading ? 'Loading locations' : 'Choose a location'} /></SelectTrigger>
              <SelectContent>
                {locations.data?.map(l => <SelectItem key={l.id} value={l.id.split('/').pop()!}>{l.name}</SelectItem>)}
                {loc && !knownLocation && <SelectItem value={loc}>Location {loc}</SelectItem>}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="ims-warehouse">IMS warehouse</FieldLabel>
            <Select value={wh} onValueChange={setWh} disabled={busy}>
              <SelectTrigger id="ims-warehouse" className="w-full"><SelectValue placeholder="Choose a warehouse" /></SelectTrigger>
              <SelectContent>
                {meta?.locations.map(l => <SelectItem key={l.name} value={l.name}>{l.label}</SelectItem>)}
                {wh && !meta?.locations.some(l => l.name === wh) && <SelectItem value={wh}>{locationLabel(wh)}</SelectItem>}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{mapped ? 'Mapping saved.' : 'Save the mapping to unlock the next steps.'}</p>
          <Button
            disabled={!loc || !wh || !mappingDirty || busy}
            onClick={() => saveMap.mutate({ location_id: loc, warehouse: wh }, { onSuccess: () => toast.success('Location mapping saved'), onError: fail })}
          >
            {saveMap.isPending && <Spinner />}Save mapping
          </Button>
        </div>
      </Step>

      <Step n={2} title="Import catalogue" description="Link pieces to their Shopify variants by SKU. Run it again whenever you add products in Shopify.">
        <div className="space-y-4">
          <Field orientation="horizontal">
            <Switch id="import-create" checked={createMissing} onCheckedChange={setCreateMissing} disabled={busy} />
            <FieldContent>
              <FieldLabel htmlFor="import-create">Create missing pieces</FieldLabel>
              <FieldDescription>Add pieces that exist in Shopify but not here, as Fixed MRP pieces at the Shopify price.</FieldDescription>
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <Switch id="import-stock" checked={createMissing && importStock} onCheckedChange={setImportStock} disabled={busy || !createMissing} />
            <FieldContent>
              <FieldLabel htmlFor="import-stock">Import opening stock</FieldLabel>
              <FieldDescription>Receive Shopify&apos;s available quantity for the pieces just created. Nothing is sent back to Shopify.</FieldDescription>
            </FieldContent>
          </Field>
        </div>
        <Button
          variant="outline"
          disabled={!mapped || busy}
          onClick={() => importM.mutate({ createMissing, importStock: createMissing && importStock }, {
            onSuccess: r => toast.success(`Import finished: ${(r as ImportReport).created} created, ${(r as ImportReport).linked} linked`),
            onError: fail,
          })}
        >
          {importM.isPending ? <Spinner /> : <DownloadIcon />}{importM.isPending ? 'Importing, this can take a minute' : 'Import catalogue'}
        </Button>
        {!mapped && <p className="text-sm text-muted-foreground">Save the location mapping first.</p>}
        {importReport && (
          <div className="space-y-3">
            <Figures items={[['Shopify variants', importReport.variants], ['Linked', importReport.linked], ['Created', importReport.created], ['Stocked', importReport.stocked]]} />
            <IssueList title="Skipped" items={importReport.skipped} />
          </div>
        )}
      </Step>

      <Step
        n={3}
        title="Orders"
        description={<>Shopify orders become &quot;Sale - Online&quot; stock issues from the mapped warehouse; cancelled orders come back as returns. {s.auto_sync_minutes ? `This also runs automatically every ${s.auto_sync_minutes} minutes.` : 'Auto-sync is off, so run it whenever you want orders brought in.'}</>}
      >
        <Button variant="outline" disabled={!s.warehouse || busy} onClick={() => syncM.mutate(undefined, {
          onSuccess: r => toast.success(`Order sync finished: ${(r as SyncReport).recorded} recorded`),
          onError: fail,
        })}>
          {syncM.isPending ? <Spinner /> : <RefreshCwIcon />}{syncM.isPending ? 'Syncing orders' : 'Sync orders now'}
        </Button>
        {syncReport && (
          <div className="space-y-3">
            <Figures items={[['Orders found', syncReport.orders], ['Recorded', syncReport.recorded], ['Already recorded', syncReport.already], ['Returns', syncReport.returns]]} />
            <IssueList title="Failed" items={syncReport.failed} destructive />
            <IssueList title="Unmatched lines" items={syncReport.unmatched} />
          </div>
        )}
        {s.last_log && (
          <div className="space-y-1.5">
            <Label>Last sync log</Label>
            <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">{s.last_log}</pre>
          </div>
        )}
      </Step>

      <Card>
        <CardHeader>
          <CardTitle>Stock drift</CardTitle>
          <CardDescription>
            IMS quantity at {locationLabel(s.warehouse)} against Shopify&apos;s available quantity. Differences can appear if something was changed in Shopify directly.
          </CardDescription>
          {mapped && (
            <CardAction>
              <Button variant="outline" size="sm" disabled={drift.isFetching || busy} onClick={() => drift.refetch()}>
                {drift.isFetching ? <Spinner /> : <RefreshCwIcon />}Refresh
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!mapped ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Save the location mapping to compare stock.</p>
          ) : drift.isError ? (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>Could not compare stock</AlertTitle>
              <AlertDescription>{(drift.error as Error).message}</AlertDescription>
            </Alert>
          ) : drift.isLoading ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Reading stock levels from Shopify</p>
              <Skeleton className="h-40 rounded-xl" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5 text-sm">
                  <div className="tabular-nums">
                    <span className="font-medium">{formatNumber(pushable.size)}</span> of {formatNumber(rows.length)} linked pieces differ
                    {selectedSkus.length > 0 && <>, {formatNumber(selectedSkus.length)} selected</>}
                  </div>
                  {missingAtLocation > 0 && (
                    <div className="text-xs text-muted-foreground tabular-nums">{formatNumber(missingAtLocation)} not stocked at the Shopify location cannot be pushed.</div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Field orientation="horizontal" className="w-auto">
                    <Switch id="drift-only" size="sm" checked={onlyMismatches} onCheckedChange={setOnlyMismatches} />
                    <FieldLabel htmlFor="drift-only" className="text-sm font-normal">Mismatches only</FieldLabel>
                  </Field>
                  <Button disabled={targetSkus.length === 0 || busy} onClick={() => setConfirming(true)}>
                    {pushM.isPending ? <Spinner /> : <CloudUploadIcon />}
                    {selectedSkus.length ? `Make Shopify match IMS (${formatNumber(selectedSkus.length)} selected)` : `Make Shopify match IMS (all ${formatNumber(pushable.size)})`}
                  </Button>
                </div>
              </div>

              {visible.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {rows.length === 0 ? 'No pieces are linked to Shopify yet. Import the catalogue first.' : 'Shopify and the IMS agree on every linked piece.'}
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="w-10 pl-4">
                          <Checkbox checked={allVisibleSelected} onCheckedChange={c => toggleAll(c === true)} disabled={visiblePushable.length === 0 || busy} aria-label="Select all differing pieces" />
                        </TableHead>
                        <TableHead>Piece</TableHead>
                        <TableHead className="text-right">IMS</TableHead>
                        <TableHead className="text-right">Shopify</TableHead>
                        <TableHead className="pr-4 text-right">Diff</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map(r => {
                        const canPush = pushable.has(r.sku)
                        const differs = r.diff !== 0
                        return (
                          <TableRow key={r.sku} data-state={selected.has(r.sku) ? 'selected' : undefined} className={cn(differs && 'bg-status-low/5')}>
                            <TableCell className="pl-4">
                              {canPush && <Checkbox checked={selected.has(r.sku)} onCheckedChange={() => toggleRow(r.sku)} disabled={busy} aria-label={`Select ${r.sku}`} />}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium tabular-nums">{r.sku}</div>
                              <div className="max-w-[6.5rem] truncate text-xs text-muted-foreground sm:max-w-xs">{r.name}</div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(r.ims)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.shopify == null ? <span className="text-xs text-muted-foreground">Not stocked</span> : formatNumber(r.shopify)}
                            </TableCell>
                            <TableCell className={cn('pr-4 text-right tabular-nums', differs && r.diff != null ? 'font-semibold text-status-low' : 'text-muted-foreground')}>
                              {r.diff == null ? '-' : r.diff === 0 ? '0' : signed(r.diff)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {shown.length > visible.length && (
                <p className="text-xs text-muted-foreground tabular-nums">Showing the {formatNumber(visible.length)} largest of {formatNumber(shown.length)} rows. Use Refresh after fixing to see the rest.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make Shopify match the IMS?</AlertDialogTitle>
            <AlertDialogDescription>
              Shopify&apos;s available quantity will be overwritten with the IMS quantity at {locationLabel(s.warehouse)} for {formatNumber(targetSkus.length)} {targetSkus.length === 1 ? 'piece' : 'pieces'}.
              The IMS is not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pushM.mutate(targetSkus.length > MAX_PUSH ? undefined : targetSkus, {
                onSuccess: r => { toast.success(`Updated ${formatNumber((r as { updated: number }).updated)} pieces in Shopify`); setSelected(new Set()) },
                onError: fail,
              })}
            >
              Update Shopify
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* --------------------------------------------------------------------- Page */

export default function ShopifyPage() {
  const { data: me, isLoading: meLoading } = useMe()
  const status = useShopifyStatus()

  if (meLoading) return <Skeleton className="h-64 rounded-xl" />

  if (!me?.isManager) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><ShoppingBagIcon /></EmptyMedia>
          <EmptyTitle>Shopify is managed by stock managers</EmptyTitle>
          <EmptyDescription>Connecting the store, importing the catalogue and syncing orders are limited to stock managers. Ask one of them if something needs doing here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (status.isError) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Could not load Shopify status</EmptyTitle>
          <EmptyDescription>{(status.error as Error).message}</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={() => status.refetch()}>Try again</Button>
      </Empty>
    )
  }

  const s = status.data
  return (
    <div className="space-y-6">
      <PageHeader
        title="Shopify"
        description={s?.enabled ? 'Keep Shopify and the IMS in step: map the location, import products, bring in orders and fix any drift.' : 'Connect your Shopify store to sync stock and orders.'}
      />
      {!s ? (
        <div className="space-y-4"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-56 rounded-xl" /></div>
      ) : s.enabled ? (
        <Connected s={s} />
      ) : (
        <SetupPanel />
      )}
    </div>
  )
}
