# Realtime Module — Reference

How to push something to a signed-in user's open tab(s) the instant it happens, instead of waiting for their next poll or page load. Backed by `backend/src/modules/realtime/` and `frontend/lib/realtime/useRealtimeSocket.ts`. Originally built just for direct messages (`communications` module); generalized so any module can use it — this doc is the reference for doing that.

---

## 1. Why a ticket, not the session cookie

The frontend (Vercel) and backend (a DigitalOcean droplet) are different origins. Next.js's rewrite proxy (`next.config.ts`) only carries plain HTTP, not the WebSocket `Upgrade` handshake — so the browser opens the socket straight to the backend's own domain (`NEXT_PUBLIC_BACKEND_URL`). That connection can't ride the HttpOnly session cookie, since it's scoped to the frontend's origin.

Instead: the frontend calls `POST /api/v1/realtime/ticket` (an ordinary, cookie-authenticated, same-origin REST call, proxied as normal) to mint a single-use, 30-second ticket, then opens the socket with that ticket in the query string. Never the JWT itself — URLs end up in access logs.

---

## 2. Backend: pushing an event

One function, importable from any module:

```ts
import { pushToUser } from "../realtime/index.js";

pushToUser(userId, { type: "your_event_type", /* ...whatever payload */ });
```

- **Best-effort, fire-and-forget.** `pushToUser` never throws and returns nothing. If the user has no open tab right now, it's a silent no-op — pair it with something durable (see §5) for anyone not currently connected.
- **`userId` is a single user**, not a school or a broadcast group. To reach everyone in a school, loop: `for (const userId of await listUserIdsForSchool(schoolId)) pushToUser(userId, event)` (see `backend/src/modules/schools/index.ts` for the export). Do this sparingly — it's an in-memory loop over however many users that school has, not a queryable fan-out.
- **The payload is any JSON-serializable object with a `type` field.** The registry (`backend/src/modules/realtime/domain/registry.ts`) doesn't know or care what's inside — it just stringifies and `.send()`s it to every open socket for that user (a Set, so multiple tabs/devices each get it).

Under the hood: `connections = Map<userId, Set<WebSocket>>`, one process, in-memory — same "nothing split out until a real bottleneck" call as the rest of this modular monolith. **A multi-instance deployment would need this replaced with Redis pub/sub** (or similar) so a push from instance A reaches a socket held open on instance B. Fine for the current single-droplet deployment; revisit if the backend ever scales horizontally.

---

## 3. Frontend: receiving events

```ts
import { useRealtimeSocket } from '@/lib/realtime/useRealtimeSocket';

useRealtimeSocket((event) => {
  if (event.type === 'your_event_type') {
    // handle it
  }
});
```

- **Each call opens its own WebSocket.** The hook doesn't share a connection across components — if a page mounts three components that each call `useRealtimeSocket`, that's three sockets, each getting a copy of every event pushed to that user. This is deliberate simplicity (matches the backend's "don't split out yet" stance) but means:
  - **Don't put side effects with visible duplication risk (sounds, toasts, incrementing a shared counter from more than one place) in a component that can be mounted more than once at a time.** A portal's `NotificationBell` is rendered twice already (desktop + mobile header, both always mounted, CSS-hidden by breakpoint) — that's fine for re-fetching its own local list, but would double a sound. See `frontend/components/auth/AuthContext.tsx` for where sound/force-signout live instead: it's mounted exactly once (wraps the whole app), so it's the one safe place for effects that must fire exactly once per event.
- **`enabled` (second argument, default `true`) gates the connection.** Pass `isAuthenticated` (or similar) anywhere the component can render for a signed-out visitor — the ticket endpoint requires a session, and without this the hook would retry against a guaranteed 401 forever.
- **Reconnects automatically** on drop (3s backoff) and on a failed ticket fetch (5s backoff). Treat it as a "don't make me reload the tab" nicety, not a delivery guarantee — anything missed while disconnected should still be recoverable another way (a bell that also polls, a page that refetches on mount).
- **Unknown event types are safe.** The socket passes through anything with a string `type` field; a component's callback that only checks for `'message'` simply ignores a `'calendar_event'` it receives. This is what makes the module additive — a new event type never requires touching existing consumers.

---

## 4. Event types in use today

| `type` | Pushed from | Consumed by | Payload |
|---|---|---|---|
| `message` | `communications/api/routes.ts` (`POST /conversations/:id/messages`) | Open conversation thread (`school-admin`/`staff` communications pages), `useUnreadMessageCount` (badge), `AuthContext` (sound) | `{ conversationId, message: { id, senderUserId, body, createdAt } }` |
| `notification` | `notifications/index.ts` (`notifyUser` — every module's entry point for "tell this user something happened") | `NotificationBell`, open results pages (`exam_results_published`), `AuthContext` (sound) | `{ notification: { id, type, title, body, link, isRead, createdAt } }` — `notification.type` is the finer-grained kind (`admin_broadcast`, `class_broadcast`, `direct_message`, `exam_results_published`, ...) |
| `force_signout` | `admin/api/routes.ts` (account disabled), `schools/api/routes.ts` (school suspended) | `AuthContext` — calls `logout()` immediately | `{ reason }` (`"account_disabled"` \| `"school_suspended"`) |
| `calendar_event` | `events/api/routes.ts` (`POST /events`, school-scoped only — a super_admin's global event doesn't fan out, see the code comment for why) | `DashboardRightRail` (reminders list) | `{ event: { id, title, eventDate } }` |

All four interfaces live together in `frontend/lib/realtime/useRealtimeSocket.ts` as the `RealtimeEvent` union — that file is the source of truth for exact shapes, not this table.

---

## 5. `notifyUser()` already gives you this for free

If what you're building is "tell a user something happened" and it belongs in the notification bell / is worth persisting for later, **don't call `pushToUser` directly — call `notifyUser`/`notifyUsers`** (`backend/src/modules/notifications/index.ts`). It writes the durable DB row (so it's still there if the user's offline right now) *and* calls `pushToUser` with a `notification` event for instant delivery, *and* best-effort Web Push for a closed tab. Every exam-results-published, broadcast, and direct-message notification already works this way — see `backend/src/modules/exams/api/routes.ts` (`POST /:id/publish`) for the pattern.

Reach for `pushToUser` directly only when the event **isn't** a notification-bell-worthy thing — `force_signout` and `calendar_event` are both this: transient, only useful to someone with a tab open right now, not something that belongs in a persisted notification list.

---

## 6. Adding a new event type — checklist

1. Backend: call `pushToUser(userId, { type: "my_new_event", ...payload })` (or fan out over `listUserIdsForSchool`) from wherever the thing happens. Ask first whether `notifyUser()` (§5) is really what you want instead.
2. Frontend: add an interface for it to the `RealtimeEvent` union in `useRealtimeSocket.ts` and add a row to the table in §4 of this doc.
3. Wherever it should be *seen*, call `useRealtimeSocket((event) => { if (event.type === 'my_new_event') ... })`. Remember the one-socket-per-call-site caveat in §3 if the consuming component can be mounted more than once.
4. Nothing else needs to change — the ticket/socket plumbing, the backend registry, and every existing consumer are all unaffected.

---

## 7. Deploy dependencies

- `NEXT_PUBLIC_BACKEND_URL` must be set on Vercel (build-time, not runtime — Next.js inlines `NEXT_PUBLIC_*` vars into the client bundle) or every socket silently tries `ws://localhost:4000` and never connects. See `instructions.txt`.
- The droplet's nginx vhost needs `Upgrade`/`Connection` passthrough on `location /` (already in `deploy/nginx/sos.dementa.space.conf`) for the WebSocket handshake to survive the reverse proxy. If nginx's TLS config ever gets regenerated (e.g. via `certbot --nginx`), double-check it didn't drop those headers from the `443` server block.
