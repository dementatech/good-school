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

// A push arrives as an opaque payload from the push service — no guarantee
// it's even valid JSON (a lost/garbled message, or a future payload shape
// this build predates), so this must never throw and drop the notification
// silently. The shape sent server-side is push-sender.ts's PushPayload.
self.addEventListener("push", (event) => {
  let payload = { title: "Good School", body: "You have a new update.", link: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Not JSON — fall back to the generic payload above.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { link: payload.link },
    }),
  );
});

// Focus an already-open tab on the target page rather than always opening a
// new one — a signed-in PWA user very often already has the app open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if (new URL(client.url).pathname === link && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(link);
    })(),
  );
});
