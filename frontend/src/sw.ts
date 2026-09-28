/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()
// SPA fallback, but never for the API or the SSE stream
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }))

type PushPayload = { title: string; body?: string; url?: string }

self.addEventListener('push', (event) => {
  let p: PushPayload
  try {
    p = event.data?.json() ?? { title: 'Precedent' }
  } catch {
    p = { title: 'Precedent', body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: p.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const win = wins.find((c) => new URL(c.url).origin === self.location.origin)
      if (win) {
        await win.focus()
        win.postMessage({ type: 'NAVIGATE', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
