/* ============================================
   SnapRead — Service Worker
   Cache-first for app shell, network-first for CDN
   ============================================ */

const CACHE_NAME = 'snapread-v1';

const APP_SHELL = [
    './',
    './index.html',
    './css/styles.css',
    './js/db.js',
    './js/file-parser.js',
    './js/rsvp-engine.js',
    './js/library.js',
    './js/reader.js',
    './js/settings.js',
    './js/app.js',
    './manifest.json',
];

const CDN_URLS = [
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];

// Install — cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([...APP_SHELL, ...CDN_URLS]);
        })
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch — cache-first for app shell, network-first for everything else
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // For Google Fonts — cache first with network fallback
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                return cached || fetch(event.request).then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // Cache-first for app shell and CDN
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request).then((response) => {
                // Don't cache non-GET or failed responses
                if (event.request.method !== 'GET' || !response || response.status !== 200) {
                    return response;
                }

                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            }).catch(() => {
                // Offline fallback for navigation
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
