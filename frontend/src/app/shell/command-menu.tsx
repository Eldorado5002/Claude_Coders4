import { useQuery } from '@tanstack/react-query'
import { Building2, Camera, FileText, Grid3x3, Inbox, Library, MessageSquareQuote, Moon, Presentation, ToggleRight, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useNavigate } from 'react-router'
import { useAdvance, useSetMemory } from '@/api/mutations'
import { demoQ, exceptionsQ, settingsQ, vendorsQ } from '@/api/queries'
import { useTheme } from '@/app/theme'
import { AgentMark } from '@/components/precedent'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { TYPE_LABEL } from '@/lib/labels'
import { useUi } from '@/stores/ui'

const PAGES = [
  { to: '/exceptions', label: 'Docket', icon: Inbox },
  { to: '/trust', label: 'Trust map', icon: Grid3x3 },
  { to: '/vendors', label: 'Vendors', icon: Building2 },
  { to: '/learning', label: 'Learning', icon: TrendingUp },
  { to: '/memory', label: 'Memory', icon: Library },
  { to: '/capture', label: 'Capture invoice', icon: Camera },
]

/** ⌘K: jump anywhere, flip memory, move the demo, or ask Precedent a question. */
export function CommandMenu() {
  const { commandOpen: open, setCommandOpen: setOpen, openAsk, togglePresenter, presenter } = useUi()
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const { toggle, resolved } = useTheme()
  const settings = useQuery(settingsQ())
  const cases = useQuery({ ...exceptionsQ({ status: 'all' }), enabled: open })
  const vendors = useQuery({ ...vendorsQ(), enabled: open })
  const demo = useQuery(demoQ())
  const setMemory = useSetMemory()
  const advance = useAdvance()

  useHotkeys('mod+k', (e) => {
    e.preventDefault()
    setOpen(!open)
  }, { enableOnFormTags: true })

  const run = (fn: () => void) => {
    setOpen(false)
    setQ('')
    fn()
  }
  const question = q.trim()

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Precedent" description="Jump to a case, vendor or page, or ask a question">
      <Command>
      <CommandInput value={q} onValueChange={setQ} placeholder="Search cases, vendors, pages — or ask a question…" />
      <CommandList className="max-h-[26rem]">
        <CommandEmpty>Nothing matches. Press ↵ on “Ask Precedent” to ask instead.</CommandEmpty>
        {question.length > 2 && (
          <CommandGroup heading="Ask" forceMount>
            <CommandItem forceMount value={`ask ${question}`} onSelect={() => run(() => openAsk({ question }))}>
              <MessageSquareQuote />
              <span className="truncate">
                Ask Precedent: <span className="font-serif text-[0.95rem]">“{question}”</span>
              </span>
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {PAGES.map((p) => (
            <CommandItem key={p.to} value={`page ${p.label}`} onSelect={() => run(() => navigate(p.to))}>
              <p.icon />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {!!cases.data?.items.length && (
          <CommandGroup heading="Cases">
            {cases.data.items.slice(0, 40).map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.id} ${c.vendor.name} ${TYPE_LABEL[c.primary_type]} ${c.invoice_number}`}
                onSelect={() => run(() => navigate(`/exceptions/${c.id}`))}
              >
                <FileText />
                <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                <span className="truncate">{c.vendor.name}</span>
                <CommandShortcut>{TYPE_LABEL[c.primary_type]}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!vendors.data?.length && (
          <CommandGroup heading="Vendors">
            {vendors.data.map((v) => (
              <CommandItem key={v.id} value={`vendor ${v.id} ${v.name} ${v.city}`} onSelect={() => run(() => navigate(`/vendors/${v.id}`))}>
                <Building2 />
                <span className="truncate">{v.name}</span>
                <CommandShortcut>{v.city}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {settings.data && (
            <CommandItem value="toggle memory switch" onSelect={() => run(() => setMemory.mutate(!settings.data!.memory_enabled))}>
              <ToggleRight />
              Turn memory {settings.data.memory_enabled ? 'off' : 'on'}
            </CommandItem>
          )}
          {demo.data?.stages
            .filter((s) => s.id !== demo.data?.stage)
            .map((s) => (
              <CommandItem key={s.id} value={`stage ${s.label} ${s.description}`} onSelect={() => run(() => advance.mutate(s.id))}>
                <AgentMark className="mx-[3px]" />
                Go to {s.label}
                <CommandShortcut>{s.description}</CommandShortcut>
              </CommandItem>
            ))}
          <CommandItem value="presenter mode projector" onSelect={() => run(togglePresenter)}>
            <Presentation />
            Presenter mode {presenter ? 'off' : 'on'}
            <CommandShortcut>P</CommandShortcut>
          </CommandItem>
          <CommandItem value="theme dark light ink paper" onSelect={() => run(toggle)}>
            <Moon />
            {resolved === 'dark' ? 'Paper theme' : 'Ink theme'}
            <CommandShortcut>D</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
