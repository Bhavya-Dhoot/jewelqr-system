import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import {
  CheckCircle2Icon, ListPlusIcon, MinusIcon, PlusIcon, ScanLineIcon, Trash2Icon, XIcon,
} from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ItemThumb, PageHeader } from '@/components/common'
import { useItemSearch } from '@/components/command-search'
import { Scanner } from '@/components/scanner'
import { useCounts, useMe, useMeta, usePostCount } from '@/hooks/api'
import { api, ApiError } from '@/lib/api'
import { formatDate, formatINR, formatNumber, locationLabel, personLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CountResult, ItemDetail, ItemList, ItemRow } from '@/lib/types'

interface CountLine { sku: string; name: string; image: string | null; system: number; counted: number | null }
interface Draft { lines: CountLine[]; notes: string }
interface Posted { location: string; name: string | null; adjustments: CountResult['adjustments']; names: Record<string, string> }

const MAX_QTY = 100000
const LOCATION_KEY = 'ims.count.location'
const draftKey = (location: string) => `ims.count.draft.${location}`

function readDraft(location: string): Draft {
  try {
    const raw = localStorage.getItem(draftKey(location))
    if (raw) {
      const d = JSON.parse(raw) as Partial<Draft>
      const lines = Array.isArray(d.lines)
        ? d.lines.filter(l => l && typeof l.sku === 'string' && typeof l.name === 'string' && typeof l.system === 'number' && (l.counted === null || Number.isInteger(l.counted)))
        : []
      return { lines, notes: typeof d.notes === 'string' ? d.notes : '' }
    }
  } catch { /* storage unavailable or corrupt: start empty */ }
  return { lines: [], notes: '' }
}

function writeDraft(location: string, draft: Draft) {
  try {
    if (draft.lines.length || draft.notes) localStorage.setItem(draftKey(location), JSON.stringify(draft))
    else localStorage.removeItem(draftKey(location))
  } catch { /* storage unavailable: the draft just won't survive a reload */ }
}

const signed = (n: number) => (n > 0 ? `+${formatNumber(n)}` : formatNumber(n))
const varianceOf = (l: CountLine) => (l.counted == null ? null : l.counted - l.system)

const lineFromRow = (r: ItemRow, location: string): CountLine => ({ sku: r.sku, name: r.name, image: r.image, system: r.stock[location] || 0, counted: null })

/** Count one more of a piece (adding it if new) and move it to the top so the latest scan is always visible. */
function countOne(lines: CountLine[], incoming: CountLine): CountLine[] {
  const existing = lines.find(l => l.sku === incoming.sku)
  const next = existing ? { ...existing, counted: (existing.counted ?? 0) + 1 } : { ...incoming, counted: 1 }
  return [next, ...lines.filter(l => l.sku !== incoming.sku)]
}

function PieceSearch({ onPick }: { onPick: (r: ItemRow) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const { data = [], isFetching } = useItemSearch(q, open)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-0 flex-1 justify-start text-muted-foreground sm:flex-none">
          <PlusIcon />Add a piece by SKU or name
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type a SKU or name…" value={q} onValueChange={setQ} />
          <CommandList>
            {q && !isFetching && <CommandEmpty>Nothing found.</CommandEmpty>}
            <CommandGroup>
              {data.map(r => (
                <CommandItem key={r.sku} value={r.sku} onSelect={() => { onPick(r); setQ(''); setOpen(false) }}>
                  <ItemThumb src={r.image} alt="" className="size-8" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{r.sku} · {r.on_hand} on hand</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-lg leading-tight font-semibold tabular-nums', className)}>{value}</div>
    </div>
  )
}

const ROW_GRID = 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_4.5rem_9.5rem_5.5rem_auto]'

function LineRow({ line, onCounted, onRemove }: { line: CountLine; onCounted: (n: number | null) => void; onRemove: () => void }) {
  const v = varianceOf(line)
  const changed = v != null && v !== 0
  return (
    <li className={cn(ROW_GRID, 'p-3', changed && 'bg-muted/40')}>
      <ItemThumb src={line.image} alt="" className="size-10" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{line.name}</div>
        <div className="text-xs text-muted-foreground tabular-nums">{line.sku}</div>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${line.sku}`} className="col-start-3 row-start-1 sm:col-start-6" onClick={onRemove}><XIcon /></Button>

      <div className="col-span-3 flex items-center justify-between gap-3 sm:contents">
        <div className="sm:text-right">
          <div className="text-xs text-muted-foreground sm:hidden">System</div>
          <div className="text-sm tabular-nums">{formatNumber(line.system)}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label={`Decrease count for ${line.sku}`} disabled={line.counted === 0} onClick={() => onCounted(Math.max(0, (line.counted ?? 1) - 1))}><MinusIcon /></Button>
          <Input
            aria-label={`Counted quantity for ${line.sku}`}
            inputMode="numeric"
            placeholder="Count"
            className="h-7 w-14 px-1 text-center tabular-nums"
            value={line.counted ?? ''}
            onFocus={e => e.target.select()}
            onChange={e => {
              const digits = e.target.value.replace(/\D/g, '')
              onCounted(digits === '' ? null : Math.min(MAX_QTY, Number(digits)))
            }}
          />
          <Button variant="outline" size="icon-sm" aria-label={`Increase count for ${line.sku}`} onClick={() => onCounted(Math.min(MAX_QTY, (line.counted ?? 0) + 1))}><PlusIcon /></Button>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground sm:hidden">Variance</div>
          {v == null ? (
            <div className="text-xs text-muted-foreground">Not counted</div>
          ) : (
            <div className={cn('text-sm tabular-nums', v > 0 && 'font-semibold text-status-in', v < 0 && 'font-semibold text-status-out', v === 0 && 'text-muted-foreground')}>{signed(v)}</div>
          )}
        </div>
      </div>
    </li>
  )
}

function CountSheet({ location, onPosted }: { location: string; onPosted: (p: Posted) => void }) {
  const [initial] = useState(() => readDraft(location))
  const [lines, setLines] = useState<CountLine[]>(initial.lines)
  const [notes, setNotes] = useState(initial.notes)
  const [scanning, setScanning] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)
  const [confirmPost, setConfirmPost] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const post = usePostCount()

  useEffect(() => { writeDraft(location, { lines, notes }) }, [location, lines, notes])

  const variances = lines.map(varianceOf)
  const countedN = variances.filter(v => v != null).length
  const diffN = variances.filter(v => v != null && v !== 0).length
  const net = variances.reduce<number>((s, v) => s + (v ?? 0), 0)

  const setCounted = (sku: string, counted: number | null) => setLines(ls => ls.map(l => (l.sku === sku ? { ...l, counted } : l)))

  async function onScan(sku: string) {
    const known = lines.find(l => l.sku === sku)
    if (known) {
      setLines(ls => countOne(ls, known))
      toast.success(`${sku} counted: ${(known.counted ?? 0) + 1}`)
      return
    }
    try {
      const d = await api.get<ItemDetail>(`/items/${encodeURIComponent(sku)}`)
      const line: CountLine = {
        sku: d.item.sku, name: d.item.name, image: d.item.image,
        system: d.stock.find(s => s.warehouse === location)?.qty ?? 0, counted: null,
      }
      setLines(ls => countOne(ls, line))
      toast.success(`${line.sku} counted: 1`)
    } catch (e) {
      toast.error(e instanceof ApiError && e.status === 404 ? `No piece with SKU ${sku}` : (e as Error).message)
    }
  }

  async function loadAll() {
    setLoadingAll(true)
    try {
      const res = await api.get<ItemList>('/items?location=' + encodeURIComponent(location) + '&pageSize=500')
      if (!res.items.length) {
        toast.info(`No pieces have stock at ${locationLabel(location)}.`)
        return
      }
      const fresh = new Map(res.items.map(r => [r.sku, r]))
      const have = new Set(lines.map(l => l.sku))
      const added = res.items.filter(r => !have.has(r.sku)).map(r => lineFromRow(r, location))
      // Existing lines keep their counts but pick up the current system quantity.
      setLines(ls => [
        ...ls.map(l => { const r = fresh.get(l.sku); return r ? { ...l, system: r.stock[location] || 0 } : l }),
        ...added.filter(a => !ls.some(l => l.sku === a.sku)),
      ])
      toast.success(`${added.length} ${added.length === 1 ? 'piece' : 'pieces'} loaded`)
      if (res.total > res.items.length) {
        toast.warning(`Loaded the first ${formatNumber(res.items.length)} of ${formatNumber(res.total)} pieces. Add the rest by scanning or search.`)
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoadingAll(false)
    }
  }

  async function submit() {
    const payload: { sku: string; counted: number }[] = []
    for (const l of lines) if (l.counted != null) payload.push({ sku: l.sku, counted: l.counted })
    if (!payload.length) return
    try {
      const res = await post.mutateAsync({ warehouse: location, notes: notes.trim() || undefined, lines: payload })
      onPosted({ location, name: res.name, adjustments: res.adjustments, names: Object.fromEntries(lines.map(l => [l.sku, l.name])) })
      setLines([])
      setNotes('')
      setConfirmPost(false)
      toast.success(res.adjustments.length ? `Count posted, ${res.adjustments.length} ${res.adjustments.length === 1 ? 'piece' : 'pieces'} adjusted` : 'Count posted, no differences')
    } catch (e) {
      setConfirmPost(false)
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <section aria-label="Add pieces" className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <PieceSearch onPick={r => setLines(ls => countOne(ls, lineFromRow(r, location)))} />
          <Button variant={scanning ? 'secondary' : 'outline'} onClick={() => setScanning(s => !s)}>
            {scanning ? <XIcon /> : <ScanLineIcon />}{scanning ? 'Stop scanning' : 'Scan labels'}
          </Button>
          <Button variant="outline" onClick={loadAll} disabled={loadingAll}>
            {loadingAll ? <Spinner /> : <ListPlusIcon />}Load every piece at this location
          </Button>
        </div>
        {scanning && <Scanner onSku={onScan} className="mx-auto max-w-md sm:aspect-[2/1]" />}
        <p className="text-xs text-muted-foreground">
          Each scan or search pick counts one more of that piece. Loaded pieces start uncounted and are left unchanged if you never count them.
        </p>
      </section>

      {lines.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Nothing counted yet</EmptyTitle>
            <EmptyDescription>Scan labels, search for a piece, or load every piece at {locationLabel(location)} to start.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <section aria-label="Count lines" className="space-y-3">
          <div className="sticky top-14 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-background/95 p-3 shadow-xs backdrop-blur">
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-4 sm:flex sm:flex-none sm:gap-8">
              <Figure label="Lines counted" value={`${countedN} of ${lines.length}`} />
              <Figure label="With differences" value={String(diffN)} className={diffN > 0 ? 'text-status-low' : undefined} />
              <Figure label="Net units" value={signed(net)} className={net > 0 ? 'text-status-in' : net < 0 ? 'text-status-out' : undefined} />
            </div>
            <Button className="w-full sm:ml-auto sm:w-auto" disabled={countedN === 0 || post.isPending} onClick={() => setConfirmPost(true)}>
              Post count
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Lines <span className="font-normal text-muted-foreground tabular-nums">({lines.length})</span></h2>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(true)}><Trash2Icon />Discard draft</Button>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <div className={cn(ROW_GRID, 'hidden border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid')}>
              <div className="col-span-2">Piece</div>
              <div className="text-right">System</div>
              <div className="text-center">Counted</div>
              <div className="text-right">Variance</div>
              <div className="size-7" />
            </div>
            <ul className="divide-y">
              {lines.map(l => (
                <LineRow key={l.sku} line={l} onCounted={n => setCounted(l.sku, n)} onRemove={() => setLines(ls => ls.filter(x => x.sku !== l.sku))} />
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">System is the quantity in ERPNext when the piece was added. Loading every piece refreshes it.</p>
        </section>
      )}

      <AlertDialog open={confirmPost} onOpenChange={o => { if (!post.isPending) setConfirmPost(o) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post count for {locationLabel(location)}?</AlertDialogTitle>
            <AlertDialogDescription>
              {countedN} {countedN === 1 ? 'line' : 'lines'} counted, {diffN} with differences, net {signed(net)} units.
              ERPNext will set each counted piece to the quantity you entered.{lines.length > countedN && ` ${lines.length - countedN} uncounted ${lines.length - countedN === 1 ? 'line is' : 'lines are'} left unchanged.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="count-notes">Notes (optional)</FieldLabel>
            <Textarea id="count-notes" rows={2} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={post.isPending}>Keep counting</AlertDialogCancel>
            <AlertDialogAction disabled={post.isPending} onClick={e => { e.preventDefault(); void submit() }}>
              {post.isPending && <Spinner />}Post count
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all {lines.length} {lines.length === 1 ? 'line' : 'lines'} and their counts for {locationLabel(location)}. Nothing has been posted to ERPNext.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep draft</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { setLines([]); setNotes(''); setScanning(false) }}>Discard draft</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PostedCount({ posted, onClose }: { posted: Posted; onClose: () => void }) {
  const n = posted.adjustments.length
  return (
    <section aria-label="Posted count" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="flex items-center gap-2 font-medium"><CheckCircle2Icon className="size-4 shrink-0 text-status-in" />Count posted for {locationLabel(posted.location)}</h2>
          <p className="text-sm text-muted-foreground">
            {n === 0 ? 'Every counted piece already matched ERPNext, so nothing was adjusted.' : `${n} ${n === 1 ? 'piece was' : 'pieces were'} adjusted${posted.name ? ` in ${posted.name}` : ''}.`}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onClose}><XIcon /></Button>
      </div>
      {n > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-3">Piece</TableHead>
                <TableHead className="text-right">System</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="pr-3 text-right">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posted.adjustments.map(a => (
                <TableRow key={a.sku}>
                  <TableCell className="max-w-0 pl-3">
                    <Link to={`/inventory/${a.sku}`} className="text-sm font-medium tabular-nums underline-offset-2 hover:underline">{a.sku}</Link>
                    {posted.names[a.sku] && <div className="truncate text-xs text-muted-foreground">{posted.names[a.sku]}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(a.system)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(a.counted)}</TableCell>
                  <TableCell className={cn('pr-3 text-right font-medium tabular-nums', a.diff > 0 && 'text-status-in', a.diff < 0 && 'text-status-out')}>{signed(a.diff)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

function RecentCounts() {
  const { data, isLoading, isError, error } = useCounts()
  return (
    <section aria-label="Recent counts" className="space-y-3">
      <h2 className="text-sm font-medium">Recent counts</h2>
      {isLoading ? <Skeleton className="h-32 rounded-xl" /> : isError ? (
        <p className="text-sm text-muted-foreground">Could not load recent counts: {(error as Error).message}</p>
      ) : data?.length ? (
        <ul className="divide-y rounded-xl border">
          {data.map(c => (
            <li key={c.name} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate"><span className="font-mono text-xs">{c.name}</span></div>
                <div className="truncate text-xs text-muted-foreground">{formatDate(c.date)} · {personLabel(c.by)}{c.notes && ` · ${c.notes}`}</div>
              </div>
              <div className="text-right">
                <div className={cn('font-medium tabular-nums', c.difference_value > 0 && 'text-status-in', c.difference_value < 0 && 'text-status-out')}>
                  {c.difference_value > 0 ? '+' : ''}{formatINR(c.difference_value)}
                </div>
                <div className="text-xs text-muted-foreground">Value difference</div>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No counts have been posted yet.</p>}
    </section>
  )
}

function CountWorkspace() {
  const { data: meta, isLoading } = useMeta()
  const locations = meta?.locations ?? []
  const [picked, setPicked] = useState<string | null>(() => { try { return localStorage.getItem(LOCATION_KEY) } catch { return null } })
  const [posted, setPosted] = useState<Posted | null>(null)
  const location = locations.find(l => l.name === picked)?.name ?? locations.find(l => l.is_default)?.name ?? locations[0]?.name ?? ''

  const choose = (name: string) => {
    setPicked(name)
    try { localStorage.setItem(LOCATION_KEY, name) } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Stock count" description="Count what is on the shelf, then post it to set ERPNext to your counted quantities." />

      <Field className="max-w-xs">
        <FieldLabel htmlFor="count-location">Location</FieldLabel>
        <Select value={location} onValueChange={choose} disabled={isLoading}>
          <SelectTrigger id="count-location" className="w-full"><SelectValue placeholder="Choose location" /></SelectTrigger>
          <SelectContent>
            {locations.map(l => <SelectItem key={l.name} value={l.name}>{l.label}{l.is_online ? ' (Shopify)' : ''}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      {posted && <PostedCount posted={posted} onClose={() => setPosted(null)} />}

      {location ? <CountSheet key={location} location={location} onPosted={setPosted} /> : <Skeleton className="h-40 rounded-xl" />}

      <RecentCounts />
    </div>
  )
}

export default function StockCountPage() {
  const { data: me, isLoading } = useMe()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Stock count" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }

  if (!me?.isManager) {
    return (
      <div className="space-y-6">
        <PageHeader title="Stock count" />
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Only stock managers can post counts</EmptyTitle>
            <EmptyDescription>A count overwrites the quantity held in ERPNext, so it is limited to stock managers. Ask a manager to run the count, or record a movement for a single change.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            <Button variant="outline" asChild><Link to="/movements">View movements</Link></Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return <CountWorkspace />
}
