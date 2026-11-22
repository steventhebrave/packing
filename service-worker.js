const CACHE_NAME = 'packing-list-v9';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './counters.html',
    './manifest.json',
    './packing-icon/icon.svg',
    './packing-icon/icon-16.png',
    './packing-icon/icon-32.png',
    './packing-icon/icon-180.png',
    './packing-icon/icon-192.png',
    './packing-icon/icon-512.png',
    './spin-icon/icon.svg',
    './spin-icon/icon-16.png',
    './spin-icon/icon-32.png',
    './spin-icon/icon-180.png',
    './spin-icon/icon-192.png',
    './spin-icon/icon-512.png',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap'
];

self.addEventListener('install', (event) => {
    // Activate this new worker as soon as it's finished installing, instead of
    // waiting for every open instance of the app to be closed first.
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Bypass the HTTP cache for our own assets so a version bump always
            // pulls fresh copies. External resources (fonts/tailwind) are left as
            // plain requests; caching them just makes them available offline.
            const requests = ASSETS_TO_CACHE.map((url) =>
                url.startsWith('http') ? url : new Request(url, { cache: 'reload' })
            );
            return cache.addAll(requests);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Return cached response if found, otherwise fetch from network
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of open pages immediately
    );
});
