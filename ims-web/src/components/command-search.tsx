import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRightIcon, BoxesIcon, PackagePlusIcon, PlusIcon, ScanLineIcon, ShoppingCartIcon } from 'lucide-react'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import { ItemThumb, StockBadge } from '@/components/common'
import { useMovementDialog } from '@/components/movement-dialog'
import { api, qs } from '@/lib/api'
import type { ItemList } from '@/lib/types'

export function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function useItemSearch(q: string, enabled = true) {
  const term = useDebounced(q.trim())
  return useQuery({
    queryKey: ['item-search', term],
    queryFn: () => api.get<ItemList>(`/items${qs({ q: term, pageSize: 8, sort: 'name' })}`).then(r => r.items),
    enabled: enabled && term.length > 0,
    staleTime: 10_000,
  })
}

export function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate()
  const { openMovement } = useMovementDialog()
  const [q, setQ] = useState('')
  const { data: results = [], isFetching } = useItemSearch(q, open)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const go = (fn: () => void) => { onOpenChange(false); setQ(''); fn() }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search inventory" description="Find a piece by SKU, name or collection">
      <CommandInput placeholder="Search SKU, name, collection…" value={q} onValueChange={setQ} />
      <CommandList>
        {q && !isFetching && <CommandEmpty>No pieces match “{q}”.</CommandEmpty>}
        {results.length > 0 && (
          <CommandGroup heading="Pieces">
            {results.map(item => (
              <CommandItem key={item.sku} value={`${item.sku} ${item.name}`} onSelect={() => go(() => navigate(`/inventory/${item.sku}`))}>
                <ItemThumb src={item.image} alt="" className="size-8" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">{item.sku} · {item.on_hand} on hand</div>
                </div>
                <StockBadge status={item.status} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!q && (
          <>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => go(() => navigate('/inventory/new'))}><PlusIcon />New piece</CommandItem>
              <CommandItem onSelect={() => go(() => openMovement({ action: 'receive' }))}><PackagePlusIcon />Receive stock</CommandItem>
              <CommandItem onSelect={() => go(() => openMovement({ action: 'sell' }))}><ShoppingCartIcon />Record a sale</CommandItem>
              <CommandItem onSelect={() => go(() => openMovement({ action: 'move' }))}><ArrowLeftRightIcon />Move stock between locations</CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Go to">
              <CommandItem onSelect={() => go(() => navigate('/inventory'))}><BoxesIcon />Inventory</CommandItem>
              <CommandItem onSelect={() => go(() => navigate('/scan'))}><ScanLineIcon />Scan a label</CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
