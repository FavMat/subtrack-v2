// SubTrack Service Worker v14 - Network First, aggressive cache busting
const CACHE_NAME = 'subtrack-cache-v14';
const urlsToCache = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', event => {
  // Force immediate activation, don't wait for old SW to die
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete ALL old caches
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// Network ALWAYS first, cache only as fallback for offline
self.addEventListener('fetch', event => {
  // Never intercept POST requests or non-GET
  if (event.request.method !== 'GET') return;

  // For JS/CSS assets (hashed filenames) - network first, short timeout
  const url = new URL(event.request.url);
  const isAsset = url.pathname.startsWith('/assets/');

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then(response => {
        // Only cache successful responses for same-origin assets
        if (response.ok && isAsset) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
