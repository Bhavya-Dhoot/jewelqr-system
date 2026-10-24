import type { ReactNode } from 'react'
import { GemIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StockStatus } from '@/lib/types'

/** Swiss Grid page header: flush-left title, actions on the right, a black rule that draws on once. */
export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="rule-draw h-px bg-foreground" aria-hidden />
    </div>
  )
}

export function ItemThumb({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  return (
    <div className={cn('relative grid size-10 shrink-0 place-items-center overflow-hidden border bg-muted', className)}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <GemIcon className="size-1/2 text-muted-foreground/60" aria-hidden />
      )}
    </div>
  )
}

const STATUS: Record<StockStatus, { label: string; dot: string; text: string }> = {
  in: { label: 'In stock', dot: 'bg-status-in', text: 'text-foreground' },
  low: { label: 'Low', dot: 'bg-status-low', text: 'text-status-low' },
  out: { label: 'Out', dot: 'bg-status-out', text: 'text-status-out' },
}

/** Status as a square marker + label (no pill), so it reads in a dense table without shouting. */
export function StockBadge({ status, className }: { status: StockStatus; className?: string }) {
  const s = STATUS[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap', s.text, className)}>
      <span className={cn('size-2 shrink-0', s.dot)} aria-hidden />
      {s.label}
    </span>
  )
}

/** A figure in the Swiss grid: rule on top, small label, large mono numeral. `marked` puts the red bar on it. */
export function Stat({ label, value, hint, marked, className }: { label: string; value: ReactNode; hint?: ReactNode; marked?: boolean; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className={cn('mb-3 h-px bg-foreground transition-[height,background-color] duration-300', marked && 'h-1 bg-mark')} aria-hidden />
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
