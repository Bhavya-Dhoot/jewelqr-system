import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { LockIcon, PlusIcon } from 'lucide-react'
import { LineChart, Line } from '@/components/charts/line-chart'
import { Grid } from '@/components/charts/grid'
import { XAxis } from '@/components/charts/x-axis'
import { ChartTooltip } from '@/components/charts/tooltip'
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
import { PageHeader, Stat } from '@/components/common'
import { useAdminMutation, useGoldHistory, useMe, useMeta } from '@/hooks/api'
import { api } from '@/lib/api'
import { formatDate, formatINR, todayIso } from '@/lib/format'
import type { Meta, Settings, StoneType } from '@/lib/types'

const TABS = ['pricing', 'stone-types', 'categories', 'collections'] as const
const PREFIX = /^[A-Z0-9]{2,4}$/
const STONE_CODE = /^[a-z0-9_-]{1,30}$/

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

/* ------------------------------------------------------------------ Pricing */

function PricingForm({ s, manager }: { s: Settings; manager: boolean }) {
  const [gold, setGold] = useState('')
  const [labour, setLabour] = useState(String(s.labour_rate_per_g))
  const [tax, setTax] = useState(String(s.tax_percent))
  const [low, setLow] = useState(String(s.low_stock_default))
  const save = useAdminMutation((body: Record<string, number>) => api.put('/rates', body))

  const goldN = num(gold), labourN = num(labour), taxN = num(tax), lowN = num(low)
  const errors = {
    gold: gold.trim() !== '' && !(goldN > 0 && goldN <= 1e6) ? 'Enter a rate above 0' : '',
    labour: !(labourN >= 0 && labourN <= 1e6) ? 'Enter 0 or more' : '',
    tax: !(taxN >= 0 && taxN <= 50) ? 'Enter a percentage from 0 to 50' : '',
    low: !(Number.isInteger(lowN) && lowN >= 0 && lowN <= 10000) ? 'Enter a whole number from 0 to 10,000' : '',
  }
  const valid = !Object.values(errors).some(Boolean)

  const changes: Record<string, number> = {}
  if (gold.trim() !== '' && !errors.gold) changes.gold_rate_24k = goldN
  if (!errors.labour && labourN !== s.labour_rate_per_g) changes.labour_rate_per_g = labourN
  if (!errors.tax && taxN !== s.tax_percent) changes.tax_percent = taxN
  if (!errors.low && lowN !== s.low_stock_default) changes.low_stock_default = lowN
  const dirty = Object.keys(changes).length > 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || !dirty) return
    save.mutate(changes, { onSuccess: () => toast.success(changes.gold_rate_24k ? 'Rates saved and today\'s gold rate recorded' : 'Rates saved'), onError: fail })
  }

  const stale = s.gold_rate_date && s.gold_rate_date !== todayIso()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rates</CardTitle>
        <CardDescription>These rates price every piece set to Metal Rate: gold weight at the 24K rate, plus making charge, stones and tax. Fixed MRP pieces are unaffected.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 rounded-lg bg-muted/50 p-4">
            <Stat
              label="Gold 24K rate per gram"
              value={s.gold_rate_24k > 0 ? formatINR(s.gold_rate_24k) : 'Not set'}
              hint={s.gold_rate_date ? `Last updated ${formatDate(s.gold_rate_date)}` : 'No rate recorded yet'}
            />
            {stale && <span className="text-sm font-medium text-status-low">Not updated today</span>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField id="rate-gold" label="Record today's gold rate (INR per gram, 24K)" value={gold} onChange={setGold} error={errors.gold}
              disabled={!manager} placeholder={s.gold_rate_24k > 0 ? String(s.gold_rate_24k) : 'e.g. 7200'} hint="Leave empty to keep the current rate." />
            <NumberField id="rate-labour" label="Making charge (INR per gram)" value={labour} onChange={setLabour} error={errors.labour} disabled={!manager} />
            <NumberField id="rate-tax" label="Tax (%)" value={tax} onChange={setTax} error={errors.tax} disabled={!manager} />
            <NumberField id="rate-low" label="Default low-stock level (pieces)" value={low} onChange={setLow} error={errors.low} disabled={!manager} step="1"
              hint="Used for pieces that have no reorder level of their own." />
          </div>

          {manager && (
            <div className="flex justify-end">
              <Button type="submit" disabled={!dirty || !valid || save.isPending}>{save.isPending && <Spinner />}Save changes</Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function GoldHistory() {
  const { data, isLoading } = useGoldHistory()
  const points = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const h of data ?? []) byDate.set(h.date, h.rate)
    return [...byDate].map(([d, rate]) => ({ date: new Date(`${d}T00:00:00`), rate }))
  }, [data])
  const rates = points.map(p => p.rate)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gold rate history</CardTitle>
        <CardDescription>24K rate per gram as recorded each day</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="aspect-[2/1] w-full" /> : points.length >= 2 ? (
          <>
            <LineChart data={points} aspectRatio="2 / 1" margin={{ top: 16, right: 12, bottom: 32, left: 12 }} revealSignature={String(points.length)}>
              <Grid horizontal />
              <Line dataKey="rate" stroke="var(--chart-1)" />
              <XAxis />
              <ChartTooltip rows={p => [{ label: 'Gold 24K per gram', value: formatINR(Number(p.rate)), color: 'var(--chart-1)' }]} />
            </LineChart>
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {points.length} days recorded, from {formatINR(Math.min(...rates))} to {formatINR(Math.max(...rates))}
            </p>
          </>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">The chart appears once the gold rate has been recorded on at least two different days.</p>
        )}
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------- Stone types */

const STONE_COLS = 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem_5rem]'

function StoneRow({ stone, manager }: { stone: StoneType; manager: boolean }) {
  const [label, setLabel] = useState(stone.label)
  const [natural, setNatural] = useState(String(stone.natural_rate))
  const [lab, setLab] = useState(String(stone.lab_rate))
  const [active, setActive] = useState(stone.is_active)
  const save = useAdminMutation((body: Record<string, unknown>) => api.put(`/stone-types/${encodeURIComponent(stone.code)}`, body))

  const n = num(natural), l = num(lab)
  const bad = { label: !label.trim(), natural: !(n >= 0 && n <= 1e8), lab: !(l >= 0 && l <= 1e8) }
  const body: Record<string, unknown> = {}
  if (label.trim() !== stone.label) body.label = label.trim()
  if (n !== stone.natural_rate) body.natural_rate = n
  if (l !== stone.lab_rate) body.lab_rate = l
  if (active !== stone.is_active) body.is_active = active
  const dirty = Object.keys(body).length > 0

  const id = `stone-${stone.code}`
  return (
    <li className={`grid grid-cols-2 gap-3 p-3 md:items-center md:px-4 ${STONE_COLS}`}>
      <Field className="col-span-2 md:col-span-1">
        <FieldLabel htmlFor={`${id}-label`} className="md:sr-only">Name</FieldLabel>
        <Input id={`${id}-label`} value={label} onChange={e => setLabel(e.target.value)} disabled={!manager} maxLength={60} aria-invalid={bad.label} />
        <FieldDescription className="text-xs">Code: {stone.code}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-natural`} className="md:sr-only">Natural per ct</FieldLabel>
        <Input id={`${id}-natural`} type="number" inputMode="decimal" min={0} step="any" value={natural} onChange={e => setNatural(e.target.value)}
          disabled={!manager} aria-invalid={bad.natural} className="tabular-nums" />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-lab`} className="md:sr-only">Lab-grown per ct</FieldLabel>
        <Input id={`${id}-lab`} type="number" inputMode="decimal" min={0} step="any" value={lab} onChange={e => setLab(e.target.value)}
          disabled={!manager} aria-invalid={bad.lab} className="tabular-nums" />
      </Field>
      <Field orientation="horizontal" className="md:justify-center">
        <FieldLabel htmlFor={`${id}-active`} className="md:sr-only">Active</FieldLabel>
        <Switch id={`${id}-active`} checked={active} onCheckedChange={setActive} disabled={!manager} />
      </Field>
      <div className="flex justify-end">
        {manager && (
          <Button size="sm" disabled={!dirty || bad.label || bad.natural || bad.lab || save.isPending}
            onClick={() => save.mutate(body, { onSuccess: () => toast.success(`${label.trim()} saved`), onError: fail })}>
            {save.isPending && <Spinner />}Save
          </Button>
        )}
      </div>
    </li>
  )
}

function AddStoneType({ existing }: { existing: string[] }) {
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [natural, setNatural] = useState('')
  const [lab, setLab] = useState('')
  const add = useAdminMutation((body: Record<string, unknown>) => api.post('/stone-types', body))

  const n = num(natural), l = num(lab)
  const errors = {
    code: code && !STONE_CODE.test(code) ? 'Use lowercase letters, digits, underscore or hyphen (up to 30)' : existing.includes(code) ? 'This code is already in use' : '',
    natural: natural.trim() !== '' && !(n >= 0 && n <= 1e8) ? 'Enter 0 or more' : '',
    lab: lab.trim() !== '' && !(l >= 0 && l <= 1e8) ? 'Enter 0 or more' : '',
  }
  const ready = STONE_CODE.test(code) && label.trim() !== '' && !Object.values(errors).some(Boolean)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    add.mutate(
      { code, label: label.trim(), ...(natural.trim() !== '' ? { natural_rate: n } : {}), ...(lab.trim() !== '' ? { lab_rate: l } : {}) },
      { onSuccess: () => { toast.success(`Added ${label.trim()}`); setCode(''); setLabel(''); setNatural(''); setLab('') }, onError: fail },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add stone type</CardTitle>
        <CardDescription>Rates are optional now and can be edited above later.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field data-invalid={errors.code ? true : undefined}>
              <FieldLabel htmlFor="new-stone-code">Code</FieldLabel>
              <Input id="new-stone-code" value={code} onChange={e => setCode(e.target.value.toLowerCase())} placeholder="e.g. ruby" maxLength={30} autoComplete="off" aria-invalid={Boolean(errors.code)} />
              {errors.code && <FieldError>{errors.code}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="new-stone-label">Name</FieldLabel>
              <Input id="new-stone-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Ruby" maxLength={60} autoComplete="off" />
            </Field>
            <NumberField id="new-stone-natural" label="Natural rate per ct (INR)" value={natural} onChange={setNatural} error={errors.natural} />
            <NumberField id="new-stone-lab" label="Lab-grown rate per ct (INR)" value={lab} onChange={setLab} error={errors.lab} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={!ready || add.isPending}>{add.isPending ? <Spinner /> : <PlusIcon />}Add stone type</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function StoneTypesTab({ stones, manager }: { stones: StoneType[]; manager: boolean }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Stone types</CardTitle>
          <CardDescription>Per carat rates in INR. A piece with stones is priced from its stone weights and these rates.</CardDescription>
        </CardHeader>
        <CardContent>
          {stones.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No stone types yet.</p>
          ) : (
            <ListCard>
              <div className={`hidden gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid ${STONE_COLS}`}>
                <span>Stone</span><span>Natural per ct</span><span>Lab-grown per ct</span><span className="text-center">Active</span><span />
              </div>
              <ul className="divide-y">
                {stones.map(s => <StoneRow key={`${s.code}|${s.label}|${s.natural_rate}|${s.lab_rate}|${s.is_active}`} stone={s} manager={manager} />)}
              </ul>
            </ListCard>
          )}
        </CardContent>
      </Card>
      {manager && <AddStoneType existing={stones.map(s => s.code)} />}
    </div>
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
  const tab = (TABS as readonly string[]).includes(requested) ? requested : 'pricing'
  const setTab = (t: string) => {
    const next = new URLSearchParams(params)
    if (t === 'pricing') next.delete('tab'); else next.set('tab', t)
    setParams(next, { replace: true })
  }

  const { data: me } = useMe()
  const manager = Boolean(me?.isManager)
  const { data: meta, isLoading, isError, error, refetch } = useMeta()

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Rates, stone types, categories and collections that the rest of the app relies on." />

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
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              <TabsTrigger value="stone-types">Stone types</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="collections">Collections</TabsTrigger>
            </TabsList>
          </div>

          {isLoading || !meta ? (
            <div className="space-y-4"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div>
          ) : (
            <>
              <TabsContent value="pricing" className="space-y-4">
                <PricingForm
                  key={[meta.settings.gold_rate_24k, meta.settings.gold_rate_date, meta.settings.labour_rate_per_g, meta.settings.tax_percent, meta.settings.low_stock_default].join('|')}
                  s={meta.settings}
                  manager={manager}
                />
                <GoldHistory />
              </TabsContent>
              <TabsContent value="stone-types"><StoneTypesTab stones={meta.stoneTypes} manager={manager} /></TabsContent>
              <TabsContent value="categories"><CategoriesTab categories={meta.categories} manager={manager} /></TabsContent>
              <TabsContent value="collections"><CollectionsTab collections={meta.collections} manager={manager} /></TabsContent>
            </>
          )}
        </Tabs>
      )}
    </div>
  )
}
