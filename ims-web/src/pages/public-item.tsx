import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2Icon, ClockIcon, ExternalLinkIcon, GemIcon, SearchXIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { useMe } from '@/hooks/api'
import { api, ApiError } from '@/lib/api'
import { formatINR } from '@/lib/format'
import type { PublicItem } from '@/lib/types'

const SHOP_URL = 'https://www.esmecrystal.com'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-md items-center gap-2 px-4 font-semibold lg:max-w-lg">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><GemIcon className="size-4" /></div>
          Esme Crystal
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6 lg:max-w-lg lg:py-10">{children}</main>
      <footer className="px-4 py-6 text-center text-xs text-muted-foreground">Esme Crystal · Austrian crystal jewellery</footer>
    </div>
  )
}

function ShopButton({ variant = 'default' }: { variant?: 'default' | 'outline' }) {
  return (
    <Button asChild size="lg" variant={variant} className="h-11 w-full">
      <a href={SHOP_URL} target="_blank" rel="noopener noreferrer">Shop at esmecrystal.com<ExternalLinkIcon /></a>
    </Button>
  )
}

function ItemView({ item, staff }: { item: PublicItem; staff: boolean }) {
  const facets = [
    { label: 'Collection', value: item.collection },
    { label: 'Finish', value: item.finish },
    { label: 'Crystal colour', value: item.crystal_colour },
  ].filter(f => f.value)

  return (
    <article className="space-y-6">
      <div className="grid aspect-square place-items-center overflow-hidden rounded-2xl border bg-muted">
        {item.image
          ? <img src={item.image} alt={item.name} decoding="async" className="size-full object-cover" />
          : <GemIcon className="size-1/4 text-muted-foreground/60" aria-hidden />}
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{item.name}</h1>
          <p className="text-xs text-muted-foreground tabular-nums">SKU {item.sku}</p>
        </div>
        {facets.length > 0 && (
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {facets.map(f => (
              <div key={f.label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="text-sm font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {item.mrp != null && (
        <section aria-label="Price" className="rounded-xl border bg-card p-4">
          <div className="text-4xl font-semibold tracking-tight tabular-nums">{formatINR(item.mrp)}</div>
          <p className="text-xs text-muted-foreground">MRP, inclusive of all taxes</p>
        </section>
      )}

      <p className={item.available ? 'flex items-center gap-2 text-sm font-medium text-status-in' : 'flex items-center gap-2 text-sm font-medium text-muted-foreground'}>
        {item.available ? <CheckCircle2Icon className="size-4" aria-hidden /> : <ClockIcon className="size-4" aria-hidden />}
        {item.available ? 'Available' : 'Currently unavailable'}
      </p>

      {item.description && (
        <section className="space-y-1.5">
          <h2 className="text-sm font-medium">About this piece</h2>
          <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{item.description}</p>
        </section>
      )}

      <div className="space-y-2">
        <ShopButton />
        {staff && <Button asChild size="lg" variant="outline" className="h-11 w-full"><Link to={`/inventory/${item.sku}`}>Open in inventory</Link></Button>}
      </div>
    </article>
  )
}

export default function PublicItemPage() {
  const { sku = '' } = useParams()
  const { data: item, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['public-item', sku],
    queryFn: () => api.get<PublicItem>('/public/items/' + encodeURIComponent(sku)),
    retry: false,
    enabled: !!sku,
  })
  const { data: me } = useMe()

  if (isLoading) {
    return (
      <Shell>
        <div className="space-y-6">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="space-y-2"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-4 w-1/4" /></div>
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-11" />
        </div>
      </Shell>
    )
  }

  if (isError || !item) {
    const notFound = !sku || (error instanceof ApiError && error.status === 404)
    return (
      <Shell>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><SearchXIcon /></EmptyMedia>
            <EmptyTitle>{notFound ? 'We could not find this piece' : 'Something went wrong'}</EmptyTitle>
            <EmptyDescription>
              {notFound
                ? 'The label may be damaged, or this piece is no longer listed. You can browse the full collection on our website.'
                : 'We could not load this piece right now. Please try again in a moment.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {!notFound && <Button variant="outline" className="w-full" onClick={() => refetch()}>Try again</Button>}
            <ShopButton variant={notFound ? 'default' : 'outline'} />
          </EmptyContent>
        </Empty>
      </Shell>
    )
  }

  return (
    <Shell>
      <ItemView item={item} staff={!!me} />
    </Shell>
  )
}
