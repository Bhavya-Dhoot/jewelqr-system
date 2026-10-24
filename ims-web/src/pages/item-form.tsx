import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PlusIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageHeader } from '@/components/common'
import { printLabels } from '@/components/qr-label'
import { useItem, useMeta, useSaveItem } from '@/hooks/api'
import { ApiError, api } from '@/lib/api'
import { formatDate, formatINR, formatNumber } from '@/lib/format'
import type { ItemDetail, ItemInput, Meta, PricingMode } from '@/lib/types'

const NONE = '__none'
const MAX_STONES = 6
const PURITIES = ['24K', '22K', '18K', '14K']
// Same factors as ims-gateway/src/pricing.js, so the preview matches the saved price.
const PURITY_FACTORS: Record<string, number> = { '24K': 0.999, '22K': 0.9167, '18K': 0.75, '14K': 0.583 }
const SKU_RE = /^[A-Z0-9][A-Z0-9-]{1,39}$/

interface StoneRow { stone_type: string; source: 'Natural' | 'Lab-grown'; weight_ct: string }

interface FormState {
  name: string
  category: string
  sku: string
  collection: string
  finish: string
  crystal_colour: string
  description: string
  pricing_mode: PricingMode
  mrp: string
  cost: string
  metal_purity: string
  metal_weight_g: string
  stones: StoneRow[]
  opening_qty: string
  opening_warehouse: string
  reorder_level: string
  reorder_qty: string
}

type Errors = Record<string, string>

function initialState(meta: Meta, detail?: ItemDetail): FormState {
  const defaultLoc = meta.locations.find(l => l.is_default)?.name ?? meta.locations[0]?.name ?? ''
  if (!detail) {
    return {
      name: '', category: '', sku: '', collection: '', finish: '', crystal_colour: '', description: '',
      pricing_mode: 'Fixed MRP', mrp: '', cost: '', metal_purity: '', metal_weight_g: '', stones: [],
      opening_qty: '', opening_warehouse: defaultLoc, reorder_level: '', reorder_qty: '',
    }
  }
  const i = detail.item
  return {
    name: i.name,
    category: i.category,
    sku: '',
    collection: i.collection ?? '',
    finish: i.finish ?? '',
    crystal_colour: i.crystal_colour ?? '',
    description: i.description,
    pricing_mode: i.pricing_mode,
    mrp: i.mrp != null ? String(i.mrp) : '',
    cost: i.cost ? String(i.cost) : '',
    metal_purity: i.metal_purity ?? '',
    metal_weight_g: i.metal_weight_g ? String(i.metal_weight_g) : '',
    stones: i.stones.map(s => ({ stone_type: s.stone_type, source: s.source, weight_ct: String(s.weight_ct) })),
    opening_qty: '',
    opening_warehouse: defaultLoc,
    reorder_level: i.reorder_level != null ? String(i.reorder_level) : '',
    reorder_qty: i.reorder_qty != null ? String(i.reorder_qty) : '',
  }
}

const toNum = (s: string) => (s.trim() === '' ? null : Number(s))

/** Returns an error message, or null when the (possibly empty) value is fine. Required-ness is the caller's job. */
function checkNumber(s: string, o: { min?: number; gt?: number; max: number; int?: boolean }): string | null {
  if (s.trim() === '') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return 'Enter a number'
  if (o.int && !Number.isInteger(n)) return 'Enter a whole number'
  if (o.gt != null && n <= o.gt) return `Must be more than ${o.gt}`
  if (o.gt == null && n < (o.min ?? 0)) return `Must be ${o.min ?? 0} or more`
  if (n > o.max) return `Must be ${formatNumber(o.max)} or less`
  return null
}

/** Mirrors the Joi schema in ims-gateway/src/routes/items.js. Keys are in on-screen order. */
function validate(f: FormState, isEdit: boolean): Errors {
  const e: Errors = {}
  const name = f.name.trim()
  if (name.length < 2) e.name = 'Enter a name of at least 2 characters'
  else if (name.length > 140) e.name = 'Name must be 140 characters or fewer'
  if (!f.category) e.category = 'Choose a category'
  if (!isEdit && f.sku.trim() && !SKU_RE.test(f.sku.trim().toUpperCase())) {
    e.sku = 'Use 2 to 40 letters, digits or dashes, starting with a letter or digit'
  }

  const fixed = f.pricing_mode === 'Fixed MRP'
  if (fixed) {
    const mrp = checkNumber(f.mrp, { max: 1e8 })
    if (mrp) e.mrp = mrp
  } else {
    if (!f.metal_purity) e.metal_purity = 'Choose a gold purity'
    if (f.metal_weight_g.trim() === '') e.metal_weight_g = 'Enter the gold weight'
    else {
      const w = checkNumber(f.metal_weight_g, { gt: 0, max: 10000 })
      if (w) e.metal_weight_g = w
    }
    f.stones.forEach((s, i) => {
      if (!s.stone_type) e[`stone_${i}_type`] = 'Choose a stone type'
      if (s.weight_ct.trim() === '') e[`stone_${i}_weight`] = 'Enter the weight'
      else {
        const w = checkNumber(s.weight_ct, { gt: 0, max: 100 })
        if (w) e[`stone_${i}_weight`] = w
      }
    })
  }
  const cost = checkNumber(f.cost, { max: 1e8 })
  if (cost) e.cost = cost

  if (!isEdit) {
    const q = checkNumber(f.opening_qty, { int: true, max: 100000 })
    if (q) e.opening_qty = q
  }
  const rl = checkNumber(f.reorder_level, { int: true, max: 100000 })
  if (rl) e.reorder_level = rl
  const rq = checkNumber(f.reorder_qty, { int: true, max: 100000 })
  if (rq) e.reorder_qty = rq
  return e
}

/** Client-side copy of computePrice() in ims-gateway/src/pricing.js (Metal Rate branch). */
function computePreview(f: FormState, meta: Meta) {
  const s = meta.settings
  const weight = Number(f.metal_weight_g) || 0
  const factor = PURITY_FACTORS[f.metal_purity] ?? PURITY_FACTORS['18K']
  const lines: { label: string; value: number }[] = []
  lines.push({ label: `Gold ${f.metal_purity || '18K'} · ${weight} g`, value: Math.round(weight * s.gold_rate_24k * factor) })

  const missing: string[] = []
  for (const row of f.stones) {
    const ct = Number(row.weight_ct) || 0
    if (!row.stone_type || ct <= 0) continue
    const type = meta.stoneTypes.find(t => t.code === row.stone_type)
    if (!type) { missing.push(row.stone_type); continue }
    const rate = row.source === 'Lab-grown' ? type.lab_rate : type.natural_rate
    lines.push({ label: `${type.label} (${row.source}) · ${ct} ct`, value: Math.round(ct * rate) })
  }
  lines.push({ label: 'Making charges', value: Math.round(weight * s.labour_rate_per_g) })

  const subtotal = lines.reduce((sum, l) => sum + l.value, 0)
  const tax = Math.round(subtotal * s.tax_percent / 100)
  return { lines, subtotal, tax, total: subtotal + tax, missing }
}

const numberProps = {
  type: 'number',
  inputMode: 'decimal',
  min: 0,
  step: 'any',
  onWheel: (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur(),
} as const

const wholeProps = { ...numberProps, inputMode: 'numeric', step: 1 } as const

// ---------- page shell: waits for data, then mounts the form with it ----------

export default function ItemFormPage() {
  const { sku } = useParams()
  const isEdit = !!sku
  const meta = useMeta()
  const item = useItem(sku)

  if (isEdit && item.isError) {
    if (item.error instanceof ApiError && item.error.status === 404) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No piece with SKU {sku}</EmptyTitle>
            <EmptyDescription>There is nothing to edit here.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button variant="outline" asChild><Link to="/inventory">Back to Inventory</Link></Button></EmptyContent>
        </Empty>
      )
    }
    return <LoadError message={(item.error as Error).message} onRetry={() => item.refetch()} />
  }
  if (meta.isError) return <LoadError message={(meta.error as Error).message} onRetry={() => meta.refetch()} />
  if (!meta.data || (isEdit && !item.data)) return <FormSkeleton />

  return <ItemForm key={sku ?? 'new'} meta={meta.data} detail={item.data} sku={sku} />
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>Could not load the form</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button variant="outline" onClick={onRetry}>Try again</Button>
        <Button variant="ghost" asChild><Link to="/inventory">Back to Inventory</Link></Button>
      </EmptyContent>
    </Empty>
  )
}

function FormSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-5" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}

// ---------- small layout helpers ----------

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

/** Label above the control, optional help, and the field error underneath. The control must use id `f-${k}`. */
function F({ k, label, required, error, help, className, children }: {
  k: string; label: string; required?: boolean; error?: string; help?: ReactNode; className?: string; children: ReactNode
}) {
  return (
    <Field data-invalid={!!error} className={className}>
      <FieldLabel htmlFor={`f-${k}`}>
        {label}
        {required && <span className="text-destructive" aria-hidden>*</span>}
      </FieldLabel>
      {children}
      {error ? <FieldError id={`f-${k}-error`}>{error}</FieldError> : help ? <FieldDescription id={`f-${k}-help`}>{help}</FieldDescription> : null}
    </Field>
  )
}

// ---------- the form ----------

function ItemForm({ meta, detail, sku }: { meta: Meta; detail?: ItemDetail; sku?: string }) {
  const isEdit = !!sku
  const navigate = useNavigate()
  const save = useSaveItem(sku)
  const [initial] = useState<FormState>(() => initialState(meta, detail))
  const [form, setForm] = useState<FormState>(initial)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(f => ({ ...f, [key]: value }))
  const setStone = (i: number, patch: Partial<StoneRow>) => setForm(f => ({ ...f, stones: f.stones.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
  const addStone = () => setForm(f => (f.stones.length >= MAX_STONES ? f : { ...f, stones: [...f.stones, { stone_type: '', source: 'Natural', weight_ct: '' }] }))
  const removeStone = (i: number) => setForm(f => ({ ...f, stones: f.stones.filter((_, j) => j !== i) }))

  const errors = useMemo(() => validate(form, isEdit), [form, isEdit])
  const err = (k: string) => (submitted ? errors[k] : undefined)
  /** id + aria wiring for a control inside <F k={k}>. */
  const ctl = (k: string, help = false) => ({
    id: `f-${k}`,
    'aria-invalid': !!err(k),
    'aria-describedby': err(k) ? `f-${k}-error` : help ? `f-${k}-help` : undefined,
  })

  const skuPreview = useQuery({
    queryKey: ['next-sku', form.category],
    queryFn: () => api.get<{ sku: string }>('/items/next-sku?category=' + encodeURIComponent(form.category)),
    enabled: !isEdit && !!form.category,
    staleTime: 0,
    gcTime: 0,
  })

  const fixed = form.pricing_mode === 'Fixed MRP'
  const preview = useMemo(() => (fixed ? null : computePreview(form, meta)), [fixed, form, meta])
  const mrpN = toNum(form.mrp)
  const costN = toNum(form.cost)
  const margin = mrpN != null && costN != null && Number.isFinite(mrpN) && Number.isFinite(costN) && mrpN > 0 ? ((mrpN - costN) / mrpN) * 100 : null

  useEffect(() => {
    if (serverError) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [serverError])

  const withCurrent = (list: string[], current: string) => (current && !list.includes(current) ? [...list, current] : list)
  const categories = withCurrent(meta.categories.map(c => c.name), form.category)
  const collections = withCurrent(meta.collections.filter(c => c.is_active).map(c => c.name), form.collection)
  const finishes = withCurrent(meta.finishes, form.finish)

  const skuHelp = form.sku.trim()
    ? 'This SKU will be used exactly as typed.'
    : !form.category
      ? 'Pick a category to preview the next SKU. Leave this blank to generate one automatically.'
      : skuPreview.isPending
        ? 'Looking up the next SKU…'
        : skuPreview.data
          ? `Leave blank to use ${skuPreview.data.sku}, the next free SKU in ${form.category}.`
          : 'Leave blank to generate one automatically.'

  function submit(ev: FormEvent) {
    ev.preventDefault()
    setServerError(null)
    setSubmitted(true)
    const first = Object.keys(errors)[0]
    if (first) {
      document.getElementById(`f-${first}`)?.focus()
      return
    }

    const name = form.name.trim()
    const input: ItemInput = {
      name,
      category: form.category,
      collection: form.collection || null,
      finish: form.finish || null,
      crystal_colour: form.crystal_colour.trim() || null,
      pricing_mode: form.pricing_mode,
      reorder_level: toNum(form.reorder_level),
      reorder_qty: toNum(form.reorder_qty),
      ...(fixed
        ? { mrp: toNum(form.mrp), metal_purity: null, metal_weight_g: null, stones: [] }
        : {
            metal_purity: form.metal_purity,
            metal_weight_g: Number(form.metal_weight_g),
            stones: form.stones.map(s => ({ stone_type: s.stone_type, source: s.source, weight_ct: Number(s.weight_ct) })),
          }),
    }
    // The gateway strips HTML from descriptions and returns a moving-average cost, so only write these back when edited.
    if (!isEdit || form.description !== initial.description) input.description = form.description.trim() || null
    if (!isEdit || form.cost !== initial.cost) input.cost = toNum(form.cost)
    if (!isEdit) {
      const override = form.sku.trim().toUpperCase()
      if (override) input.sku = override
      const qty = toNum(form.opening_qty)
      if (qty && qty > 0) input.opening = { warehouse: form.opening_warehouse || undefined, qty }
    }
    const price = fixed ? (mrpN ?? 0) : (preview?.total ?? 0)

    save.mutate(input, {
      onSuccess: res => {
        if (isEdit) {
          toast.success(`${name} saved`)
        } else {
          toast.success(`${name} added as ${res.sku}`, {
            duration: 10000,
            action: {
              label: 'Print label',
              onClick: () => { void printLabels([{ sku: res.sku, name, url: `${meta.publicUrl}/s/${res.sku}`, price }]) },
            },
          })
        }
        navigate(`/inventory/${encodeURIComponent(res.sku)}`)
      },
      onError: e => setServerError(e.message),
    })
  }

  const s = meta.settings
  const previewReady = !!form.metal_purity && Number(form.metal_weight_g) > 0

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={isEdit ? 'Edit piece' : 'New piece'}
        description={isEdit && detail ? `${detail.item.sku} · Fields marked * are required.` : 'Fields marked * are required.'}
      />

      {serverError && (
        <div ref={errorRef}>
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Could not save this piece</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        </div>
      )}

      <Section title="Basics">
        <F k="name" label="Name" required error={err('name')}>
          <Input {...ctl('name')} aria-required value={form.name} onChange={e => set('name', e.target.value)} maxLength={140} autoComplete="off" />
        </F>
        <F k="category" label="Category" required error={err('category')}>
          <Select value={form.category} onValueChange={v => set('category', v)}>
            <SelectTrigger {...ctl('category')} aria-required><SelectValue placeholder="Choose a category" /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </F>
        {!isEdit && (
          <F k="sku" label="SKU" error={err('sku')} help={skuHelp}>
            <Input
              {...ctl('sku', true)}
              value={form.sku}
              onChange={e => set('sku', e.target.value.toUpperCase())}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="tabular-nums"
            />
          </F>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <F k="collection" label="Collection">
            <Select value={form.collection || NONE} onValueChange={v => set('collection', v === NONE ? '' : v)}>
              <SelectTrigger {...ctl('collection')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {collections.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F k="finish" label="Finish">
            <Select value={form.finish || NONE} onValueChange={v => set('finish', v === NONE ? '' : v)}>
              <SelectTrigger {...ctl('finish')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {finishes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
        </div>
        <F k="crystal_colour" label="Crystal colour">
          <Input {...ctl('crystal_colour')} value={form.crystal_colour} onChange={e => set('crystal_colour', e.target.value)} maxLength={60} autoComplete="off" />
        </F>
        <F k="description" label="Description">
          <Textarea {...ctl('description')} value={form.description} onChange={e => set('description', e.target.value)} maxLength={2000} rows={3} />
        </F>
      </Section>

      <Section title="Pricing" description="Choose how the price of this piece is worked out.">
        <ToggleGroup
          type="single"
          variant="outline"
          value={form.pricing_mode}
          onValueChange={v => v && set('pricing_mode', v as PricingMode)}
          aria-label="Pricing mode"
        >
          <ToggleGroupItem value="Fixed MRP">Fixed MRP</ToggleGroupItem>
          <ToggleGroupItem value="Metal Rate">Metal Rate</ToggleGroupItem>
        </ToggleGroup>

        {fixed ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <F k="mrp" label="MRP (INR)" error={err('mrp')} help="Price including taxes.">
                <InputGroup>
                  <InputGroupAddon><InputGroupText>₹</InputGroupText></InputGroupAddon>
                  <InputGroupInput {...numberProps} {...ctl('mrp', true)} className="tabular-nums" value={form.mrp} onChange={e => set('mrp', e.target.value)} />
                </InputGroup>
              </F>
              <F k="cost" label="Unit cost (INR)" error={err('cost')} help="What one piece costs you.">
                <InputGroup>
                  <InputGroupAddon><InputGroupText>₹</InputGroupText></InputGroupAddon>
                  <InputGroupInput {...numberProps} {...ctl('cost', true)} className="tabular-nums" value={form.cost} onChange={e => set('cost', e.target.value)} />
                </InputGroup>
              </F>
            </div>
            <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {margin != null && mrpN != null && costN != null
                ? <>Margin <span className="font-medium text-foreground">{margin.toFixed(1)}%</span> ({formatINR(mrpN - costN)} per piece)</>
                : 'Enter an MRP and a unit cost to see the margin.'}
            </p>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <F k="metal_purity" label="Gold purity" required error={err('metal_purity')}>
                <Select value={form.metal_purity} onValueChange={v => set('metal_purity', v)}>
                  <SelectTrigger {...ctl('metal_purity')} aria-required><SelectValue placeholder="Purity" /></SelectTrigger>
                  <SelectContent>
                    {PURITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
              <F k="metal_weight_g" label="Gold weight" required error={err('metal_weight_g')}>
                <InputGroup>
                  <InputGroupInput {...numberProps} {...ctl('metal_weight_g')} aria-required className="tabular-nums" value={form.metal_weight_g} onChange={e => set('metal_weight_g', e.target.value)} />
                  <InputGroupAddon align="inline-end"><InputGroupText>g</InputGroupText></InputGroupAddon>
                </InputGroup>
              </F>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">Stones <span className="font-normal text-muted-foreground tabular-nums">({form.stones.length} of {MAX_STONES})</span></div>
                <Button type="button" variant="outline" size="sm" onClick={addStone} disabled={form.stones.length >= MAX_STONES}>
                  <PlusIcon />Add stone
                </Button>
              </div>
              {form.stones.length === 0 && (
                <p className="text-sm text-muted-foreground">No stones. Add one if this piece has natural or lab-grown stones.</p>
              )}
              {form.stones.map((row, i) => (
                <div key={i} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Stone {i + 1}</span>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeStone(i)} aria-label={`Remove stone ${i + 1}`}>
                      <Trash2Icon />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <F k={`stone_${i}_type`} label="Stone type" required error={err(`stone_${i}_type`)} className="col-span-2 sm:col-span-1">
                      <Select value={row.stone_type} onValueChange={v => setStone(i, { stone_type: v })}>
                        <SelectTrigger {...ctl(`stone_${i}_type`)} aria-required><SelectValue placeholder="Choose a stone" /></SelectTrigger>
                        <SelectContent>
                          {meta.stoneTypes.filter(t => t.is_active || t.code === row.stone_type).map(t => (
                            <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </F>
                    <F k={`stone_${i}_source`} label="Source">
                      <Select value={row.source} onValueChange={v => setStone(i, { source: v as StoneRow['source'] })}>
                        <SelectTrigger id={`f-stone_${i}_source`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Natural">Natural</SelectItem>
                          <SelectItem value="Lab-grown">Lab-grown</SelectItem>
                        </SelectContent>
                      </Select>
                    </F>
                    <F k={`stone_${i}_weight`} label="Weight" required error={err(`stone_${i}_weight`)}>
                      <InputGroup>
                        <InputGroupInput {...numberProps} {...ctl(`stone_${i}_weight`)} aria-required className="tabular-nums" value={row.weight_ct} onChange={e => setStone(i, { weight_ct: e.target.value })} />
                        <InputGroupAddon align="inline-end"><InputGroupText>ct</InputGroupText></InputGroupAddon>
                      </InputGroup>
                    </F>
                  </div>
                </div>
              ))}
              {!meta.stoneTypes.some(t => t.is_active) && (
                <p className="text-sm text-muted-foreground">No stone types are set up yet. Add them in Settings.</p>
              )}
            </div>

            <F k="cost" label="Unit cost (INR)" error={err('cost')} help="What one piece costs you." className="sm:max-w-xs">
              <InputGroup>
                <InputGroupAddon><InputGroupText>₹</InputGroupText></InputGroupAddon>
                <InputGroupInput {...numberProps} {...ctl('cost', true)} className="tabular-nums" value={form.cost} onChange={e => set('cost', e.target.value)} />
              </InputGroup>
            </F>

            <div className="rounded-lg border bg-muted/40 p-3" aria-live="polite">
              <div className="mb-1 text-sm font-medium">Price preview</div>
              {preview && previewReady ? (
                <>
                  <ul className="divide-y text-sm">
                    {preview.lines.map((l, i) => (
                      <li key={i} className="flex items-start justify-between gap-4 py-1.5">
                        <span className="min-w-0">{l.label}</span>
                        <span className="tabular-nums">{formatINR(l.value)}</span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between gap-4 py-1.5 text-muted-foreground">
                      <span>Subtotal</span><span className="tabular-nums">{formatINR(preview.subtotal)}</span>
                    </li>
                    <li className="flex items-center justify-between gap-4 py-1.5 text-muted-foreground">
                      <span>Tax ({s.tax_percent}%)</span><span className="tabular-nums">{formatINR(preview.tax)}</span>
                    </li>
                    <li className="flex items-center justify-between gap-4 pt-2 font-semibold">
                      <span>Total</span><span className="text-base tabular-nums">{formatINR(preview.total)}</span>
                    </li>
                  </ul>
                  {preview.missing.length > 0 && (
                    <p className="mt-2 text-sm text-destructive">No rate is set for {preview.missing.join(', ')}, so it is left out of this total.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Choose a gold purity and enter the weight to see the price.</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                {s.gold_rate_24k > 0
                  ? `Uses 24K gold at ${formatINR(s.gold_rate_24k)}/g${s.gold_rate_date ? ` (${formatDate(s.gold_rate_date)})` : ''} and making at ${formatINR(s.labour_rate_per_g)}/g. The saved price follows the rate on the day.`
                  : 'No gold rate is set yet, so gold counts as zero. Set today’s rate in Settings.'}
              </p>
            </div>
          </>
        )}
      </Section>

      {!isEdit && (
        <Section title="Opening stock" description="Optional. You can also receive stock later from the piece page.">
          <div className="grid gap-4 sm:grid-cols-2">
            <F k="opening_qty" label="Opening quantity" error={err('opening_qty')} help="Leave empty to add the piece with no stock.">
              <Input {...wholeProps} {...ctl('opening_qty', true)} className="tabular-nums" value={form.opening_qty} onChange={e => set('opening_qty', e.target.value)} />
            </F>
            <F k="opening_warehouse" label="Location">
              <Select value={form.opening_warehouse} onValueChange={v => set('opening_warehouse', v)}>
                <SelectTrigger id="f-opening_warehouse"><SelectValue placeholder="Choose a location" /></SelectTrigger>
                <SelectContent>
                  {meta.locations.map(l => <SelectItem key={l.name} value={l.name}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
          </div>
        </Section>
      )}

      <Section title="Reorder" description="A piece shows as Low when stock falls to its reorder level.">
        <div className="grid gap-4 sm:grid-cols-2">
          <F k="reorder_level" label="Reorder level" error={err('reorder_level')} help={`Leave empty to use the shop default (${formatNumber(s.low_stock_default)}).`}>
            <Input {...wholeProps} {...ctl('reorder_level', true)} className="tabular-nums" value={form.reorder_level} onChange={e => set('reorder_level', e.target.value)} />
          </F>
          <F k="reorder_qty" label="Reorder quantity" error={err('reorder_qty')} help="How many to order when stock runs low.">
            <Input {...wholeProps} {...ctl('reorder_qty', true)} className="tabular-nums" value={form.reorder_qty} onChange={e => set('reorder_qty', e.target.value)} />
          </F>
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:static md:mx-0 md:justify-end md:border-t-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <Button type="button" variant="outline" className="flex-1 md:flex-none" asChild>
          <Link to={isEdit ? `/inventory/${encodeURIComponent(sku)}` : '/inventory'}>Cancel</Link>
        </Button>
        <Button type="submit" className="flex-1 md:flex-none" disabled={save.isPending}>
          {save.isPending && <Spinner />}
          {isEdit ? 'Save changes' : 'Create piece'}
        </Button>
      </div>
    </form>
  )
}
