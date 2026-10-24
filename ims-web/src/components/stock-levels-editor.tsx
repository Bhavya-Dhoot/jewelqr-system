import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { ItemThumb } from '@/components/common'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CountResult, ItemRow, Location } from '@/lib/types'

/**
 * Spreadsheet-style editor for stock levels (pieces x locations), modelled on Medusa's
 * "edit stock levels" grid. Saving posts one ERPNext Stock Reconciliation per location that changed,
 * so every correction is in the ledger with who made it.
 */
export function StockLevelsEditor({ open, onOpenChange, items, locations }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  items: ItemRow[]
  locations: Location[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <Editor items={items} locations={locations} onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function Editor({ items, locations: unsorted, onDone }: { items: ItemRow[]; locations: Location[]; onDone: () => void }) {
  const qc = useQueryClient()
  // Default location first, then Shopify, then the rest; write-off locations last.
  const rank = (l: Location) => (l.is_default ? 0 : l.is_online ? 1 : /damaged/i.test(l.label) ? 3 : 2)
  const locations = [...unsorted].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
  const [values, setValues] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const grid = useRef<HTMLTableSectionElement>(null)
  const key = (sku: string, loc: string) => `${sku}|${loc}`
  const current = (r: ItemRow, loc: string) => r.stock[loc] || 0

  const changes = useMemo(() => {
    const out: { sku: string; loc: string; from: number; to: number }[] = []
    for (const r of items) for (const l of locations) {
      const v = values[key(r.sku, l.name)]
      if (v === undefined || v === '') continue
      const to = Number(v)
      if (Number.isInteger(to) && to >= 0 && to !== current(r, l.name)) out.push({ sku: r.sku, loc: l.name, from: current(r, l.name), to })
    }
    return out
  }, [values, items, locations])
  const net = changes.reduce((s, c) => s + c.to - c.from, 0)
  const touchedLocations = new Set(changes.map(c => c.loc))

  function move(e: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    const to = e.key === 'ArrowDown' || e.key === 'Enter' ? [row + 1, col] : e.key === 'ArrowUp' ? [row - 1, col]
      : e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length ? [row, col + 1]
        : e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0 ? [row, col - 1] : null
    if (!to) return
    const next = grid.current?.querySelector<HTMLInputElement>(`input[data-cell="${to[0]}-${to[1]}"]`)
    if (next) { e.preventDefault(); next.focus(); next.select() }
  }

  async function save() {
    setSaving(true)
    try {
      for (const loc of touchedLocations) {
        await api.post<CountResult>('/stock/counts', {
          warehouse: loc, notes: notes || 'Stock levels edited',
          lines: changes.filter(c => c.loc === loc).map(c => ({ sku: c.sku, counted: c.to })),
        })
      }
      await Promise.all(['items', 'item', 'dashboard', 'movements', 'locations', 'counts'].map(k => qc.invalidateQueries({ queryKey: [k] })))
      toast.success(`Updated ${changes.length} stock ${changes.length === 1 ? 'level' : 'levels'}`)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="flex h-[min(92dvh,52rem)] max-w-[calc(100%-1rem)] flex-col gap-0 p-0 sm:max-w-[min(72rem,calc(100%-2rem))]">
      <DialogHeader className="border-b p-5">
        <DialogTitle className="text-lg font-bold tracking-tight">Edit stock levels</DialogTitle>
        <DialogDescription>Type the quantity you actually have. Enter and the arrow keys move between cells. Only changed cells are saved, as a stock count per location.</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-foreground">
              <th className="sticky left-0 bg-background px-4 py-2 text-left text-xs font-medium text-muted-foreground">Piece</th>
              {locations.map(l => <th key={l.name} className="min-w-28 px-2 py-2 text-right text-xs font-medium whitespace-nowrap text-muted-foreground">{l.label}</th>)}
            </tr>
          </thead>
          <tbody ref={grid}>
            {items.map((r, row) => (
              <tr key={r.sku} className="border-b">
                <td className="sticky left-0 bg-background px-4 py-2">
                  <div className="flex min-w-48 items-center gap-2.5">
                    <ItemThumb src={r.image} alt="" className="size-8" />
                    <div className="min-w-0">
                      <div className="max-w-56 truncate font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{r.sku}</div>
                    </div>
                  </div>
                </td>
                {locations.map((l, col) => {
                  const k = key(r.sku, l.name)
                  const now = current(r, l.name)
                  const v = values[k]
                  const changed = v !== undefined && v !== '' && Number(v) !== now
                  return (
                    <td key={l.name} className={cn('px-2 py-1.5 text-right', changed && 'bg-accent')}>
                      <input
                        data-cell={`${row}-${col}`}
                        aria-label={`${r.sku} at ${l.label}`}
                        inputMode="numeric"
                        className={cn('h-8 w-full min-w-16 border border-transparent bg-transparent px-2 text-right tabular-nums outline-none hover:border-input focus:border-foreground', changed && 'font-semibold')}
                        value={v ?? String(now)}
                        onFocus={e => { const el = e.currentTarget; requestAnimationFrame(() => el.select()) }}
                        onChange={e => setValues(s => ({ ...s, [k]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                        onKeyDown={e => move(e, row, col)}
                      />
                      {changed && <div className="pr-2 text-[11px] text-muted-foreground tabular-nums">was {now}</div>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DialogFooter className="m-0 flex-col items-stretch gap-3 border-t p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1 space-y-2">
          <div className="text-sm tabular-nums">
            {changes.length ? <>{changes.length} changed in {touchedLocations.size} {touchedLocations.size === 1 ? 'location' : 'locations'}, net {net > 0 ? '+' : ''}{formatNumber(net)}</> : <span className="text-muted-foreground">No changes yet</span>}
          </div>
          <Textarea aria-label="Note for the stock count" placeholder="Note (optional), e.g. shelf recount after the exhibition" rows={1} value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} className="min-h-9 sm:max-w-md" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDone}>Cancel</Button>
          <Button onClick={save} disabled={!changes.length || saving}>{saving && <Spinner />}Save {changes.length || ''} {changes.length === 1 ? 'change' : 'changes'}</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}
