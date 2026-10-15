const CACHE_NAME = 'sistema-cache-v5';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.json',
  './js/gamification.js', './js/icons.js', './js/notifications.js', './js/state.js', './js/storage.js', './js/ui.js', './js/utils.js',
  './icons/icon-192.svg', './icons/icon-512.svg', './icons/maskable-192.svg', './icons/maskable-512.svg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-192.png', './icons/maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('sistema-cache-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate';
  if (isNavigation) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('./index.html', response.clone()));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const client = clients.find(candidate => 'focus' in candidate);
    if (client) return client.navigate('./index.html').then(() => client.focus());
    return self.clients.openWindow('./index.html');
  }));
});

self.addEventListener('periodicsync', event => {
  if (event.tag !== 'sistema-reminder') return;
  event.waitUntil(self.registration.showNotification('SISTEMA — Misiones pendientes', {
    body: 'Tu disciplina te espera. Revisa tus misiones de hoy.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'daily-reminder',
    data: { url: './index.html' }
  }));
});
