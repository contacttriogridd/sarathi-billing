/*
 * Sarathi Billing — service worker
 *
 * - App code, fonts and icons: cache-first (Next.js file names are content-hashed).
 * - Pages: network-first, falling back to the last cached copy, then /offline.
 * - Supabase / any other origin: never intercepted, so billing data is always live
 *   and never stored by the service worker.
 *
 * Bump VERSION when changing this file or files in /public that are not hashed.
 */
const VERSION = 'sarathi-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = '/offline';
const PRECACHE = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/fonts/NotoSans-Regular.ttf',
  '/fonts/NotoSans-Bold.ttf',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const isStaticAsset = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  url.pathname.startsWith('/fonts/') ||
  url.pathname.startsWith('/icons/') ||
  url.pathname === '/pdf.worker.min.js';

async function trim(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i += 1) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
    trim(STATIC_CACHE, 400);
  }
  return response;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      cache.put(request, response.clone());
      trim(PAGE_CACHE, 60);
    }
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/webpack-hmr') || url.pathname.startsWith('/api/')) return;
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  }
});
