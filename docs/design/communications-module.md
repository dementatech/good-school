# Communications Module (Chat) — Reference

Realtime chat for every school role: private chats, custom groups, automatic school groups and announcements. Backend: `backend/src/modules/communications/`. Frontend: `frontend/components/chat/` (the one `ChatApp` used by all four portals) and `frontend/lib/communications/`. It replaces the first slice (admin ↔ teacher threads and one-way broadcasts, migration `1700000061000`). Migration `1700000075000_chat.cjs` copies those old threads over and keeps their ids, so old notification links still open.

---

## 1. Rooms

Everything is a `chat_room` with `chat_member` rows. The `kind` decides how a room gets its members:

| Kind | Members | Who runs it | Posting |
|---|---|---|---|
| `direct` | Two people | Nobody | Both |
| `group` | Chosen by its creator (staff only) | The creator, plus anyone they make admin | Everyone, or admins only |
| `staff_room` | Every school admin and teacher (automatic) | School admins | Everyone |
| `announcements` | Everyone at the school: staff, learners, parents (automatic) | School admins | **Admins only, always** |
| `class` | One per class, or per stream where the class has streams, in the current year: its learners plus subject teachers (automatic) | Class and stream teacher | Everyone, or admins only |
| `class_parents` | The same grouping: the learners' parents (automatic) | Class and stream teacher | Everyone, or admins only |

**Automatic rooms** (`domain/auto-rooms.ts`) follow staff accounts, enrollment, teacher assignments and guardian links. Nothing hooks those writes. Instead, a school is re-synced lazily when someone opens chat, at most once a minute per school (`ensureSchoolSynced`). Call `markSchoolStale(schoolId)` (exported from the module) to force the next open to re-sync. New members join with everything marked read. Class rooms from an earlier year are archived (read-only), not deleted. Automatic rooms can't be renamed, and their members can't be edited by hand. Room admins can switch on "only admins can post".

**Parents have no `school_id`.** Their schools come from their children (`people.ts` `chatSchoolIds`). That is why access is always checked through membership, never through `authUser.school_id`.

## 2. Who may start a private chat (`domain/permissions.ts`)

The school chose the **staff-supervised** rule:

- **School admin, teacher**: anyone at the school (staff, learners, parents of its learners).
- **Parent**: staff at a school one of their children attends.
- **Student**: the school's admins, plus teachers who teach them this year (class, stream or subject teacher).
- No student ↔ student and no parent ↔ parent private chats. Only staff create groups.

**Oversight.** A school admin can open any room in their school read-only (`GET /oversight/rooms`, plus the ordinary message endpoints), including private chats. Reading in oversight doesn't mark anything read. Every private chat shows "School admins can review chats to keep everyone safe." School admins and room admins can delete any message as moderation.

## 3. Messages

Text up to 4,000 characters, one attachment per message, quote replies, edit (own only), soft delete ("This message was deleted"; the file is removed from storage), and six fixed reactions (`REACTION_EMOJI`). Attachments: JPEG, PNG or WebP pictures (shrunk to JPEG by `shared/image.ts`), PDF, Word, Excel, PowerPoint, TXT and CSV. The limit is 5 MB, the global multipart limit in `server.ts`. Files go through `shared/media.ts` (Cloudinary or local disk) and are served from unguessable public URLs, the same as other uploads.

## 4. Delivery and notifications

- Every new message is pushed live (`chat_message`) to every member. See `realtime-module.md` §4 for all chat events.
- **Bell notification and Web Push only for private chats and announcement-mode rooms**, never for ordinary group chatter. A busy class group would otherwise bury everyone's bell. Group messages move the unread badge only.
- Muted members get the live update but no notification or sound.
- Typing and read events are only sent in rooms of 300 members or fewer (`SMALL_ROOM`). Read ticks show in rooms of 50 others or fewer.
- Presence (online dots) comes from the realtime registry: `isOnline`, `onPresenceChange`. It is told to a person's private-chat partners.

## 5. Known limits

- The realtime registry is in-memory, one process only (see `realtime-module.md` §2). The same goes for the one-minute sync throttle.
- There's no full-text message search, and nothing is delivered by SMS or email.
- Unread counts are computed by query; there's no counter table. That's fine at current sizes. Revisit if `countUnread` shows up as slow.
