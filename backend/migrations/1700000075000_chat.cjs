/* eslint-disable */
exports.shorthands = undefined;

// The chat system that replaces the first communications slice (migration
// 1700000061000). One model covers every kind of conversation:
//
//   direct        two people. Who may start one is decided in
//                 communications/domain/permissions.ts (staff-supervised:
//                 staff can message anyone in the school; students and
//                 parents can message staff only).
//   group         a custom group a staff member created.
//   staff_room    automatic, one per school: every school admin and teacher.
//   announcements automatic, one per school: everyone. Only school admins post.
//   class         automatic, one per class (or per stream when the class has
//                 streams) in the current academic year: its class/stream
//                 teacher plus the enrolled students.
//   class_parents automatic, same grouping: the teacher plus the parents of
//                 those students.
//
// The automatic rooms are kept in sync with staff, enrollment and guardian
// links by communications/domain/auto-rooms.ts, not by triggers.
//
// The old `conversation` threads are copied into direct rooms with the SAME
// id, so links already sitting in people's notification bells
// (`?conversation=<id>`) keep working. The old tables are left in place,
// unread, rather than dropped, so this migration loses nothing.

exports.up = (pgm) => {
  pgm.createTable("chat_room", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    kind: { type: "text", notNull: true },
    title: { type: "text" },
    description: { type: "text" },
    // Announcement mode: only room admins may post. Always on for
    // `announcements`; a toggle for every other group kind.
    only_admins_post: { type: "boolean", notNull: true, default: false },
    // Sorted "<userA>:<userB>" for direct rooms, so a pair can only ever have one.
    direct_key: { type: "text" },
    class_id: { type: "uuid", references: "classes", onDelete: "cascade" },
    stream_id: { type: "uuid", references: "streams", onDelete: "cascade" },
    created_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    // Denormalised for ordering the room list without a lateral join per room.
    last_message_at: { type: "timestamptz" },
    // Automatic rooms whose class/stream left the current year are archived,
    // not deleted, so their history stays readable.
    archived_at: { type: "timestamptz" },
  });
  pgm.addConstraint("chat_room", "chat_room_kind_check", {
    check: "kind in ('direct','group','staff_room','announcements','class','class_parents')",
  });
  pgm.createIndex("chat_room", "direct_key", { unique: true, where: "direct_key is not null" });
  pgm.createIndex("chat_room", ["school_id", "kind"], {
    unique: true,
    where: "kind in ('staff_room','announcements')",
    name: "chat_room_one_per_school",
  });
  pgm.sql(
    `create unique index chat_room_one_per_class on chat_room
       (kind, class_id, coalesce(stream_id, '00000000-0000-0000-0000-000000000000'::uuid))
     where kind in ('class','class_parents')`,
  );
  pgm.createIndex("chat_room", ["school_id", "last_message_at"]);

  pgm.createTable("chat_member", {
    room_id: { type: "uuid", notNull: true, references: "chat_room", onDelete: "cascade" },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    // 'admin' may post in announcement mode, rename, and manage members.
    role: { type: "text", notNull: true, default: "member" },
    // Every message after this, not sent by me, is unread.
    last_read_at: { type: "timestamptz" },
    muted: { type: "boolean", notNull: true, default: false },
    joined_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("chat_member", "chat_member_pkey", { primaryKey: ["room_id", "user_id"] });
  pgm.addConstraint("chat_member", "chat_member_role_check", { check: "role in ('admin','member')" });
  pgm.createIndex("chat_member", "user_id");

  pgm.createTable("chat_message", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    room_id: { type: "uuid", notNull: true, references: "chat_room", onDelete: "cascade" },
    sender_user_id: { type: "uuid", references: "users", onDelete: "set null" },
    body: { type: "text", notNull: true, default: "" },
    reply_to_id: { type: "uuid", references: "chat_message", onDelete: "set null" },
    // One file per message. A picture or document plus an optional caption in `body`.
    attachment_ref: { type: "text" },
    attachment_provider: { type: "text" },
    attachment_mime: { type: "text" },
    attachment_name: { type: "text" },
    attachment_size: { type: "integer" },
    edited_at: { type: "timestamptz" },
    // Soft delete: the bubble stays as "This message was deleted".
    deleted_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("chat_message", "chat_message_provider_check", {
    check: "attachment_provider is null or attachment_provider in ('local','cloudinary')",
  });
  pgm.createIndex("chat_message", ["room_id", "created_at"]);

  pgm.createTable("chat_reaction", {
    message_id: { type: "uuid", notNull: true, references: "chat_message", onDelete: "cascade" },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    emoji: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("chat_reaction", "chat_reaction_pkey", { primaryKey: ["message_id", "user_id", "emoji"] });

  // ── Carry the old admin <-> teacher threads over ─────────────────────────
  pgm.sql(`
    insert into chat_room (id, school_id, kind, direct_key, created_by, created_at, last_message_at)
    select c.id, c.school_id, 'direct',
           least(c.admin_user_id::text, c.teacher_user_id::text) || ':' ||
             greatest(c.admin_user_id::text, c.teacher_user_id::text),
           c.admin_user_id, c.created_at,
           (select max(m.created_at) from conversation_message m where m.conversation_id = c.id)
      from conversation c
  `);
  pgm.sql(`
    insert into chat_member (room_id, user_id, role, last_read_at, joined_at)
    select id, admin_user_id, 'member', admin_last_read_at, created_at from conversation
    union all
    select id, teacher_user_id, 'member', teacher_last_read_at, created_at from conversation
  `);
  pgm.sql(`
    insert into chat_message (id, room_id, sender_user_id, body, created_at)
    select id, conversation_id, sender_user_id, body, created_at from conversation_message
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("chat_reaction");
  pgm.dropTable("chat_message");
  pgm.dropTable("chat_member");
  pgm.dropTable("chat_room");
};
