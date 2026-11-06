/* Studio Fusion — service worker (hors ligne).
   VERSION est remplacée par build.py (hash du bundle) : tout changement de l'appli change le fichier,
   donc le navigateur installe la nouvelle version et prévient la page (bandeau « Mettre à jour »). */
const VERSION = '6a721497a0';
const CACHE = 'studio-fusion-v' + VERSION;          // cache de l'appli (purgé à chaque version)
const FONT_CACHE = 'studio-fusion-fonts';           // polices Google, conservées entre versions
const BASE = new URL('./', self.location.href).href; // dossier du site (portée)
const BASE_PATH = new URL(BASE).pathname;
const INDEX = new URL('index.html', BASE).href;     // clé canonique de la page (ignore ?go= et ?source=)
const PRECACHE = [
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon-180.png',
  'icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(p => cache.add(new Request(new URL(p, BASE), { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const old = (await caches.keys()).filter(k => k.startsWith('studio-fusion-v') && k !== CACHE);
    await Promise.all(old.map(k => caches.delete(k)));
    await self.clients.claim();
    // Une ancienne version existait : on prévient les pages ouvertes (bandeau « Mettre à jour »).
    if (old.length) {
      const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      pages.forEach(c => c.postMessage({ type: 'sf-update', version: VERSION }));
    }
  })());
});

// Page : réseau d'abord (pour recevoir les mises à jour), repli sur le cache hors ligne.
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(INDEX, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(INDEX);
    if (hit) return hit;
    throw err;
  }
}

// Icônes, manifeste : cache d'abord.
async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.url.startsWith(BASE)) {
    const path = url.pathname;
    if (req.mode === 'navigate' || path === BASE_PATH || path === BASE_PATH + 'index.html') {
      e.respondWith(networkFirst(req));
    } else if (path.startsWith(BASE_PATH + 'icons/') || path.endsWith('.webmanifest')) {
      e.respondWith(cacheFirst(req, CACHE));
    }
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONT_CACHE));
  }
});
