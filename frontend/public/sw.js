// Registered so the app is installable. Deliberately does no caching —
// the offline data-sync layer (RxDB/local SQLite, sync queue) is a later phase.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: requests pass straight through to the network.
});
