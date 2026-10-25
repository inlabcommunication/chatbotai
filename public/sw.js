// Service worker della chat: mostra le notifiche push e, al tocco, apre la conversazione giusta.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { /* payload non valido */ }
  e.waitUntil(self.registration.showNotification(d.title || 'Chat InLab', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.conv || 'chat',   // una notifica per conversazione, aggiornata a ogni nuovo messaggio
    renotify: true,
    data: { conv: d.conv || '' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const conv = (e.notification.data && e.notification.data.conv) || '';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); c.postMessage({ type: 'open-conv', conv }); return; }
    }
    await self.clients.openWindow('/?conv=' + encodeURIComponent(conv));
  })());
});
