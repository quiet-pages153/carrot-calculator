const APP = 'carrot-calculator';
const CACHE = APP + '-v19';
const FILES = ['./', './index.html', './app.css', './app.js', './property.js', './pwa.js', './manifest.webmanifest',
  './assets/cafe-background.webp', './assets/cafe-header.webp', './assets/bunny.webp', './assets/jua.woff2',
  './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png', './assets/apple-touch-icon.png'];

// 설치: HTTP 캐시를 건너뛰고 받는다. 다른 앱의 index.html이 올라와 있으면 설치하지 않는다(기존 버전 유지).
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const page = await fetch('./index.html', { cache: 'reload' });
    const text = await page.clone().text();
    if (!text.slice(0, 600).includes('<meta name="app-id" content="' + APP + '">')) throw new Error('다른 앱 파일');
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.filter(path => path !== './index.html').map(path => new Request(path, { cache: 'reload' })));
    await cache.put('./index.html', page);
    await self.skipWaiting();
  })());
});

// 활성화: 이 앱의 옛 캐시만 지운다.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(APP + '-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (url.pathname.endsWith('/version.json')) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html', { cacheName: CACHE }).then(hit => hit || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request, { cacheName: CACHE, ignoreSearch: true }).then(hit => hit || fetch(request)));
});
