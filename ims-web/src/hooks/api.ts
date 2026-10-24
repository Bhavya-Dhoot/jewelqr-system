import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from '@/lib/api'
import type {
  CountResult, Dashboard, DriftRow, ItemDetail, ItemInput, ItemList, LocationSummary, Meta, Movement, MovementInput,
  ShopifyStatus, User,
} from '@/lib/types'

export const keys = {
  me: ['me'] as const,
  meta: ['meta'] as const,
  items: (p: object) => ['items', p] as const,
  item: (sku: string) => ['item', sku] as const,
  dashboard: (days: number) => ['dashboard', days] as const,
  movements: (p: object) => ['movements', p] as const,
  locations: ['locations'] as const,
  counts: ['counts'] as const,
  goldHistory: ['gold-history'] as const,
  shopify: ['shopify'] as const,
  drift: ['shopify-drift'] as const,
}

export const useMe = () =>
  useQuery({ queryKey: keys.me, queryFn: () => api.get<{ user: User }>('/auth/me').then(r => r.user), retry: false, staleTime: 5 * 60_000 })

export const useMeta = () => useQuery({ queryKey: keys.meta, queryFn: () => api.get<Meta>('/meta'), staleTime: 60_000 })

export interface ItemFilters {
  q?: string
  category?: string
  collection?: string
  finish?: string
  location?: string
  stock?: '' | 'in' | 'low' | 'out'
  status?: 'active' | 'archived' | 'all'
  sort?: 'newest' | 'name' | 'sku' | 'stock' | 'value'
  page?: number
  pageSize?: number
}

export const useItems = (f: ItemFilters) =>
  useQuery({ queryKey: keys.items(f), queryFn: () => api.get<ItemList>(`/items${qs({ ...f })}`), placeholderData: keepPreviousData })

export const useItem = (sku: string | undefined) =>
  useQuery({ queryKey: keys.item(sku ?? ''), queryFn: () => api.get<ItemDetail>(`/items/${encodeURIComponent(sku!)}`), enabled: !!sku })

export const useDashboard = (days: number) =>
  useQuery({ queryKey: keys.dashboard(days), queryFn: () => api.get<Dashboard>(`/dashboard?days=${days}`), placeholderData: keepPreviousData })

export interface MovementFilters { type?: string; reason?: string; q?: string; from?: string; to?: string; page?: number; pageSize?: number }

export const useMovements = (f: MovementFilters) =>
  useQuery({
    queryKey: keys.movements(f),
    queryFn: () => api.get<{ total: number; movements: Movement[] }>(`/stock/movements${qs({ ...f })}`),
    placeholderData: keepPreviousData,
  })

export const useLocations = () =>
  useQuery({ queryKey: keys.locations, queryFn: () => api.get<{ locations: LocationSummary[] }>('/locations').then(r => r.locations) })

export const useCounts = () =>
  useQuery({ queryKey: keys.counts, queryFn: () => api.get<{ counts: { name: string; date: string; by: string; difference_value: number; notes: string }[] }>('/stock/counts').then(r => r.counts) })

export const useGoldHistory = () =>
  useQuery({ queryKey: keys.goldHistory, queryFn: () => api.get<{ history: { date: string; rate: number; by: string }[] }>('/rates/history').then(r => r.history) })

export const useShopifyStatus = () => useQuery({ queryKey: keys.shopify, queryFn: () => api.get<ShopifyStatus>('/shopify/status') })

export const useShopifyDrift = (enabled: boolean) =>
  useQuery({ queryKey: keys.drift, queryFn: () => api.get<{ rows: DriftRow[] }>('/shopify/drift').then(r => r.rows), enabled })

/** Anything that changes stock invalidates every stock-derived view. */
function useInvalidateStock() {
  const qc = useQueryClient()
  return () => Promise.all(['items', 'item', 'dashboard', 'movements', 'locations', 'counts', 'shopify-drift'].map(k => qc.invalidateQueries({ queryKey: [k] })))
}

export function usePostMovement() {
  const invalidate = useInvalidateStock()
  return useMutation({ mutationFn: (m: MovementInput) => api.post<{ name: string }>('/stock/movements', m as unknown as Record<string, unknown>), onSuccess: invalidate })
}

export function useCancelMovement() {
  const invalidate = useInvalidateStock()
  return useMutation({ mutationFn: (name: string) => api.post(`/stock/movements/${encodeURIComponent(name)}/cancel`), onSuccess: invalidate })
}

export function usePostCount() {
  const invalidate = useInvalidateStock()
  return useMutation({
    mutationFn: (c: { warehouse: string; notes?: string; lines: { sku: string; counted: number }[] }) => api.post<CountResult>('/stock/counts', c),
    onSuccess: invalidate,
  })
}

export function useSaveItem(sku?: string) {
  const invalidate = useInvalidateStock()
  return useMutation({
    mutationFn: (input: ItemInput) =>
      sku ? api.put<{ sku: string }>(`/items/${encodeURIComponent(sku)}`, input as Record<string, unknown>) : api.post<{ sku: string }>('/items', input as Record<string, unknown>),
    onSuccess: invalidate,
  })
}

export function useArchiveItem() {
  const invalidate = useInvalidateStock()
  return useMutation({ mutationFn: (sku: string) => api.del(`/items/${encodeURIComponent(sku)}`), onSuccess: invalidate })
}

export function useUploadImage(sku: string) {
  const invalidate = useInvalidateStock()
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('image', file)
      return api.post<{ image: string }>(`/items/${encodeURIComponent(sku)}/image`, form)
    },
    onSuccess: invalidate,
  })
}

/** Generic mutation for settings-style endpoints that should refresh lookups afterwards. */
export function useAdminMutation<TInput>(fn: (input: TInput) => Promise<unknown>, alsoInvalidate: string[] = []) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(['meta', 'items', 'locations', 'gold-history', 'shopify', 'dashboard', ...alsoInvalidate].map(k => qc.invalidateQueries({ queryKey: [k] }))),
  })
}
