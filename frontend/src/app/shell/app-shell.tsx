import { Outlet } from 'react-router'
import AskSheet from '@/features/ask/ask-sheet'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useServerEvents } from '@/hooks/use-server-events'
import { AppSidebar } from './app-sidebar'
import { CommandMenu } from './command-menu'
import { MobileTabs } from './mobile-tabs'
import { PresenterHint, useShellShortcuts } from './presenter'
import { Banners } from './status'
import { TopBar } from './top-bar'

export function AppShell() {
  useServerEvents()
  useShellShortcuts()
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <TopBar />
        <Banners />
        <main id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </SidebarInset>
      <CommandMenu />
      <AskSheet />
      <MobileTabs />
      <PresenterHint />
    </SidebarProvider>
  )
}
