// Service Worker Básico - Suiri
const CACHE_NAME = 'Suiri-v1-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Permite que o app busque os dados na rede normalmente
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
