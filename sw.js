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

// Fetch: network-first for HTML/JS/CSS (always get the latest site,
// fall back to cache if offline). Audio files are deliberately NOT
// intercepted here — <audio> elements stream using range requests
// (small chunks, for instant playback + seeking), and the Cache API
// doesn't handle those chunked requests well. Intercepting them forced
// the browser to wait for a much bigger response before playback could
// start. Letting audio requests go straight to the network (browser
// default behavior) restores fast, reliable streaming — the tradeoff
// is that songs are no longer available fully offline after a replay.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests, and never audio files.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/audio/')) {
    return;
  }

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
