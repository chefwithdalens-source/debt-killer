// Static shell for GitHub Pages. Network first, so an open connection always gets
// the current app code. The cache is only the offline fallback. Account data
// lives in localStorage and is never cached here. Supabase and other origins
// are left to the network. The on-device text engine is not in this install
// list; the first successful fetch of those files is stored here for later.
const CACHE = 'debt-slayer-shell-v7';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './engine.js',
  './ocr.js',
  './sync.js',
  './config.js',
  './demo-data.js',
  './manifest.webmanifest',
  './favicon.ico',
  './fonts/PirataOne-Slayer.woff2',
  './fonts/Inter-Variable-Latin.woff2',
  './logos/app/logo-44.png',
  './logos/app/logo-88.png',
  './logos/app/logo-96.png',
  './logos/app/logo-192.png',
  './logos/app/favicon-32.png',
  './logos/app/apple-touch-icon.png',
  './logos.js',
  './logos/affirm.png',
  './logos/afterpay.svg',
  './logos/american-express.svg',
  './logos/apple-card.svg',
  './logos/bank-of-america.svg',
  './logos/best-buy.svg',
  './logos/capital-one.png',
  './logos/chase.svg',
  './logos/citi.svg',
  './logos/discover.svg',
  './logos/klarna.svg',
  './logos/mission-lane.png',
  './logos/navy-federal.png',
  './logos/paypal.svg',
  './logos/synchrony.png',
  './logos/target.svg',
  './logos/wells-fargo.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

function shellCacheKey(request, url) {
  if (request.mode === 'navigate') return new Request(new URL('./index.html', self.location).toString());
  if (url.search) return null;
  return request;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const key = shellCacheKey(request, url);
  event.respondWith((async () => {
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok && key) {
        try {
          const cache = await caches.open(CACHE);
          // A script tag's request is no-cors. Store a plain URL so that put succeeds.
          await cache.put(key.url || key, fresh.clone());
        } catch (e) { /* a cache miss must not hide a good network response */ }
      }
      return fresh;
    } catch (err) {
      if (key) {
        const hit = await caches.match(key);
        if (hit) return hit;
      }
      if (request.mode === 'navigate') {
        const home = await caches.match(new URL('./index.html', self.location).toString());
        if (home) return home;
      }
      throw err;
    }
  })());
});
