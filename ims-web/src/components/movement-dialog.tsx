import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ArrowLeftRightIcon, MinusIcon, PackageMinusIcon, PackagePlusIcon, PlusIcon, ScanLineIcon, ShoppingCartIcon, Trash2Icon, XIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Spinner } from '@/components/ui/spinner'
import { ItemThumb } from '@/components/common'
import { useItemSearch } from '@/components/command-search'
import { Scanner } from '@/components/scanner'
import { useMeta, usePostMovement } from '@/hooks/api'
import { api } from '@/lib/api'
import { formatINR, locationLabel, todayIso } from '@/lib/format'
import type { ItemDetail, ItemRow, MovementType } from '@/lib/types'

export type MovementAction = 'receive' | 'sell' | 'move' | 'writeoff'

const ACTIONS: Record<MovementAction, { label: string; title: string; type: MovementType; reasons: string[]; icon: typeof PlusIcon; verb: string }> = {
  receive: { label: 'Receive', title: 'Receive stock', type: 'receipt', reasons: ['Purchase', 'Production', 'Customer Return', 'Opening Stock'], icon: PackagePlusIcon, verb: 'Received' },
  sell: { label: 'Sell', title: 'Record a sale', type: 'issue', reasons: ['Sale - Store', 'Sale - Online'], icon: ShoppingCartIcon, verb: 'Sold' },
  move: { label: 'Move', title: 'Move between locations', type: 'transfer', reasons: ['Transfer'], icon: ArrowLeftRightIcon, verb: 'Moved' },
  writeoff: { label: 'Write off', title: 'Write off stock', type: 'issue', reasons: ['Damaged', 'Lost', 'Sample / Gift', 'Return to Supplier'], icon: PackageMinusIcon, verb: 'Wrote off' },
}

interface Line { sku: string; name: string; image: string | null; qty: number; rate: number | null; price: number; stock: Record<string, number> }

export interface OpenMovementOptions { action?: MovementAction; sku?: string; from?: string; to?: string }

const Ctx = createContext<{ openMovement: (o?: OpenMovementOptions) => void }>({ openMovement: () => {} })
export const useMovementDialog = () => useContext(Ctx)

export function MovementDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; opts: OpenMovementOptions; key: number }>({ open: false, opts: {}, key: 0 })
  const openMovement = useCallback((opts: OpenMovementOptions = {}) => setState(s => ({ open: true, opts, key: s.key + 1 })), [])
  const value = useMemo(() => ({ openMovement }), [openMovement])
  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={state.open} onOpenChange={open => setState(s => ({ ...s, open }))}>
        {state.open && <MovementForm key={state.key} opts={state.opts} onDone={() => setState(s => ({ ...s, open: false }))} />}
      </Dialog>
    </Ctx.Provider>
  )
}

function toLine(r: ItemRow): Line {
  return { sku: r.sku, name: r.name, image: r.image, qty: 1, rate: r.cost || null, price: r.price, stock: r.stock }
}

async function fetchLine(sku: string): Promise<Line | null> {
  try {
    const d = await api.get<ItemDetail>(`/items/${encodeURIComponent(sku)}`)
    return {
      sku: d.item.sku, name: d.item.name, image: d.item.image, qty: 1, rate: d.item.cost || null, price: d.item.mrp ?? 0,
      stock: Object.fromEntries(d.stock.map(s => [s.warehouse, s.qty])),
    }
  } catch {
    return null
  }
}

function SkuPicker({ onPick, onScan }: { onPick: (r: ItemRow) => void; onScan: () => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const { data = [], isFetching } = useItemSearch(q, open)
  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="flex-1 justify-start text-muted-foreground">
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
      <Button variant="outline" size="icon" onClick={onScan} aria-label="Scan a label"><ScanLineIcon /></Button>
    </div>
  )
}

function MovementForm({ opts, onDone }: { opts: OpenMovementOptions; onDone: () => void }) {
  const { data: meta } = useMeta()
  const post = usePostMovement()
  const [action, setAction] = useState<MovementAction>(opts.action || 'receive')
  const cfg = ACTIONS[action]
  const locations = meta?.locations ?? []
  const defaultLoc = locations.find(l => l.is_default)?.name ?? locations[0]?.name ?? ''
  const [from, setFrom] = useState(opts.from || defaultLoc)
  const [to, setTo] = useState(opts.to || (action === 'move' ? '' : defaultLoc))
  const [reason, setReason] = useState(cfg.reasons[0])
  const [lines, setLines] = useState<Line[]>([])
  const [reference, setReference] = useState('')
  const [party, setParty] = useState('')
  const [saleValue, setSaleValue] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(todayIso())
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (!from && defaultLoc) setFrom(defaultLoc); if (!to && defaultLoc && action !== 'move') setTo(defaultLoc) }, [defaultLoc]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setReason(ACTIONS[action].reasons[0]); setError(null) }, [action])
  useEffect(() => {
    if (opts.sku) fetchLine(opts.sku).then(l => l && setLines([l]))
  }, [opts.sku])

  const addLine = (l: Line) => setLines(ls => {
    const i = ls.findIndex(x => x.sku === l.sku)
    if (i >= 0) return ls.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x))
    return [...ls, l]
  })
  const onScan = async (sku: string) => {
    const l = await fetchLine(sku)
    if (l) { addLine(l); toast.success(`${l.sku} added`) } else toast.error(`No piece with SKU ${sku}`)
  }
  const update = (sku: string, patch: Partial<Line>) => setLines(ls => ls.map(l => (l.sku === sku ? { ...l, ...patch } : l)))

  const source = cfg.type === 'receipt' ? null : from
  const shortages = source ? lines.filter(l => l.qty > (l.stock[source] || 0)) : []
  const suggestedSale = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const units = lines.reduce((s, l) => s + l.qty, 0)

  async function submit() {
    setError(null)
    if (!lines.length) return setError('Add at least one piece.')
    if (cfg.type === 'transfer' && from === to) return setError('Choose two different locations.')
    if (shortages.length) return setError(`Not enough stock at ${locationLabel(source)} for ${shortages.map(s => s.sku).join(', ')}.`)
    try {
      const res = await post.mutateAsync({
        type: cfg.type,
        reason,
        from: cfg.type === 'receipt' ? null : from,
        to: cfg.type === 'issue' ? null : to,
        reference: reference || null,
        party: party || null,
        sale_value: action === 'sell' ? Number(saleValue || suggestedSale) : null,
        notes: notes || null,
        posting_date: date !== todayIso() ? date : null,
        lines: lines.map(l => ({ sku: l.sku, qty: l.qty, rate: cfg.type === 'receipt' ? l.rate : null })),
      })
      toast.success(`${cfg.verb} ${units} ${units === 1 ? 'piece' : 'pieces'}`, { description: res.name })
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const LocationSelect = ({ value, onChange, label, exclude }: { value: string; onChange: (v: string) => void; label: string; exclude?: string }) => (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Choose location" /></SelectTrigger>
        <SelectContent>
          {locations.filter(l => l.name !== exclude).map(l => <SelectItem key={l.name} value={l.name}>{l.label}{l.is_online ? ' (Shopify)' : ''}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  )

  return (
    <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
      <DialogHeader className="border-b p-5 pb-4">
        <DialogTitle>{cfg.title}</DialogTitle>
        <DialogDescription className="sr-only">Record a stock movement</DialogDescription>
        <ToggleGroup type="single" variant="outline" value={action} onValueChange={v => v && setAction(v as MovementAction)} className="mt-3 w-full">
          {(Object.keys(ACTIONS) as MovementAction[]).map(a => {
            const A = ACTIONS[a]
            return <ToggleGroupItem key={a} value={a} className="flex-1 gap-1.5"><A.icon className="hidden sm:block" />{A.label}</ToggleGroupItem>
          })}
        </ToggleGroup>
      </DialogHeader>

      <div className="space-y-5 p-5">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          {cfg.type !== 'receipt' && <LocationSelect label="From" value={from} onChange={setFrom} />}
          {cfg.type !== 'issue' && <LocationSelect label={cfg.type === 'transfer' ? 'To' : 'Into'} value={to} onChange={setTo} exclude={cfg.type === 'transfer' ? from : undefined} />}
          {cfg.reasons.length > 1 && (
            <Field>
              <FieldLabel>Reason</FieldLabel>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{cfg.reasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
        </FieldGroup>

        <div className="space-y-3">
          {scanning ? (
            <div className="space-y-2">
              <Scanner onSku={onScan} className="sm:aspect-[2/1]" />
              <Button variant="outline" size="sm" onClick={() => setScanning(false)}><XIcon />Stop scanning</Button>
            </div>
          ) : (
            <SkuPicker onPick={r => addLine(toLine(r))} onScan={() => setScanning(true)} />
          )}

          {lines.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {lines.map(l => {
                const avail = source ? l.stock[source] || 0 : null
                const short = avail != null && l.qty > avail
                return (
                  <li key={l.sku} className="flex flex-wrap items-center gap-3 p-3">
                    <ItemThumb src={l.image} alt="" className="size-9" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{l.name}</div>
                      <div className={short ? 'text-xs text-status-out' : 'text-xs text-muted-foreground'}>
                        <span className="tabular-nums">{l.sku}</span>
                        {avail != null && <> · {avail} at {locationLabel(source)}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon-sm" aria-label="Decrease" onClick={() => update(l.sku, { qty: Math.max(1, l.qty - 1) })}><MinusIcon /></Button>
                      <Input aria-label={`Quantity for ${l.sku}`} inputMode="numeric" className="h-8 w-14 text-center tabular-nums" value={l.qty}
                        onChange={e => update(l.sku, { qty: Math.max(1, Math.min(100000, Number(e.target.value.replace(/\D/g, '')) || 1)) })} />
                      <Button variant="outline" size="icon-sm" aria-label="Increase" onClick={() => update(l.sku, { qty: l.qty + 1 })}><PlusIcon /></Button>
                    </div>
                    {cfg.type === 'receipt' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Cost ₹</span>
                        <Input aria-label={`Unit cost for ${l.sku}`} inputMode="decimal" className="h-8 w-24 tabular-nums" value={l.rate ?? ''}
                          onChange={e => update(l.sku, { rate: e.target.value === '' ? null : Number(e.target.value.replace(/[^\d.]/g, '')) })} />
                      </div>
                    )}
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${l.sku}`} onClick={() => setLines(ls => ls.filter(x => x.sku !== l.sku))}><Trash2Icon /></Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          {action === 'sell' && (
            <Field>
              <FieldLabel htmlFor="mv-sale">Sale value (₹)</FieldLabel>
              <Input id="mv-sale" inputMode="decimal" placeholder={suggestedSale ? String(suggestedSale) : '0'} value={saleValue} onChange={e => setSaleValue(e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
          )}
          {(action === 'receive' || action === 'sell') && (
            <Field>
              <FieldLabel htmlFor="mv-party">{action === 'receive' ? 'Supplier' : 'Customer'}</FieldLabel>
              <Input id="mv-party" value={party} onChange={e => setParty(e.target.value)} maxLength={140} />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="mv-ref">{action === 'receive' ? 'Invoice / PO no.' : action === 'sell' ? 'Bill no.' : 'Reference'}</FieldLabel>
            <Input id="mv-ref" value={reference} onChange={e => setReference(e.target.value)} maxLength={140} />
          </Field>
          <Field>
            <FieldLabel htmlFor="mv-date">Date</FieldLabel>
            <Input id="mv-date" type="date" max={todayIso()} value={date} onChange={e => setDate(e.target.value || todayIso())} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="mv-notes">Notes</FieldLabel>
            <Textarea id="mv-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} />
          </Field>
        </FieldGroup>

        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter className="sticky bottom-0 m-0 items-center border-t bg-background p-4 sm:justify-between">
        <div className="text-sm text-muted-foreground tabular-nums">
          {units} {units === 1 ? 'piece' : 'pieces'}{action === 'sell' && suggestedSale > 0 && <> · MRP {formatINR(suggestedSale)}</>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDone}>Cancel</Button>
          <Button onClick={submit} disabled={post.isPending || !lines.length}>
            {post.isPending && <Spinner />}
            {cfg.title}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}

export function MovementLink({ name }: { name: string }) {
  return <Link to={`/movements?q=${encodeURIComponent(name)}`} className="font-mono text-xs underline-offset-2 hover:underline">{name}</Link>
}
