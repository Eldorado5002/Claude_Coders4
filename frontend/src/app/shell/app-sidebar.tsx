import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  Camera,
  ChevronsUpDown,
  Grid3x3,
  Inbox,
  Library,
  MessageSquareQuote,
  Moon,
  Presentation,
  Sun,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { exceptionsQ } from '@/api/queries'
import { useTheme } from '@/app/theme'
import { Mark } from '@/components/brand/mark'
import { Wordmark } from '@/components/brand/wordmark'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { CLERKS, useUi } from '@/stores/ui'

const NAV: { to: string; label: string; icon: LucideIcon; hint: string }[] = [
  { to: '/exceptions', label: 'Docket', icon: Inbox, hint: 'Exceptions waiting for a decision' },
  { to: '/trust', label: 'Trust map', icon: Grid3x3, hint: 'Where the agent has earned autonomy' },
  { to: '/vendors', label: 'Vendors', icon: Building2, hint: 'What the agent knows about each vendor' },
  { to: '/learning', label: 'Learning', icon: TrendingUp, hint: 'With memory vs without' },
  { to: '/memory', label: 'Memory', icon: Library, hint: 'Lessons, team policy, raw memories' },
]

const initials = (name: string) => name.replace(/\(.*\)/, '').trim().slice(0, 1)

export function AppSidebar() {
  const { pathname } = useLocation()
  const open = useQuery(exceptionsQ({ status: 'open' }))
  const { resolved, toggle } = useTheme()
  const { clerk, setClerk, presenter, togglePresenter, openAsk } = useUi()
  const { setOpenMobile } = useSidebar()
  const close = () => setOpenMobile(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pt-4 pb-3">
        <Link to="/exceptions" onClick={close} className="flex items-center gap-2 outline-none" aria-label="Precedent home">
          <Wordmark className="h-[26px] w-auto group-data-[collapsible=icon]:hidden" />
          <Mark className="-m-1 hidden size-8 group-data-[collapsible=icon]:block" />
        </Link>
        <p className="text-[11px] leading-snug text-muted-foreground group-data-[collapsible=icon]:hidden">
          The AP agent that learns from every exception.
        </p>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Work</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((n) => {
                const active = pathname.startsWith(n.to)
                return (
                  <SidebarMenuItem key={n.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={n.label}>
                      <Link to={n.to} onClick={close}>
                        <n.icon />
                        <span>{n.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {n.to === '/exceptions' && !!open.data?.total && (
                      <SidebarMenuBadge className="tabular-nums">{open.data.total}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Ask Precedent"
                  onClick={() => {
                    close()
                    openAsk()
                  }}
                >
                  <MessageSquareQuote />
                  <span>Ask Precedent</span>
                </SidebarMenuButton>
                <Kbd className="pointer-events-none absolute top-1.5 right-2 group-data-[collapsible=icon]:hidden">⌘K</Kbd>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith('/capture')} tooltip="Capture invoice">
                  <Link to="/capture" onClick={close}>
                    <Camera />
                    <span>Capture invoice</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-1 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggle} tooltip={resolved === 'dark' ? 'Paper theme (D)' : 'Ink theme (D)'}>
              {resolved === 'dark' ? <Sun /> : <Moon />}
              <span>{resolved === 'dark' ? 'Paper theme' : 'Ink theme'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={togglePresenter} isActive={presenter} tooltip="Presenter mode (P)">
              <Presentation />
              <span>Presenter mode</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={`Signed as ${clerk}`} className="mt-1 border border-sidebar-border">
                  <span className="flex size-8 shrink-0 items-center justify-center bg-foreground font-serif text-base text-background">
                    {initials(clerk)}
                  </span>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Signed as</span>
                    <span className="truncate text-sm font-medium">{clerk}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Decisions you make are taught to the agent under this name.
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={clerk} onValueChange={setClerk}>
                  {CLERKS.map((c) => (
                    <DropdownMenuRadioItem key={c} value={c}>
                      {c}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
