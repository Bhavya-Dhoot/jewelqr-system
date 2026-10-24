import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/theme'
import { AppShell } from '@/components/app-shell'
import { ApiError } from '@/lib/api'
import LoginPage from '@/pages/login'
import DashboardPage from '@/pages/dashboard'
import InventoryPage from '@/pages/inventory'
import './index.css'

const ItemDetailPage = lazy(() => import('@/pages/item-detail'))
const ItemFormPage = lazy(() => import('@/pages/item-form'))
const MovementsPage = lazy(() => import('@/pages/movements'))
const StockCountPage = lazy(() => import('@/pages/stock-count'))
const ScanPage = lazy(() => import('@/pages/scan'))
const LocationsPage = lazy(() => import('@/pages/locations'))
const SettingsPage = lazy(() => import('@/pages/settings'))
const ShopifyPage = lazy(() => import('@/pages/shopify'))
const PublicItemPage = lazy(() => import('@/pages/public-item'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
})

const page = (el: React.ReactNode) => <Suspense fallback={<div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>}>{el}</Suspense>

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/s/:sku', element: page(<PublicItemPage />) },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'inventory/new', element: page(<ItemFormPage />) },
      { path: 'inventory/:sku', element: page(<ItemDetailPage />) },
      { path: 'inventory/:sku/edit', element: page(<ItemFormPage />) },
      { path: 'movements', element: page(<MovementsPage />) },
      { path: 'count', element: page(<StockCountPage />) },
      { path: 'scan', element: page(<ScanPage />) },
      { path: 'locations', element: page(<LocationsPage />) },
      { path: 'settings', element: page(<SettingsPage />) },
      { path: 'shopify', element: page(<ShopifyPage />) },
      { path: '*', element: <p className="py-20 text-center text-sm text-muted-foreground">Page not found.</p> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <RouterProvider router={router} />
          <Toaster richColors position="top-center" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
