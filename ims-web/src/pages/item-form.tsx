import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { TriangleAlertIcon } from 'lucide-react'
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
import { PageHeader } from '@/components/common'
import { printLabels } from '@/components/qr-label'
import { useItem, useMeta, useSaveItem } from '@/hooks/api'
import { ApiError, api } from '@/lib/api'
import { formatINR, formatNumber } from '@/lib/format'
import type { ItemDetail, ItemInput, Meta } from '@/lib/types'

const NONE = '__none'
const SKU_RE = /^[A-Z0-9][A-Z0-9-]{1,39}$/

interface FormState {
  name: string
  category: string
  sku: string
  collection: string
  finish: string
  crystal_colour: string
  description: string
  mrp: string
  cost: string
  opening_qty: string
  opening_warehouse: string
  reorder_level: string
  reorder_qty: string
}

type Errors = Record<string, string>

/** `detail` is the piece being edited, or (with `variant`) the piece a new variant is copied from. */
function initialState(meta: Meta, detail?: ItemDetail, variant = false): FormState {
  const defaultLoc = meta.locations.find(l => l.is_default)?.name ?? meta.locations[0]?.name ?? ''
  if (!detail) {
    return {
      name: '', category: '', sku: '', collection: '', finish: '', crystal_colour: '', description: '',
      mrp: '', cost: '', opening_qty: '', opening_warehouse: defaultLoc, reorder_level: '', reorder_qty: '',
    }
  }
  const i = detail.item
  return {
    name: i.name,
    category: i.category,
    sku: '',
    collection: i.collection ?? '',
    // A variant is the same design in another finish or colour, so those start empty.
    finish: variant ? '' : i.finish ?? '',
    crystal_colour: variant ? '' : i.crystal_colour ?? '',
    description: i.description,
    mrp: i.mrp != null ? String(i.mrp) : '',
    cost: i.cost ? String(i.cost) : '',
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

  const mrp = checkNumber(f.mrp, { max: 1e8 })
  if (mrp) e.mrp = mrp
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
  const [params] = useSearchParams()
  const isEdit = !!sku
  // /inventory/new?from=<SKU> starts a new variant of an existing piece
  const from = !isEdit ? params.get('from')?.trim() || undefined : undefined
  const source = sku ?? from
  const meta = useMeta()
  const item = useItem(source)

  if (source && item.isError) {
    if (item.error instanceof ApiError && item.error.status === 404) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No piece with SKU {source}</EmptyTitle>
            <EmptyDescription>{isEdit ? 'There is nothing to edit here.' : 'There is nothing to copy a variant from.'}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button variant="outline" asChild><Link to="/inventory">Back to Inventory</Link></Button></EmptyContent>
        </Empty>
      )
    }
    return <LoadError message={(item.error as Error).message} onRetry={() => item.refetch()} />
  }
  if (meta.isError) return <LoadError message={(meta.error as Error).message} onRetry={() => meta.refetch()} />
  if (!meta.data || (source && !item.data)) return <FormSkeleton />

  return <ItemForm key={sku ?? (from ? `new-from-${from}` : 'new')} meta={meta.data} detail={item.data} sku={sku} from={from} />
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

function ItemForm({ meta, detail, sku, from }: { meta: Meta; detail?: ItemDetail; sku?: string; from?: string }) {
  const isEdit = !!sku
  const variantOf = !isEdit && detail ? from : undefined
  const isVariant = !!variantOf
  const navigate = useNavigate()
  const save = useSaveItem(sku)
  const [initial] = useState<FormState>(() => initialState(meta, detail, isVariant))
  const [form, setForm] = useState<FormState>(initial)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(f => ({ ...f, [key]: value }))

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
      mrp: mrpN,
      reorder_level: toNum(form.reorder_level),
      reorder_qty: toNum(form.reorder_qty),
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
    const price = mrpN ?? 0

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

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={isEdit ? 'Edit piece' : isVariant && detail ? `New variant of ${detail.item.name}` : 'New piece'}
        description={
          isEdit && detail ? `${detail.item.sku} · Fields marked * are required.`
            : isVariant ? 'Same design in another finish or colour'
              : 'Fields marked * are required.'
        }
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
          <Input {...ctl('crystal_colour')} list="crystal-colours" value={form.crystal_colour} onChange={e => set('crystal_colour', e.target.value)} maxLength={60} autoComplete="off" />
          <datalist id="crystal-colours">
            {meta.colours.map(c => <option key={c} value={c} />)}
          </datalist>
        </F>
        <F k="description" label="Description">
          <Textarea {...ctl('description')} value={form.description} onChange={e => set('description', e.target.value)} maxLength={2000} rows={3} />
        </F>
      </Section>

      <Section title="Pricing" description="One fixed price for every piece, inclusive of all taxes.">
        <div className="grid gap-4 sm:grid-cols-2">
          <F k="mrp" label="MRP (INR, inclusive of taxes)" error={err('mrp')} help="The price the customer pays.">
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
          <Link to={isEdit ? `/inventory/${encodeURIComponent(sku)}` : variantOf ? `/inventory/${encodeURIComponent(variantOf)}` : '/inventory'}>Cancel</Link>
        </Button>
        <Button type="submit" className="flex-1 md:flex-none" disabled={save.isPending}>
          {save.isPending && <Spinner />}
          {isEdit ? 'Save changes' : 'Create piece'}
        </Button>
      </div>
    </form>
  )
}
