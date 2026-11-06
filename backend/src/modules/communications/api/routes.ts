import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { MultipartFile, MultipartValue } from "@fastify/multipart";
import { requireAuth, type JwtPayload } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import { notifyUsers } from "../../notifications/index.js";
import { isOnline, pushToUser } from "../../realtime/index.js";
import { storeFile } from "../../../shared/media.js";
import { optimiseDisplayImage } from "../../../shared/image.js";
import { chatSchoolIds, findPeople, isStaff } from "../domain/people.js";
import { directChatSchool, listContacts } from "../domain/permissions.js";
import { ensureSchoolSynced } from "../domain/auto-rooms.js";
import {
  ChatError,
  SMALL_ROOM,
  accessFor,
  addMembers,
  countUnread,
  createGroup,
  getOrCreateDirect,
  getRoomDetail,
  getRoomSummary,
  listRoomsForUser,
  listSchoolRooms,
  markRead,
  memberIds,
  membersForNotify,
  removeMember,
  setMemberRole,
  setMuted,
  updateRoom,
  type Access,
} from "../domain/rooms.repository.js";
import {
  REACTION_EMOJI,
  deleteMessage,
  editMessage,
  listMessages,
  postMessage,
  roomOfMessage,
  toggleReaction,
  type ChatMessage,
} from "../domain/messages.repository.js";
import {
  addMembersBodySchema,
  createGroupBodySchema,
  editMessageBodySchema,
  memberRoleBodySchema,
  muteBodySchema,
  postMessageBodySchema,
  reactionBodySchema,
  startDirectBodySchema,
  updateRoomBodySchema,
} from "./schemas.js";

const CHAT_USER = requireAuth(["school_admin", "teacher", "student", "parent"]);
const SCHOOL_ADMIN = requireAuth(["school_admin"]);

// Pictures are shrunk on the way in (shared/image.ts); documents are kept as
// sent. Never anything executable, and never SVG (inline-script XSS risk).
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FILE_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
};

/** Where each role reads its messages, for notification links. */
const PORTAL_FOR_ROLE: Record<string, string> = {
  school_admin: "/school-admin/communications",
  teacher: "/staff/communications",
  student: "/student/communications",
  parent: "/parent/communications",
};

function me(request: FastifyRequest): JwtPayload {
  return request.authUser!;
}

function preview(message: ChatMessage): string {
  if (message.body.trim()) return message.body.slice(0, 140);
  if (message.attachment) return message.attachment.isImage ? "📷 Photo" : `📎 ${message.attachment.name}`;
  return "";
}

/** Sends a realtime event to everyone in the room (the sender's other tabs included). */
async function pushToRoom(roomId: string, event: Record<string, unknown>, except?: string): Promise<void> {
  for (const userId of await memberIds(roomId)) {
    if (userId !== except) pushToUser(userId, event);
  }
}

/** Live delivery to every member, plus a bell notification (and Web Push)
 *  where it matters: a private chat, or an announcement. Ordinary group
 *  chatter only moves the unread badge, or a busy class group would bury
 *  everyone's bell. Muted members get the live update but no notification. */
async function deliver(access: Access, message: ChatMessage, senderUserId: string): Promise<void> {
  const room = access.room;
  const members = await membersForNotify(room.id);
  const alerts = room.kind === "direct" || room.only_admins_post;
  for (const m of members) {
    // `notify` tells the tab whether to play a sound: private chats and
    // announcements only, never for the sender or a muted member.
    const notify = alerts && !m.muted && m.user_id !== senderUserId;
    pushToUser(m.user_id, { type: "chat_message", roomId: room.id, roomKind: room.kind, notify, message });
  }

  const isAnnouncement = room.only_admins_post;
  if (room.kind !== "direct" && !isAnnouncement) return;
  const senderName = message.sender?.name ?? "Someone";
  const recipients = members.filter((m) => m.user_id !== senderUserId && !m.muted);
  const byPortal = new Map<string, string[]>();
  for (const r of recipients) {
    const portal = PORTAL_FOR_ROLE[r.role];
    if (!portal) continue;
    byPortal.set(portal, [...(byPortal.get(portal) ?? []), r.user_id]);
  }
  for (const [portal, userIds] of byPortal) {
    void notifyUsers(userIds, {
      type: room.kind === "direct" ? "direct_message" : "chat_announcement",
      title: room.kind === "direct" ? senderName : (room.title ?? "Announcement"),
      body: room.kind === "direct" ? preview(message) : `${senderName}: ${preview(message)}`,
      link: `${portal}?room=${room.id}`,
    });
  }
}

function fieldValue(file: MultipartFile, name: string): string | null {
  const field = file.fields[name] as MultipartValue<string> | MultipartValue<string>[] | undefined;
  const value = Array.isArray(field) ? field[0]?.value : field?.value;
  return typeof value === "string" ? value : null;
}

export async function communicationsRoutes(fastify: FastifyInstance) {
  fastify.setErrorHandler((err, _request, reply) => {
    if (err instanceof ChatError) return reply.status(err.status).send(fail(err.message));
    throw err;
  });

  // ── Rooms ────────────────────────────────────────────────────────────────

  fastify.get("/rooms", { preHandler: CHAT_USER }, async (request) => {
    const user = me(request);
    for (const schoolId of await chatSchoolIds(user)) {
      await ensureSchoolSynced(schoolId).catch((err) => request.log.error({ err, schoolId }, "chat room sync failed"));
    }
    return ok(await listRoomsForUser(user.user_id));
  });

  fastify.get("/unread-count", { preHandler: CHAT_USER }, async (request) => {
    return ok({ count: await countUnread(me(request).user_id) });
  });

  fastify.get<{ Params: { id: string } }>("/rooms/:id", { preHandler: CHAT_USER }, async (request) => {
    const user = me(request);
    await accessFor(request.params.id, user);
    return ok({ ...(await getRoomDetail(request.params.id, user.user_id)), reactions: REACTION_EMOJI });
  });

  fastify.get<{ Querystring: { q?: string; role?: string } }>(
    "/contacts",
    { preHandler: CHAT_USER },
    async (request) => {
      return ok(await listContacts(me(request), { q: request.query.q, role: request.query.role }));
    },
  );

  fastify.post<{ Body: { userId: string } }>(
    "/rooms/direct",
    { preHandler: CHAT_USER, schema: { body: startDirectBodySchema } },
    async (request, reply) => {
      const user = me(request);
      const schoolId = await directChatSchool(user, request.body.userId);
      if (!schoolId) return reply.status(403).send(fail("You can't start a private chat with this person."));
      const id = await getOrCreateDirect(schoolId, user.user_id, request.body.userId);
      return reply.status(201).send(ok(await getRoomSummary(id, user.user_id)));
    },
  );

  fastify.post<{
    Body: { title: string; description?: string | null; onlyAdminsPost?: boolean; memberUserIds?: string[] };
  }>("/rooms/group", { preHandler: CHAT_USER, schema: { body: createGroupBodySchema } }, async (request, reply) => {
    const user = me(request);
    if (!isStaff(user.role) || !user.school_id) {
      return reply.status(403).send(fail("Only school staff can create groups."));
    }
    const id = await createGroup({
      schoolId: user.school_id,
      creatorUserId: user.user_id,
      title: request.body.title.trim(),
      description: request.body.description?.trim() || null,
      onlyAdminsPost: request.body.onlyAdminsPost ?? false,
      memberUserIds: request.body.memberUserIds ?? [],
    });
    await pushToRoom(id, { type: "chat_room_updated", roomId: id }, user.user_id);
    return reply.status(201).send(ok(await getRoomSummary(id, user.user_id)));
  });

  fastify.patch<{ Params: { id: string }; Body: { title?: string; description?: string | null; onlyAdminsPost?: boolean } }>(
    "/rooms/:id",
    { preHandler: CHAT_USER, schema: { body: updateRoomBodySchema } },
    async (request, reply) => {
      const user = me(request);
      const access = await accessFor(request.params.id, user);
      const { room } = access;
      if (!access.canModerate) return reply.status(403).send(fail("Only the group's admins can change it."));
      if (room.kind === "direct") return reply.status(400).send(fail("A private chat has no settings."));
      const automatic = room.kind !== "group";
      if (automatic && (request.body.title !== undefined || request.body.description !== undefined)) {
        return reply.status(400).send(fail("This group is managed by the school; its name can't be changed."));
      }
      if (room.kind === "announcements" && request.body.onlyAdminsPost === false) {
        return reply.status(400).send(fail("Only school admins post in school announcements."));
      }
      await updateRoom(room.id, {
        title: request.body.title?.trim(),
        description: request.body.description === undefined ? undefined : request.body.description?.trim() || null,
        onlyAdminsPost: request.body.onlyAdminsPost,
      });
      await pushToRoom(room.id, { type: "chat_room_updated", roomId: room.id });
      return ok(await getRoomDetail(room.id, user.user_id));
    },
  );

  /** Membership changes are for custom groups only; the automatic rooms follow school records. */
  async function manageable(request: FastifyRequest<{ Params: { id: string } }>): Promise<Access> {
    const access = await accessFor(request.params.id, me(request));
    if (access.room.kind !== "group") {
      throw new ChatError(400, "Members of this group follow the school's records and can't be changed here.");
    }
    return access;
  }

  fastify.post<{ Params: { id: string }; Body: { userIds: string[] } }>(
    "/rooms/:id/members",
    { preHandler: CHAT_USER, schema: { body: addMembersBodySchema } },
    async (request, reply) => {
      const access = await manageable(request);
      if (!access.canModerate) return reply.status(403).send(fail("Only the group's admins can add people."));
      const added = await addMembers(access.room.id, access.room.school_id, request.body.userIds);
      await pushToRoom(access.room.id, { type: "chat_room_updated", roomId: access.room.id });
      return ok({ added: added.length });
    },
  );

  fastify.delete<{ Params: { id: string; userId: string } }>(
    "/rooms/:id/members/:userId",
    { preHandler: CHAT_USER },
    async (request, reply) => {
      const user = me(request);
      const access = await manageable(request);
      const leaving = request.params.userId === user.user_id;
      if (!leaving && !access.canModerate) return reply.status(403).send(fail("Only the group's admins can remove people."));
      const before = await memberIds(access.room.id);
      if (!(await removeMember(access.room.id, request.params.userId))) return reply.status(404).send(fail("not_found"));
      for (const userId of before) pushToUser(userId, { type: "chat_room_updated", roomId: access.room.id });
      return ok(null);
    },
  );

  fastify.patch<{ Params: { id: string; userId: string }; Body: { role: "admin" | "member" } }>(
    "/rooms/:id/members/:userId",
    { preHandler: CHAT_USER, schema: { body: memberRoleBodySchema } },
    async (request, reply) => {
      const access = await manageable(request);
      if (!access.canModerate) return reply.status(403).send(fail("Only the group's admins can do that."));
      if (!(await setMemberRole(access.room.id, request.params.userId, request.body.role))) {
        return reply.status(404).send(fail("not_found"));
      }
      await pushToRoom(access.room.id, { type: "chat_room_updated", roomId: access.room.id });
      return ok(null);
    },
  );

  fastify.put<{ Params: { id: string }; Body: { muted: boolean } }>(
    "/rooms/:id/mute",
    { preHandler: CHAT_USER, schema: { body: muteBodySchema } },
    async (request, reply) => {
      const user = me(request);
      const access = await accessFor(request.params.id, user);
      if (!access.memberRole) return reply.status(403).send(fail("You aren't in this chat."));
      await setMuted(access.room.id, user.user_id, request.body.muted);
      pushToUser(user.user_id, { type: "chat_room_updated", roomId: access.room.id });
      return ok(null);
    },
  );

  // ── Messages ─────────────────────────────────────────────────────────────

  fastify.get<{ Params: { id: string }; Querystring: { before?: string; limit?: string } }>(
    "/rooms/:id/messages",
    { preHandler: CHAT_USER },
    async (request) => {
      await accessFor(request.params.id, me(request));
      const before = request.query.before && !Number.isNaN(Date.parse(request.query.before)) ? request.query.before : null;
      return ok(await listMessages(request.params.id, { before, limit: Number(request.query.limit) || 50 }));
    },
  );

  fastify.post<{ Params: { id: string }; Body: { body: string; replyToId?: string | null } }>(
    "/rooms/:id/messages",
    { preHandler: CHAT_USER, schema: { body: postMessageBodySchema } },
    async (request, reply) => {
      const user = me(request);
      const access = await accessFor(request.params.id, user);
      if (!access.canPost) return reply.status(403).send(fail(cantPostReason(access)));
      if (!request.body.body.trim()) return reply.status(400).send(fail("A message can't be empty."));
      const message = await postMessage({
        roomId: access.room.id,
        senderUserId: user.user_id,
        body: request.body.body,
        replyToId: request.body.replyToId ?? null,
      });
      await deliver(access, message, user.user_id);
      return reply.status(201).send(ok(message));
    },
  );

  // Multipart (5 MB, 1 file; see server.ts). Send `caption` and `replyToId`
  // fields BEFORE the file part, or they won't be read.
  fastify.post<{ Params: { id: string } }>("/rooms/:id/attachments", { preHandler: CHAT_USER }, async (request, reply) => {
    const user = me(request);
    const access = await accessFor(request.params.id, user);
    if (!access.canPost) return reply.status(403).send(fail(cantPostReason(access)));

    const uploaded = await request.file();
    if (!uploaded) return reply.status(400).send(fail("No file uploaded"));
    const isImage = IMAGE_TYPES.has(uploaded.mimetype);
    if (!isImage && !FILE_MIME_TO_EXT[uploaded.mimetype]) {
      return reply.status(400).send(fail("Send a picture (JPEG, PNG, WebP), a PDF, or a Word, Excel, PowerPoint or text file."));
    }
    let data: Buffer;
    try {
      data = await uploaded.toBuffer();
    } catch {
      return reply.status(413).send(fail("That file is too big. The limit is 5 MB."));
    }
    let mimeType = uploaded.mimetype;
    let name = (uploaded.filename || "file").slice(0, 200);
    if (isImage) {
      try {
        ({ mimeType, data } = await optimiseDisplayImage(data));
        name = name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
      } catch {
        return reply.status(400).send(fail("That file couldn't be read as a picture"));
      }
    }
    const caption = (fieldValue(uploaded, "caption") ?? "").slice(0, 4000);
    const replyToId = fieldValue(uploaded, "replyToId") || null;
    const stored = await storeFile("chat", mimeType, data, FILE_MIME_TO_EXT);
    const message = await postMessage({
      roomId: access.room.id,
      senderUserId: user.user_id,
      body: caption,
      replyToId,
      attachment: { ...stored, name, size: data.length },
    });
    await deliver(access, message, user.user_id);
    return reply.status(201).send(ok(message));
  });

  fastify.post<{ Params: { id: string } }>("/rooms/:id/read", { preHandler: CHAT_USER }, async (request) => {
    const user = me(request);
    const access = await accessFor(request.params.id, user);
    if (!access.memberRole) return ok(null); // A school admin reading in oversight leaves no trace.
    const lastReadAt = await markRead(access.room.id, user.user_id);
    const event = { type: "chat_read", roomId: access.room.id, userId: user.user_id, lastReadAt };
    const members = await memberIds(access.room.id);
    if (members.length <= SMALL_ROOM) for (const id of members) pushToUser(id, event);
    else pushToUser(user.user_id, event);
    return ok({ lastReadAt });
  });

  fastify.post<{ Params: { id: string } }>("/rooms/:id/typing", { preHandler: CHAT_USER }, async (request) => {
    const user = me(request);
    const access = await accessFor(request.params.id, user);
    if (!access.canPost) return ok(null);
    const members = await memberIds(access.room.id);
    if (members.length > SMALL_ROOM) return ok(null);
    const name = (await findPeople([user.user_id])).get(user.user_id)?.name ?? "Someone";
    const event = { type: "chat_typing", roomId: access.room.id, userId: user.user_id, name };
    for (const id of members) if (id !== user.user_id) pushToUser(id, event);
    return ok(null);
  });

  /** Loads the message's room and the caller's access to it. */
  async function messageAccess(request: FastifyRequest<{ Params: { id: string } }>): Promise<Access> {
    const roomId = await roomOfMessage(request.params.id);
    return accessFor(roomId, me(request));
  }

  fastify.patch<{ Params: { id: string }; Body: { body: string } }>(
    "/messages/:id",
    { preHandler: CHAT_USER, schema: { body: editMessageBodySchema } },
    async (request, reply) => {
      const access = await messageAccess(request);
      if (!access.memberRole || access.room.archived_at) return reply.status(403).send(fail("This chat is read-only."));
      const message = await editMessage(request.params.id, me(request).user_id, request.body.body);
      await pushToRoom(access.room.id, { type: "chat_message_updated", roomId: access.room.id, message });
      return ok(message);
    },
  );

  fastify.delete<{ Params: { id: string } }>("/messages/:id", { preHandler: CHAT_USER }, async (request) => {
    const access = await messageAccess(request);
    const message = await deleteMessage(request.params.id, me(request).user_id, access.canModerate);
    await pushToRoom(access.room.id, { type: "chat_message_updated", roomId: access.room.id, message });
    return ok(message);
  });

  fastify.post<{ Params: { id: string }; Body: { emoji: string } }>(
    "/messages/:id/reactions",
    { preHandler: CHAT_USER, schema: { body: reactionBodySchema } },
    async (request, reply) => {
      const access = await messageAccess(request);
      if (!access.memberRole || access.room.archived_at) return reply.status(403).send(fail("You can't react in this chat."));
      const message = await toggleReaction(request.params.id, me(request).user_id, request.body.emoji);
      await pushToRoom(access.room.id, { type: "chat_message_updated", roomId: access.room.id, message });
      return ok(message);
    },
  );

  // ── Presence ─────────────────────────────────────────────────────────────

  fastify.get<{ Querystring: { userIds?: string } }>("/presence", { preHandler: CHAT_USER }, async (request) => {
    const ids = (request.query.userIds ?? "").split(",").filter(Boolean).slice(0, SMALL_ROOM);
    return ok(ids.filter((id) => isOnline(id)));
  });

  // ── School admin oversight (read-only) ───────────────────────────────────

  fastify.get<{ Querystring: { q?: string; kind?: string } }>(
    "/oversight/rooms",
    { preHandler: SCHOOL_ADMIN },
    async (request, reply: FastifyReply) => {
      const user = me(request);
      if (!user.school_id) return reply.status(400).send(fail("no_school_context"));
      return ok(await listSchoolRooms(user.school_id, user.user_id, { q: request.query.q, kind: request.query.kind }));
    },
  );
}

function cantPostReason(access: Access): string {
  if (!access.memberRole) return "You can read this chat but you aren't in it.";
  if (access.room.archived_at) return "This class group is from an earlier year and is now read-only.";
  return "Only the group's admins can post here.";
}
