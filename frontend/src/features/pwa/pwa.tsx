import { Bell, BellOff, BellRing, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { api, FIXTURES, unwrap } from '@/api/client'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { urlBase64ToUint8Array } from './push-key'

type PushState = 'unsupported' | 'idle' | 'working' | 'on' | 'denied'

const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function currentSubscription() {
  if (!supported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Sidebar item: subscribe this device to blocked-invoice / auto-resolution notifications. */
export function NotifyMenuItem() {
  const [state, setState] = useState<PushState>(() => (supported() && !FIXTURES ? 'idle' : 'unsupported'))

  useEffect(() => {
    if (!supported() || FIXTURES) return
    if (Notification.permission === 'denied') setState('denied')
    void currentSubscription().then((s) => s && setState('on'))
  }, [])

  const enable = async () => {
    setState('working')
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) throw new Error('Install or reload the app first: the offline worker isn’t running yet (dev mode has none).')
      const { key } = await unwrap(api.GET('/api/push/public-key'))
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'idle')
        return
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
      const json = sub.toJSON()
      await unwrap(
        api.POST('/api/push/subscribe', { body: { endpoint: json.endpoint!, keys: (json.keys ?? {}) as Record<string, string> } }),
      )
      setState('on')
      toast('Notifications on', { description: 'You’ll hear about blocked invoices and auto-resolutions on this device.' })
    } catch (e) {
      setState('idle')
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Couldn’t turn on notifications', {
        description: /404|not configured/i.test(msg) ? 'Push isn’t configured on this server.' : msg,
      })
    }
  }

  if (state === 'unsupported') return null
  const Icon = state === 'on' ? BellRing : state === 'denied' ? BellOff : Bell
  const label = state === 'on' ? 'Notifications on' : state === 'denied' ? 'Notifications blocked' : 'Notify this device'
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={label}
        disabled={state === 'working' || state === 'on' || state === 'denied'}
        onClick={() => void enable()}
      >
        <Icon />
        <span>{state === 'working' ? 'Turning on…' : label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

/** Sidebar item shown only when the browser offers installation. */
export function InstallMenuItem() {
  const [evt, setEvt] = useState<InstallEvent | null>(null)
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault()
      setEvt(e as InstallEvent)
    }
    const done = () => setEvt(null)
    window.addEventListener('beforeinstallprompt', on)
    window.addEventListener('appinstalled', done)
    return () => {
      window.removeEventListener('beforeinstallprompt', on)
      window.removeEventListener('appinstalled', done)
    }
  }, [])
  if (!evt) return null
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip="Install Precedent"
        onClick={async () => {
          await evt.prompt()
          const { outcome } = await evt.userChoice
          if (outcome === 'accepted') setEvt(null)
        }}
      >
        <Download />
        <span>Install app</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** Registers the service worker, offers updates, and follows notification clicks. */
export function PwaRuntime() {
  const navigate = useNavigate()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  useEffect(() => {
    if (!needRefresh) return
    toast('A new version of Precedent is ready', {
      duration: Infinity,
      action: { label: 'Reload', onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const on = (e: MessageEvent) => {
      if (e.data?.type === 'NAVIGATE' && typeof e.data.url === 'string') navigate(new URL(e.data.url).pathname)
    }
    navigator.serviceWorker.addEventListener('message', on)
    return () => navigator.serviceWorker.removeEventListener('message', on)
  }, [navigate])

  return null
}
