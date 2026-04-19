self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-first app shell: extend with precache / runtime caching when you want offline canvas.
self.addEventListener("fetch", () => {});
