const CACHE_NAME = 'sahayo-cache-v1';

// Core files needed to load the app shell offline.
// Add/remove filenames here to match what's actually in your project.
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/scripts.js',
  '/playlist.js',
  '/favicon-32.png',
  '/favicon-192.png',
  '/favicon-512.png',
  '/apple-touch-icon.png',
  '/manifest.json'
];

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith('/audio/')) {
    event.respondWith(handleAudioRequest(event.request));
    return;
  }

  // Network-first for HTML/JS/CSS — always get the latest site,
  // fall back to cache only if offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Audio strategy: <audio> elements stream in small chunks using
// "Range" requests (this is what makes instant playback + seeking
// possible). The Cache API has no built-in support for serving partial
// content, so we handle it manually:
//
// - If we already have the FULL song cached, slice out exactly the
//   bytes the browser asked for and return a proper 206 Partial
//   Content response — this works even fully offline.
// - If we don't have it cached yet, the request goes straight to the
//   network untouched (so first-time playback stays instantly fast,
//   exactly like a normal browser tab), while a separate background
//   fetch quietly downloads and caches the complete file for next
//   time — without making the current playback wait for it.
const pendingCaches = new Set();

async function handleAudioRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = request.url.split('?')[0];
  const fullCached = await cache.match(cacheKey);

  if (fullCached) {
    return serveFromCache(fullCached, request.headers.get('range'));
  }

  cacheFullFileInBackground(cacheKey, cache);
  return fetch(request);
}

async function serveFromCache(cachedResponse, rangeHeader) {
  const blob = await cachedResponse.blob();
  const totalSize = blob.size;
  const contentType = blob.type || 'audio/mpeg';

  if (!rangeHeader) {
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': totalSize,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  const match = /bytes=(\d+)-(\d+)?/.exec(rangeHeader);
  const start = match && match[1] ? parseInt(match[1], 10) : 0;
  const end = match && match[2] ? parseInt(match[2], 10) : totalSize - 1;
  const chunk = blob.slice(start, end + 1);

  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': contentType,
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': chunk.size,
      'Accept-Ranges': 'bytes',
    },
  });
}

function cacheFullFileInBackground(url, cache) {
  if (pendingCaches.has(url)) return; // already downloading this one
  pendingCaches.add(url);

  fetch(url) // deliberately no Range header — grab the whole file
    .then((response) => {
      if (response.ok) return cache.put(url, response);
    })
    .catch(() => { /* offline or failed — just try again next play */ })
    .finally(() => pendingCaches.delete(url));
}
