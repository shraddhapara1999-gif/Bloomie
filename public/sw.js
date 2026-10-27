// Bloomie service worker: shows web-push reminders and focuses the app on click.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'Bloomie', body: event.data && event.data.text() } }
  const title = data.title || 'Bloomie'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'A gentle nudge from Bloomie 🌱',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag,
    data: { url: data.url || '/app' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/app'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(url); return }
    }
    await self.clients.openWindow(url)
  })())
})
