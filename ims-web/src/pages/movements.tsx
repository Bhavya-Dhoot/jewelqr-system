import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeftRightIcon, ArrowRightIcon, PackageMinusIcon, PackagePlusIcon, SearchIcon, ShoppingCartIcon, Undo2Icon, XIcon,
} from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageHeader } from '@/components/common'
import { useDebounced } from '@/components/command-search'
import { useMovementDialog } from '@/components/movement-dialog'
import { useCancelMovement, useMovements, type MovementFilters } from '@/hooks/api'
import { api } from '@/lib/api'
import { formatDate, formatINR, formatNumber, locationLabel, personLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Movement, MovementType } from '@/lib/types'

const PAGE_SIZE = 30
const ALL = '__all'
const TYPES: MovementType[] = ['receipt', 'issue', 'transfer']

const TYPE_META: Record<MovementType, { label: string; icon: typeof PackagePlusIcon }> = {
  receipt: { label: 'In', icon: PackagePlusIcon },
  issue: { label: 'Out', icon: PackageMinusIcon },
  transfer: { label: 'Move', icon: ArrowLeftRightIcon },
}

/** Sale value when the movement was a sale, otherwise the stock value of the entry. */
const valueOf = (m: Movement) => (m.sale_value > 0 ? m.sale_value : m.value)
const valueText = (m: Movement) => (valueOf(m) > 0 ? formatINR(valueOf(m)) : '-')

function TypeBadge({ type }: { type: MovementType }) {
  const t = TYPE_META[type]
  if (!t) return null
  return <Badge variant="secondary"><t.icon />{t.label}</Badge>
}

/** First two lines as "SKU x qty", then "+N more". */
function piecesParts(m: Movement) {
  const shown = m.lines.slice(0, 2).map(l => `${l.sku} × ${l.qty}`)
  return { shown, more: Math.max(0, m.lines.length - shown.length) }
}

function Route({ from, to }: { from: string | null; to: string | null }) {
  if (from && to) {
    return <span className="inline-flex flex-wrap items-center gap-1">{locationLabel(from)}<ArrowRightIcon className="size-3" />{locationLabel(to)}</span>
  }
  if (to) return <>Into {locationLabel(to)}</>
  if (from) return <>Out of {locationLabel(from)}</>
  return null
}

function CancelMovement({ m }: { m: Movement }) {
  const cancel = useCancelMovement()
  const [open, setOpen] = useState(false)

  async function run() {
    try {
      await cancel.mutateAsync(m.name)
      toast.success(`${m.name} cancelled`)
      setOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="w-full"><Undo2Icon />Cancel movement</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {m.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Nothing is deleted. ERPNext writes reversing entries, so the {formatNumber(m.units)} {m.units === 1 ? 'piece goes' : 'pieces go'} back
            to where {m.units === 1 ? 'it was' : 'they were'} before this movement. The original entry stays in the history, marked as cancelled.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancel.isPending}>Keep movement</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={cancel.isPending} onClick={e => { e.preventDefault(); void run() }}>
            {cancel.isPending && <Spinner />}Cancel movement
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm tabular-nums">{children}</dd>
    </div>
  )
}

function MovementDetail({ m }: { m: Movement }) {
  const partyLabel = m.type === 'receipt' ? 'Supplier' : m.type === 'issue' ? 'Customer' : 'Party'
  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm">{m.name}</span>
          <TypeBadge type={m.type} />
          {m.cancelled && <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>}
        </SheetTitle>
        <SheetDescription className="tabular-nums">{formatDate(m.date)} at {m.time} by {personLabel(m.by)}</SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Detail label="Reason">{m.reason ?? '-'}</Detail>
          <Detail label="Reference">{m.reference ?? '-'}</Detail>
          <Detail label={partyLabel}>{m.party ?? '-'}</Detail>
          <Detail label="Pieces">{formatNumber(m.units)}</Detail>
          <Detail label="Stock value">{m.value > 0 ? formatINR(m.value) : '-'}</Detail>
          {m.sale_value > 0 && <Detail label="Sale value">{formatINR(m.sale_value)}</Detail>}
        </dl>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Lines</h3>
          <ul className="divide-y rounded-lg border">
            {m.lines.map((l, i) => (
              <li key={`${l.sku}-${i}`} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/inventory/${l.sku}`} className="text-sm font-medium tabular-nums underline-offset-2 hover:underline">{l.sku}</Link>
                  <div className="truncate text-sm text-muted-foreground">{l.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground"><Route from={l.from} to={l.to} /></div>
                </div>
                <div className="text-sm font-medium tabular-nums">× {formatNumber(l.qty)}</div>
              </li>
            ))}
          </ul>
        </section>

        {m.notes && (
          <section className="space-y-1">
            <h3 className="text-sm font-medium">Notes</h3>
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{m.notes}</p>
          </section>
        )}
      </div>

      {!m.cancelled && (
        <SheetFooter className="border-t">
          <CancelMovement m={m} />
        </SheetFooter>
      )}
    </>
  )
}

export default function MovementsPage() {
  const [params, setParams] = useSearchParams()
  const { openMovement } = useMovementDialog()
  const urlQ = params.get('q') ?? ''
  const [q, setQ] = useState(urlQ)
  const debouncedQ = useDebounced(q, 250)
  const [openName, setOpenName] = useState<string | null>(null)

  const type = TYPES.find(t => t === params.get('type')) ?? ''
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1)
  const filters: MovementFilters = {
    type,
    reason: params.get('reason') ?? '',
    q: debouncedQ,
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    page,
    pageSize: PAGE_SIZE,
  }
  const { data, isLoading, isFetching, isError, error, refetch } = useMovements(filters)

  const { data: reasonMap } = useQuery({
    queryKey: ['stock-reasons'],
    queryFn: () => api.get<Record<string, string[]>>('/stock/reasons'),
    staleTime: Infinity,
  })
  const reasons = useMemo(() => {
    const all = Array.from(new Set(Object.values(reasonMap ?? {}).flat()))
    return filters.reason && !all.includes(filters.reason) ? [...all, filters.reason] : all
  }, [reasonMap, filters.reason])

  const set = (key: string, value: string) =>
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (value && value !== ALL) next.set(key, value); else next.delete(key)
      if (key !== 'page') next.delete('page')
      return next
    }, { replace: true })

  // Typing updates the URL after the debounce; a change made elsewhere (nav link, pasted URL) flows back into the box.
  useEffect(() => { if ((params.get('q') ?? '') !== debouncedQ) set('q', debouncedQ) }, [debouncedQ]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (urlQ !== debouncedQ) setQ(urlQ) }, [urlQ]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = Boolean(filters.type || filters.reason || filters.q || filters.from || filters.to)
  const rows = data?.movements ?? []
  const total = data?.total ?? 0
  // With a search term the gateway cannot count matches, so "total" is only this page: infer more pages from a full page.
  const searching = Boolean(filters.q)
  const hasNext = searching ? rows.length === PAGE_SIZE : page < Math.ceil(total / PAGE_SIZE)
  const pages = searching ? page + (hasNext ? 1 : 0) : Math.max(1, Math.ceil(total / PAGE_SIZE))
  const selected = rows.find(r => r.name === openName)

  const description = !data ? 'Loading…'
    : searching ? `${formatNumber((page - 1) * PAGE_SIZE + rows.length)}${hasNext ? '+' : ''} matching movements`
      : `${formatNumber(total)} ${filtered ? 'matching ' : ''}${total === 1 ? 'movement' : 'movements'}`

  const clearFilters = () => { setQ(''); setParams({}, { replace: true }) }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Movements"
        description={description}
        actions={
          <>
            <Button onClick={() => openMovement({ action: 'receive' })}><PackagePlusIcon />Receive</Button>
            <Button variant="outline" onClick={() => openMovement({ action: 'sell' })}><ShoppingCartIcon />Sell</Button>
            <Button variant="outline" onClick={() => openMovement({ action: 'move' })}><ArrowLeftRightIcon />Move</Button>
          </>
        }
      />

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_13rem_9.5rem_9.5rem]">
          <Field>
            <FieldLabel htmlFor="mv-search">Search</FieldLabel>
            <InputGroup>
              <InputGroupAddon><SearchIcon /></InputGroupAddon>
              <InputGroupInput id="mv-search" placeholder="Entry no., reference, supplier, customer" value={q} onChange={e => setQ(e.target.value)} />
              {q && <InputGroupAddon align="inline-end"><button type="button" onClick={() => setQ('')} aria-label="Clear search"><XIcon className="size-4" /></button></InputGroupAddon>}
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="mv-reason">Reason</FieldLabel>
            <Select value={filters.reason || ALL} onValueChange={v => set('reason', v)}>
              <SelectTrigger id="mv-reason" className="w-full"><SelectValue placeholder="All reasons" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All reasons</SelectItem>
                {reasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:contents">
            <Field>
              <FieldLabel htmlFor="mv-from">From</FieldLabel>
              <Input id="mv-from" type="date" value={filters.from} max={filters.to || undefined} onChange={e => set('from', e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="mv-to">To</FieldLabel>
              <Input id="mv-to" type="date" value={filters.to} min={filters.from || undefined} onChange={e => set('to', e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup type="single" variant="outline" value={filters.type || 'all'} onValueChange={v => v && set('type', v === 'all' ? '' : v)} aria-label="Movement type" className="w-full sm:w-fit">
            <ToggleGroupItem value="all" className="flex-1 px-3">All</ToggleGroupItem>
            <ToggleGroupItem value="receipt" className="flex-1 px-3">In</ToggleGroupItem>
            <ToggleGroupItem value="issue" className="flex-1 px-3">Out</ToggleGroupItem>
            <ToggleGroupItem value="transfer" className="flex-1 px-3">Moves</ToggleGroupItem>
          </ToggleGroup>
          {filtered && <Button variant="ghost" size="sm" onClick={clearFilters}><XIcon />Clear filters</Button>}
        </div>
      </div>

      {isError ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Could not load movements</EmptyTitle>
            <EmptyDescription>{(error as Error).message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button variant="outline" onClick={() => refetch()}>Try again</Button></EmptyContent>
        </Empty>
      ) : !isLoading && rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{filtered ? 'No movements match these filters' : 'No movements yet'}</EmptyTitle>
            <EmptyDescription>{filtered ? 'Try a different search or widen the dates.' : 'Receive, sell or move stock and it will be listed here.'}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            {filtered
              ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
              : <Button onClick={() => openMovement({ action: 'receive' })}><PackagePlusIcon />Receive stock</Button>}
          </EmptyContent>
        </Empty>
      ) : (
        <div className={isFetching && !isLoading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border lg:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Pieces</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="hidden xl:table-cell">Entry</TableHead>
                  <TableHead className="hidden pr-4 xl:table-cell">By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={9} className="px-4"><Skeleton className="h-10" /></TableCell></TableRow>
                )) : rows.map(m => {
                  const { shown, more } = piecesParts(m)
                  return (
                    <TableRow
                      key={m.name}
                      tabIndex={0}
                      className={cn('cursor-pointer', m.cancelled && 'text-muted-foreground opacity-60')}
                      onClick={() => setOpenName(m.name)}
                      onKeyDown={e => { if (e.key === 'Enter') setOpenName(m.name) }}
                    >
                      <TableCell className="pl-4 tabular-nums">
                        <div className="font-medium">{formatDate(m.date)}</div>
                        <div className="text-xs text-muted-foreground">{m.time}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <TypeBadge type={m.type} />
                          {m.cancelled && <Badge variant="outline">Cancelled</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{m.reason ?? '-'}</TableCell>
                      <TableCell>
                        <div className="max-w-[14rem] truncate">{m.reference ?? '-'}</div>
                        {m.party && <div className="max-w-[14rem] truncate text-xs text-muted-foreground">{m.party}</div>}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {shown.map(s => <div key={s}>{s}</div>)}
                        {more > 0 && <div className="text-muted-foreground">+{more} more</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(m.units)}</TableCell>
                      <TableCell className={cn('text-right tabular-nums', m.cancelled && 'line-through')}>{valueText(m)}</TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground xl:table-cell">{m.name}</TableCell>
                      <TableCell className="hidden pr-4 text-muted-foreground xl:table-cell">{personLabel(m.by)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile list */}
          <ul className="divide-y rounded-xl border lg:hidden">
            {isLoading ? Array.from({ length: 6 }).map((_, i) => <li key={i} className="p-3"><Skeleton className="h-16" /></li>) : rows.map(m => {
              const { shown, more } = piecesParts(m)
              return (
                <li key={m.name}>
                  <button
                    type="button"
                    onClick={() => setOpenName(m.name)}
                    className={cn('flex w-full items-start gap-3 p-3 text-left active:bg-muted', m.cancelled && 'opacity-60')}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <TypeBadge type={m.type} />
                        <span className="truncate text-sm font-medium">{m.reason ?? 'Movement'}</span>
                        {m.cancelled && <Badge variant="outline">Cancelled</Badge>}
                      </div>
                      {(m.reference || m.party) && <div className="truncate text-xs text-muted-foreground">{[m.reference, m.party].filter(Boolean).join(' · ')}</div>}
                      <div className="truncate text-xs tabular-nums">{shown.join(', ')}{more > 0 && <span className="text-muted-foreground"> +{more} more</span>}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{formatDate(m.date)}, {m.time} · {personLabel(m.by)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium tabular-nums">{formatNumber(m.units)} {m.units === 1 ? 'pc' : 'pcs'}</div>
                      <div className={cn('text-xs text-muted-foreground tabular-nums', m.cancelled && 'line-through')}>{valueText(m)}</div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>

          {(pages > 1 || page > 1) && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground tabular-nums">
                {searching ? `Page ${page}` : `Page ${page} of ${pages}, ${formatNumber(total)} in total`}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => set('page', String(page + 1))}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={o => { if (!o) setOpenName(null) }}>
        <SheetContent className="w-full gap-0 sm:max-w-md">
          {selected && <MovementDetail m={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}
