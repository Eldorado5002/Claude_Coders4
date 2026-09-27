import { Camera, Grid3x3, Inbox, Menu } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

/** Phones: Docket · Capture · Trust · More. */
export function MobileTabs() {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  const tab = (to: string, label: string, Icon: typeof Inbox) => (
    <Link
      to={to}
      className={cn(
        'flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-[0.08em] uppercase',
        pathname.startsWith(to) ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <Icon className="size-5" strokeWidth={1.75} />
      {label}
    </Link>
  )
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 border-t border-rule bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary"
    >
      {tab('/exceptions', 'Docket', Inbox)}
      <Link to="/capture" className="flex items-center justify-center" aria-label="Capture invoice">
        <span className="press flex size-11 items-center justify-center bg-foreground text-background">
          <Camera className="size-5" />
        </span>
      </Link>
      {tab('/trust', 'Trust', Grid3x3)}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className="flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
      >
        <Menu className="size-5" strokeWidth={1.75} />
        More
      </button>
    </nav>
  )
}
