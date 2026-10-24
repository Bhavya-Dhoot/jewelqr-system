import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { EllipsisVerticalIcon, PlusIcon, ShoppingBagIcon, StarIcon, WarehouseIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { PageHeader } from '@/components/common'
import { useAdminMutation, useLocations, useMe } from '@/hooks/api'
import { api } from '@/lib/api'
import { formatINR, formatNumber } from '@/lib/format'

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong')

type Role = 'default_warehouse' | 'online_warehouse'

export default function LocationsPage() {
  const { data: me } = useMe()
  const manager = Boolean(me?.isManager)
  const { data, isLoading, isError, error, refetch } = useLocations()
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')

  const addLocation = useAdminMutation((name: string) => api.post('/locations', { label: name }))
  const setRole = useAdminMutation(({ key, name }: { key: Role; name: string }) => api.put('/settings', { [key]: name }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const name = label.trim()
    addLocation.mutate(name, {
      onSuccess: () => { toast.success(`Added ${name}`); setAdding(false); setLabel('') },
      onError: fail,
    })
  }

  const assign = (key: Role, name: string, shown: string) =>
    setRole.mutate({ key, name }, {
      onSuccess: () => toast.success(key === 'default_warehouse' ? `${shown} is now the default location` : `${shown} is now the Shopify location`),
      onError: fail,
    })

  const locations = data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations"
        description="Open a location to see its pieces. The default location receives opening stock for new pieces. The Shopify location is the one synced with your online store."
        actions={manager && <Button onClick={() => setAdding(true)}><PlusIcon />Add location</Button>}
      />

      {isError ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Could not load locations</EmptyTitle>
            <EmptyDescription>{(error as Error).message}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={() => refetch()}>Try again</Button>
        </Empty>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : locations.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No locations yet</EmptyTitle>
            <EmptyDescription>{manager ? 'Add the places where you keep stock, such as a shop or a stockroom.' : 'A stock manager needs to add the first location.'}</EmptyDescription>
          </EmptyHeader>
          {manager && <EmptyContent><Button onClick={() => setAdding(true)}><PlusIcon />Add location</Button></EmptyContent>}
        </Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {locations.map(l => (
            <li key={l.name} className="relative">
              <Link
                to={`/inventory?location=${encodeURIComponent(l.name)}`}
                className="block h-full rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className={manager ? 'flex items-start gap-3 pr-9' : 'flex items-start gap-3'}>
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><WarehouseIcon className="size-4" /></div>
                  <div className="min-w-0 space-y-1.5">
                    <div className="truncate font-medium">{l.label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {l.is_default && <Badge variant="secondary">Default</Badge>}
                      {l.is_online && <Badge variant="outline">Shopify</Badge>}
                    </div>
                  </div>
                </div>
                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Pieces</dt>
                    <dd className="text-lg font-semibold tracking-tight tabular-nums">{formatNumber(l.units)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">SKUs</dt>
                    <dd className="text-lg font-semibold tracking-tight tabular-nums">{formatNumber(l.skus)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Stock value</dt>
                    <dd className="text-lg font-semibold tracking-tight tabular-nums">{formatINR(l.value)}</dd>
                  </div>
                </dl>
              </Link>
              {manager && (
                <div className="absolute top-3 right-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${l.label}`} disabled={setRole.isPending}>
                        {setRole.isPending && setRole.variables?.name === l.name ? <Spinner /> : <EllipsisVerticalIcon />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-44">
                      <DropdownMenuItem disabled={l.is_default} onSelect={() => assign('default_warehouse', l.name, l.label)}><StarIcon />Make default</DropdownMenuItem>
                      <DropdownMenuItem disabled={l.is_online} onSelect={() => assign('online_warehouse', l.name, l.label)}><ShoppingBagIcon />Use for Shopify</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={adding} onOpenChange={o => { if (!addLocation.isPending) { setAdding(o); if (!o) setLabel('') } }}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Add location</DialogTitle>
              <DialogDescription>A location is any place you hold stock, for example a shop, a workshop or a stockroom.</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="location-label">Name</FieldLabel>
              <Input id="location-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="Mumbai pop-up" maxLength={60} autoFocus autoComplete="off" />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={addLocation.isPending} onClick={() => { setAdding(false); setLabel('') }}>Cancel</Button>
              <Button type="submit" disabled={label.trim().length < 2 || addLocation.isPending}>
                {addLocation.isPending && <Spinner />}Add location
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
