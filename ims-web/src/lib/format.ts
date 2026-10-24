const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 })
const num = new Intl.NumberFormat('en-IN')

export const formatINR = (v: number | null | undefined) => (v == null ? '-' : inr.format(v))
export const formatINRCompact = (v: number) => (Math.abs(v) >= 100000 ? inrCompact.format(v) : inr.format(v))
export const formatNumber = (v: number | null | undefined) => (v == null ? '-' : num.format(v))

export function formatDate(d: string | null | undefined) {
  if (!d) return '-'
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d.replace(' ', 'T'))
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatRelative(d: string) {
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d.replace(' ', 'T'))
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((midnight(new Date()) - midnight(date)) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return formatDate(d)
}

/** "Stores - EC" -> "Stores" (ERPNext suffixes warehouses with the company abbreviation). */
export const locationLabel = (name: string | null | undefined) => (name ? name.replace(/ - [A-Z0-9]{1,5}$/, '') : '-')

/** "manager@esmecrystal.local" -> "manager" */
export const personLabel = (email: string) => (email === 'Administrator' ? 'Admin' : email.split('@')[0])

export const todayIso = () => new Date().toLocaleDateString('sv-SE')
