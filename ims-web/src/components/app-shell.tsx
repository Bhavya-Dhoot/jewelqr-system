import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftRightIcon, BoxesIcon, ClipboardCheckIcon, GemIcon, LayoutDashboardIcon, LogOutIcon, MapPinIcon, MonitorIcon,
  KeyboardIcon, MoonIcon, ScanLineIcon, SearchIcon, Settings2Icon, ShoppingBagIcon, SunIcon,
} from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { CommandSearch } from '@/components/command-search'
import { Shortcuts } from '@/components/shortcuts'
import { MovementDialogProvider } from '@/components/movement-dialog'
import { useTheme } from '@/components/theme'
import { useMe } from '@/hooks/api'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'

const DemoBanner = import.meta.env.VITE_DEMO ? lazy(() => import('@/demo/banner')) : null

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboardIcon, end: true },
  { to: '/inventory', label: 'Inventory', icon: BoxesIcon },
  { to: '/movements', label: 'Stock movements', icon: ArrowLeftRightIcon },
  { to: '/scan', label: 'Scan', icon: ScanLineIcon },
  { to: '/locations', label: 'Locations', icon: MapPinIcon },
]
const MANAGE = [
  { to: '/count', label: 'Stock count', icon: ClipboardCheckIcon, manager: true },
  { to: '/shopify', label: 'Shopify', icon: ShoppingBagIcon, manager: true },
  { to: '/settings', label: 'Settings', icon: Settings2Icon },
]

function NavItems({ items, user }: { items: typeof MANAGE; user: User }) {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenu>
      {items.filter(i => !('manager' in i && i.manager) || user.isManager).map(item => (
        <SidebarMenuItem key={item.to}>
          <NavLink to={item.to} end={'end' in item ? Boolean(item.end) : false} onClick={() => setOpenMobile(false)}>
            {({ isActive }) => (
              <SidebarMenuButton isActive={isActive} tooltip={item.label} className="relative data-[active=true]:font-semibold data-[active=true]:before:absolute data-[active=true]:before:inset-y-1 data-[active=true]:before:left-0 data-[active=true]:before:w-[3px] data-[active=true]:before:bg-mark">
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            )}
          </NavLink>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

function UserMenu({ user }: { user: User }) {
  const { theme, setTheme } = useTheme()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const initials = user.fullName.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
  async function logout() {
    await api.post('/auth/logout').catch(() => {})
    qc.clear()
    navigate('/login')
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
          <Avatar className="size-8"><AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback></Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.fullName}</span>
            <span className="truncate text-xs text-muted-foreground">{user.isManager ? 'Stock manager' : 'Staff'}</span>
          </div>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{user.fullName}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === 'dark' ? <MoonIcon /> : theme === 'light' ? <SunIcon /> : <MonitorIcon />}
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={v => setTheme(v as typeof theme)}>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}><LogOutIcon />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell() {
  const { data: user, isLoading, isError } = useMe()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    const onUnauthorized = () => navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true })
    window.addEventListener('ims:unauthorized', onUnauthorized)
    return () => window.removeEventListener('ims:unauthorized', onUnauthorized)
  }, [navigate, location])

  useEffect(() => {
    if (isError) navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true })
  }, [isError, navigate, location])

  if (isLoading || !user) return <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Loading…</div>

  return (
    <SidebarProvider>
      <MovementDialogProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <Link to="/">
                    <div className="grid size-8 place-items-center bg-primary text-primary-foreground"><GemIcon className="size-4" /></div>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-bold tracking-tight">Esme Crystal</span>
                      <span className="truncate text-xs text-muted-foreground">Inventory</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent><NavItems items={NAV} user={user} /></SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Manage</SidebarGroupLabel>
              <SidebarGroupContent><NavItems items={MANAGE} user={user} /></SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu><SidebarMenuItem><UserMenu user={user} /></SidebarMenuItem></SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header className="no-print sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
            <Button variant="outline" className="h-9 min-w-0 flex-1 justify-start gap-2 text-muted-foreground sm:max-w-sm" onClick={() => setSearchOpen(true)}>
              <SearchIcon />
              <span className="truncate">Search pieces</span>
              <Kbd className="ml-auto hidden sm:inline-flex">Ctrl K</Kbd>
            </Button>
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts">
              <KeyboardIcon />
            </Button>
            {DemoBanner && <Suspense><DemoBanner /></Suspense>}
            <Button variant="ghost" size="icon" className="md:hidden" asChild aria-label="Scan">
              <Link to="/scan"><ScanLineIcon /></Link>
            </Button>
          </header>
          <main className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
            <Outlet context={{ user }} />
          </main>
        </SidebarInset>
        <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
        <Shortcuts helpOpen={helpOpen} setHelpOpen={setHelpOpen} isManager={user.isManager} />
      </MovementDialogProvider>
    </SidebarProvider>
  )
}
