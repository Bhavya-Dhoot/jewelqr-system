import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import {
  ArchiveIcon, ArchiveRestoreIcon, ArrowLeftRightIcon, CameraIcon, CopyPlusIcon, EllipsisIcon, PackageMinusIcon, PackagePlusIcon,
  PencilIcon, ShoppingCartIcon,
} from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ItemThumb, StockBadge } from '@/components/common'
import { useMovementDialog } from '@/components/movement-dialog'
import { QrLabel } from '@/components/qr-label'
import { useArchiveItem, useItem, useMeta, useSaveItem, useUploadImage } from '@/hooks/api'
import { ApiError } from '@/lib/api'
import { formatDate, formatINR, formatNumber, locationLabel, personLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ItemDetail } from '@/lib/types'

type Movement = ItemDetail['movements'][number]

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatNumber(Math.abs(n))}`
const qtyClass = (n: number) => (n > 0 ? 'text-status-in' : n < 0 ? 'text-status-out' : 'text-muted-foreground')

function Rows({ children }: { children: ReactNode }) {
  return <dl className="divide-y text-sm">{children}</dl>
}

function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2', className)}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right tabular-nums">{children}</dd>
    </div>
  )
}

export default function ItemDetailPage() {
  const { sku = '' } = useParams()
  const { data, isLoading, isError, error, refetch } = useItem(sku)

  if (isError) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No piece with SKU {sku}</EmptyTitle>
            <EmptyDescription>It may have been mistyped, or the label belongs to another catalogue.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" asChild><Link to="/inventory">Back to Inventory</Link></Button>
          </EmptyContent>
        </Empty>
      )
    }
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Could not load this piece</EmptyTitle>
          <EmptyDescription>{(error as Error).message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          <Button variant="ghost" asChild><Link to="/inventory">Back to Inventory</Link></Button>
        </EmptyContent>
      </Empty>
    )
  }

  if (isLoading || !data) return <DetailSkeleton />
  return <DetailView key={data.item.sku} data={data} />
}

function DetailSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="flex items-start gap-4">
        <Skeleton className="size-24 shrink-0 rounded-xl sm:size-28" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-7 w-3/4 max-w-sm" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
      </div>
      <Skeleton className="h-8 w-full max-w-md" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}

function DetailView({ data }: { data: ItemDetail }) {
  const { item, stock, qr_url, movements } = data
  const navigate = useNavigate()
  const { openMovement } = useMovementDialog()
  const { data: meta } = useMeta()
  const upload = useUploadImage(item.sku)
  const archive = useArchiveItem()
  const save = useSaveItem(item.sku)
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const reorder = item.reorder_level ?? meta?.settings.low_stock_default ?? 0
  const subtitle = [item.category, item.collection, item.finish, item.crystal_colour].filter(Boolean)
  const totalQty = stock.reduce((s, r) => s + r.qty, 0)
  const totalValue = stock.reduce((s, r) => s + r.value, 0)

  function onFile(file: File | undefined) {
    if (!file) return
    upload.mutate(file, {
      onSuccess: () => toast.success('Photo updated'),
      onError: err => toast.error(err.message),
    })
  }

  function restore() {
    save.mutate({ disabled: false }, {
      onSuccess: () => toast.success(`${item.name} restored`),
      onError: err => toast.error(err.message),
    })
  }

  function doArchive() {
    archive.mutate(item.sku, {
      onSuccess: () => {
        toast.success(`${item.name} archived`)
        navigate('/inventory')
      },
      onError: err => {
        setConfirmArchive(false)
        toast.error(err.message)
      },
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="relative shrink-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label={item.image ? 'Change photo' : 'Add a photo'}
          >
            <ItemThumb src={item.image} alt={item.name} className="size-24 rounded-xl sm:size-28" />
            {upload.isPending && (
              <span className="absolute inset-0 grid place-items-center rounded-xl bg-background/70"><Spinner className="size-5" /></span>
            )}
            <span className="absolute -right-1.5 -bottom-1.5 grid size-7 place-items-center rounded-full border bg-background text-muted-foreground shadow-xs">
              <CameraIcon className="size-3.5" aria-hidden />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }}
          />
          <div className="min-w-0 space-y-2">
            <h1 className="text-xl font-semibold tracking-tight text-balance break-words sm:text-2xl">{item.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <StockBadge status={item.status} />
              {item.disabled && <Badge variant="secondary">Archived</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{item.sku}</span>
              {subtitle.map(s => <span key={s}> · {s}</span>)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center xl:shrink-0 xl:flex-nowrap xl:justify-end">
          <Button variant="outline" asChild><Link to={`/inventory/${encodeURIComponent(item.sku)}/edit`}><PencilIcon />Edit</Link></Button>
          <Button variant="outline" asChild><Link to={`/inventory/new?from=${encodeURIComponent(item.sku)}`}><CopyPlusIcon />New variant</Link></Button>
          <Button onClick={() => openMovement({ action: 'receive', sku: item.sku })}><PackagePlusIcon />Receive</Button>
          <Button variant="outline" onClick={() => openMovement({ action: 'sell', sku: item.sku })}><ShoppingCartIcon />Sell</Button>
          <Button variant="outline" onClick={() => openMovement({ action: 'move', sku: item.sku })}><ArrowLeftRightIcon />Move</Button>
          <Button variant="outline" onClick={() => openMovement({ action: 'writeoff', sku: item.sku })}><PackageMinusIcon />Write off</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="col-span-2 w-full sm:col-span-1 sm:w-auto" aria-label="More actions">
                <EllipsisIcon /><span className="sm:sr-only">More</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {item.disabled ? (
                <DropdownMenuItem onSelect={restore} disabled={save.isPending}><ArchiveRestoreIcon />Restore piece</DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmArchive(true)}><ArchiveIcon />Archive piece</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Main column */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stock by location</CardTitle>
              <CardDescription>{formatNumber(item.on_hand)} on hand, reorder at {formatNumber(reorder)}</CardDescription>
            </CardHeader>
            <CardContent>
              {stock.length === 0 ? (
                <div className="flex flex-col items-start gap-3 py-2 text-sm text-muted-foreground">
                  <p>No stock in any location.</p>
                  <Button size="sm" onClick={() => openMovement({ action: 'receive', sku: item.sku })}><PackagePlusIcon />Receive stock</Button>
                </div>
              ) : (
                <div className="divide-y text-sm">
                  <div className="flex items-center gap-3 pb-2 text-xs font-medium text-muted-foreground">
                    <span className="min-w-0 flex-1">Location</span>
                    <span className="w-16 text-right">Qty</span>
                    <span className="w-24 text-right">Value</span>
                  </div>
                  {stock.map(s => (
                    <div key={s.warehouse} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate">{locationLabel(s.warehouse)}</span>
                      <span className="w-16 text-right tabular-nums">{formatNumber(s.qty)}</span>
                      <span className="w-24 text-right tabular-nums text-muted-foreground">{formatINR(s.value)}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 pt-2 font-medium">
                    <span className="min-w-0 flex-1">Total</span>
                    <span className="w-16 text-right tabular-nums">{formatNumber(totalQty)}</span>
                    <span className="w-24 text-right tabular-nums">{formatINR(totalValue)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Price</CardTitle>
              <CardDescription>Fixed selling price and margin</CardDescription>
            </CardHeader>
            <CardContent>
              <Rows>
                <Row label="MRP (inclusive of taxes)" className="font-semibold">
                  <span className="text-base">{formatINR(item.mrp)}</span>
                </Row>
                <Row label="Unit cost">{formatINR(item.cost)}</Row>
                <Row label="Margin">{item.margin == null ? '-' : `${item.margin.toFixed(1)}%`}</Row>
              </Rows>
            </CardContent>
          </Card>
        </div>

        {/* Side column */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader><CardTitle>QR label</CardTitle></CardHeader>
            <CardContent>
              <QrLabel data={{ sku: item.sku, name: item.name, url: qr_url, price: item.mrp }} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {item.description ? (
                <p className="text-sm whitespace-pre-wrap break-words">{item.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description.</p>
              )}
              <Rows>
                <Row label="Reorder level">
                  {item.reorder_level != null ? formatNumber(item.reorder_level) : <span className="text-muted-foreground">Default ({formatNumber(reorder)})</span>}
                </Row>
                <Row label="Reorder quantity">{formatNumber(item.reorder_qty)}</Row>
                <Row label="Created">{formatDate(item.created)}</Row>
                <Row label="Last modified">{formatDate(item.modified)} by {personLabel(item.modified_by)}</Row>
              </Rows>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Movement history */}
      <Card>
        <CardHeader>
          <CardTitle>Movement history</CardTitle>
          {movements.length > 0 && <CardDescription>{movements.length === 1 ? 'One movement so far' : `Latest ${movements.length} movements, newest first`}</CardDescription>}
        </CardHeader>
        <CardContent className="px-0">
          {movements.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No movements yet. Receive stock to start the history.</p>
          ) : (
            <>
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="pr-4">By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m, i) => (
                      <TableRow key={`${m.voucher_no}-${m.warehouse}-${i}`}>
                        <TableCell className="pl-4 whitespace-nowrap tabular-nums">{formatDate(m.date)} <span className="text-muted-foreground">{m.time}</span></TableCell>
                        <TableCell>{locationLabel(m.warehouse)}</TableCell>
                        <TableCell>{m.reason}</TableCell>
                        <TableCell className="text-muted-foreground">{m.reference ?? '-'}</TableCell>
                        <TableCell className={cn('text-right font-medium tabular-nums', qtyClass(m.qty))}>{signed(m.qty)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(m.balance)}</TableCell>
                        <TableCell className="pr-4 text-muted-foreground">{personLabel(m.by)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="divide-y lg:hidden">
                {movements.map((m, i) => <MovementItem key={`${m.voucher_no}-${m.warehouse}-${i}`} m={m} />)}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmArchive} onOpenChange={o => { if (!archive.isPending) setConfirmArchive(o) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {item.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It will disappear from the active inventory list. Its stock history is kept and you can restore it any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archive.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={archive.isPending} onClick={e => { e.preventDefault(); doArchive() }}>
              {archive.isPending && <Spinner />}Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function MovementItem({ m }: { m: Movement }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="truncate text-sm font-medium">
          {m.reason}{m.reference && <span className="font-normal text-muted-foreground"> · {m.reference}</span>}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">{formatDate(m.date)} {m.time} · {locationLabel(m.warehouse)}</div>
        <div className="text-xs text-muted-foreground">by {personLabel(m.by)}</div>
      </div>
      <div className="text-right">
        <div className={cn('text-sm font-medium tabular-nums', qtyClass(m.qty))}>{signed(m.qty)}</div>
        <div className="text-xs text-muted-foreground tabular-nums">Balance {formatNumber(m.balance)}</div>
      </div>
    </li>
  )
}
