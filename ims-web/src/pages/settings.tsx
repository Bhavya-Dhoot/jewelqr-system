import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { LockIcon, PlusIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common'
import { useAdminMutation, useMe, useMeta } from '@/hooks/api'
import { api } from '@/lib/api'
import { formatDate, todayIso } from '@/lib/format'
import type { Meta, Settings } from '@/lib/types'

const TABS = ['general', 'categories', 'collections'] as const
const PREFIX = /^[A-Z0-9]{2,4}$/

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong')

/** Form string to number. Empty or junk gives NaN so range checks fail. */
const num = (s: string) => (s.trim() === '' ? NaN : Number(s))

function NumberField({ id, label, hint, value, onChange, error, disabled, step = 'any', placeholder }: {
  id: string; label: string; hint?: string; value: string; onChange: (v: string) => void
  error?: string; disabled?: boolean; step?: string; placeholder?: string
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type="number" inputMode="decimal" min={0} step={step} value={value} onChange={e => onChange(e.target.value)}
        disabled={disabled} placeholder={placeholder} aria-invalid={Boolean(error)} className="tabular-nums" />
      {error ? <FieldError>{error}</FieldError> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  )
}

function ListCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-xl border ${className ?? ''}`}>{children}</div>
}

/* ------------------------------------------------------------------ General */

function GeneralForm({ s, manager }: { s: Settings; manager: boolean }) {
  const [low, setLow] = useState(String(s.low_stock_default))
  const save = useAdminMutation((body: { low_stock_default: number }) => api.put('/settings', body))

  const lowN = num(low)
  const error = Number.isInteger(lowN) && lowN >= 0 && lowN <= 10000 ? '' : 'Enter a whole number from 0 to 10,000'
  const dirty = !error && lowN !== s.low_stock_default

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!dirty) return
    save.mutate({ low_stock_default: lowN }, { onSuccess: () => toast.success('Settings saved'), onError: fail })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>Defaults that apply across the shop.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField id="setting-low" label="Default low-stock level (pieces)" value={low} onChange={setLow} error={error} disabled={!manager} step="1"
              hint="Used for pieces that have no reorder level of their own." />
          </div>

          {manager && (
            <div className="flex justify-end">
              <Button type="submit" disabled={!dirty || save.isPending}>{save.isPending && <Spinner />}Save changes</Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

/* --------------------------------------------------------------- Categories */

function CategoryRow({ category, manager }: { category: Meta['categories'][number]; manager: boolean }) {
  const [prefix, setPrefix] = useState(category.prefix)
  const save = useAdminMutation((p: string) => api.put(`/categories/${encodeURIComponent(category.name)}`, { prefix: p }))
  const valid = PREFIX.test(prefix)

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
      {manager ? (
        <>
          <Input value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} maxLength={4} placeholder="e.g. EAR" autoComplete="off"
            aria-label={`SKU prefix for ${category.name}`} aria-invalid={prefix !== '' && !valid} className="w-24 font-mono uppercase" />
          <Button size="sm" className="w-16" disabled={!valid || prefix === category.prefix || save.isPending}
            onClick={() => save.mutate(prefix, { onSuccess: () => toast.success(`${category.name} prefix is now ${prefix}`), onError: fail })}>
            {save.isPending ? <Spinner /> : 'Save'}
          </Button>
        </>
      ) : <span className="font-mono text-sm">{category.prefix || '-'}</span>}
    </li>
  )
}

function CategoriesTab({ categories, manager }: { categories: Meta['categories']; manager: boolean }) {
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const add = useAdminMutation((body: { name: string; prefix: string }) => api.post('/categories', body))
  const taken = categories.some(c => c.name.toLowerCase() === name.trim().toLowerCase())
  const ready = name.trim().length >= 2 && PREFIX.test(prefix) && !taken

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    add.mutate({ name: name.trim(), prefix }, { onSuccess: () => { toast.success(`Added ${name.trim()}`); setName(''); setPrefix('') }, onError: fail })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>The SKU prefix (2 to 4 capital letters or digits) starts the SKU of every new piece in the category, for example EAR-00012. Existing SKUs keep their codes.</CardDescription>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            <ListCard>
              <div className="flex gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span className="flex-1">Category</span><span className={manager ? 'w-24' : ''}>SKU prefix</span>{manager && <span className="w-16" />}
              </div>
              <ul className="divide-y">
                {categories.map(c => <CategoryRow key={`${c.name}|${c.prefix}`} category={c} manager={manager} />)}
              </ul>
            </ListCard>
          )}
        </CardContent>
      </Card>

      {manager && (
        <Card>
          <CardHeader><CardTitle>Add category</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <Field data-invalid={taken ? true : undefined}>
                  <FieldLabel htmlFor="new-category-name">Name</FieldLabel>
                  <Input id="new-category-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Anklets" maxLength={60} autoComplete="off" aria-invalid={taken} />
                  {taken && <FieldError>This category already exists</FieldError>}
                </Field>
                <Field data-invalid={prefix !== '' && !PREFIX.test(prefix) ? true : undefined}>
                  <FieldLabel htmlFor="new-category-prefix">SKU prefix</FieldLabel>
                  <Input id="new-category-prefix" value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} placeholder="e.g. ANK" maxLength={4} autoComplete="off"
                    aria-invalid={prefix !== '' && !PREFIX.test(prefix)} className="font-mono uppercase" />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={!ready || add.isPending}>{add.isPending ? <Spinner /> : <PlusIcon />}Add category</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- Collections */

function CollectionsTab({ collections, manager }: { collections: Meta['collections']; manager: boolean }) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const toggle = useAdminMutation(({ name: n, is_active }: { name: string; is_active: boolean }) => api.put(`/collections/${encodeURIComponent(n)}`, { is_active }))
  const add = useAdminMutation((body: { name: string; launch_date: string | null }) => api.post('/collections', body))
  const taken = collections.some(c => c.name.toLowerCase() === name.trim().toLowerCase())
  const ready = name.trim().length >= 2 && !taken
  const today = todayIso()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    add.mutate({ name: name.trim(), launch_date: date || null }, { onSuccess: () => { toast.success(`Added ${name.trim()}`); setName(''); setDate('') }, onError: fail })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Collections</CardTitle>
          <CardDescription>Group pieces by season or launch. Switch a collection off when it is no longer current.</CardDescription>
        </CardHeader>
        <CardContent>
          {collections.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No collections yet.</p>
          ) : (
            <ListCard>
              <ul className="divide-y">
                {collections.map(c => {
                  const pending = toggle.isPending && toggle.variables?.name === c.name
                  const checked = pending ? (toggle.variables?.is_active ?? c.is_active) : c.is_active
                  return (
                    <li key={c.name} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {c.launch_date ? `${c.launch_date <= today ? 'Launched' : 'Launches'} ${formatDate(c.launch_date)}` : 'No launch date'}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{checked ? 'Active' : 'Inactive'}</span>
                      <Switch checked={checked} disabled={!manager || pending} aria-label={`${c.name} is active`}
                        onCheckedChange={v => toggle.mutate({ name: c.name, is_active: v }, { onError: fail })} />
                    </li>
                  )
                })}
              </ul>
            </ListCard>
          )}
        </CardContent>
      </Card>

      {manager && (
        <Card>
          <CardHeader><CardTitle>Add collection</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <Field data-invalid={taken ? true : undefined}>
                  <FieldLabel htmlFor="new-collection-name">Name</FieldLabel>
                  <Input id="new-collection-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Festive 2026" maxLength={80} autoComplete="off" aria-invalid={taken} />
                  {taken && <FieldError>This collection already exists</FieldError>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-collection-date">Launch date (optional)</FieldLabel>
                  <Input id="new-collection-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={!ready || add.isPending}>{add.isPending ? <Spinner /> : <PlusIcon />}Add collection</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- Page */

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab') ?? ''
  const tab = (TABS as readonly string[]).includes(requested) ? requested : 'general'
  const setTab = (t: string) => {
    const next = new URLSearchParams(params)
    if (t === 'general') next.delete('tab'); else next.set('tab', t)
    setParams(next, { replace: true })
  }

  const { data: me } = useMe()
  const manager = Boolean(me?.isManager)
  const { data: meta, isLoading, isError, error, refetch } = useMeta()

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Shop defaults, categories and collections that the rest of the app relies on." />

      {me && !me.isManager && (
        <Alert>
          <LockIcon />
          <AlertDescription>You can view these settings. Only stock managers can change them.</AlertDescription>
        </Alert>
      )}

      {isError ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Could not load settings</EmptyTitle>
            <EmptyDescription>{(error as Error).message}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={() => refetch()}>Try again</Button>
        </Empty>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <div className="flex max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="collections">Collections</TabsTrigger>
            </TabsList>
          </div>

          {isLoading || !meta ? (
            <div className="space-y-4"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div>
          ) : (
            <>
              <TabsContent value="general">
                <GeneralForm key={meta.settings.low_stock_default} s={meta.settings} manager={manager} />
              </TabsContent>
              <TabsContent value="categories"><CategoriesTab categories={meta.categories} manager={manager} /></TabsContent>
              <TabsContent value="collections"><CollectionsTab collections={meta.collections} manager={manager} /></TabsContent>
            </>
          )}
        </Tabs>
      )}
    </div>
  )
}
