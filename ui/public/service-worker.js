const VERSION = 'v7-' + (self.crypto?.randomUUID?.() || Date.now());
const SHELL_FILES = [
  '/', '/index.html', '/manifest.json', '/logged-out.html',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/apple-touch-icon-180x180.png',
  '/apple-touch-icon-167x167.png',
  '/apple-touch-icon-152x152.png',
  '/apple-touch-icon-120x120.png'
];

const SHELL_CACHE = 'rioforms-shell-' + VERSION;
const API_CACHE = 'rioforms-api-' + VERSION;
const STATIC_CACHE = 'rioforms-static-' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_FILES);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => ![SHELL_CACHE, API_CACHE, STATIC_CACHE].includes(k))
      .map(k => caches.delete(k)));
  })());
  self.clients.claim();
});

function isNavigation(req) {
  return req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only same-origin
  if (url.origin !== self.location.origin) return;

  // Bypass SW for auth endpoints/pages so the approuter/IAS can handle them
  if (url.pathname === '/logout' || url.pathname.startsWith('/login') || url.pathname === '/logged-out.html') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navigations: network-first; cache by path; fallback to cached page or index
  if (isNavigation(event.request)) {
    event.respondWith((async () => {
      try {
        const res = await fetch(event.request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put(url.pathname, res.clone());
        return res;
      } catch (e) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(url.pathname)) || (await cache.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Static assets
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const res = await fetch(event.request);
      cache.put(event.request, res.clone());
      return res;
    })());
    return;
  }

  // API GETs – stale-while-revalidate
  if (url.pathname.startsWith('/api/') && event.request.method === 'GET') {
    event.respondWith((async () => {
      const cache = await caches.open(API_CACHE);
      const cached = await cache.match(event.request);
      const network = fetch(event.request).then(res => {
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      }).catch(() => null);
      return cached || network || new Response(JSON.stringify({ value: [] }), {
        headers: { 'content-type': 'application/json' },
        status: 200
      });
    })());
    return;
  }
});
