const CACHE = 'imf-pubg-v1';

self.addEventListener('install', (event) => {
  console.log('[SW] install');
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(['/']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] activate');
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!request.url.startsWith(self.location.origin)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  if (request.url.includes('/_expo/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});

self.addEventListener('push', (event) => {
  console.log('[SW] push event received', event.data ? 'with data' : 'no data');
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
    console.log('[SW] push data:', JSON.stringify(data));
  } catch (e) {
    console.error('[SW] push data parse error:', e);
    data = { title: 'Victoires IMF', body: event.data?.text() ?? '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Victoires IMF', {
      body: data.body ?? '',
      icon: '/assets/icon.png',
      badge: '/assets/notification-icon.png',
      data: data.url ? { url: data.url } : {},
    }).then(() => {
      console.log('[SW] notification shown');
    }).catch((e) => {
      console.error('[SW] showNotification error:', e);
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] notification clicked');
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(clients.openWindow(url));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] pushsubscriptionchange — subscription expired or changed');
});
