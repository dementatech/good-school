/* eslint-disable */
exports.shorthands = undefined;

// First slice of the communications module: school-admin <-> teacher direct
// messaging, plus a record of the two broadcast kinds (admin -> all teachers,
// teacher -> his own class). Broadcasts fan out through the existing
// `notification` table (notifyUsers(), see notifications/index.ts) — this
// migration only adds a row so the sender can see what they've sent; it
// never stores per-recipient broadcast state.

exports.up = (pgm) => {
  // One thread per (admin, teacher) pair. Either side can reply once it
  // exists; only the admin side can create one (see conversations.repository.ts).
  pgm.createTable("conversation", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    admin_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    teacher_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    // Null until that side ever opens the thread — read status is "every
    // message after this timestamp, not sent by me, is unread".
    admin_last_read_at: { type: "timestamptz" },
    teacher_last_read_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("conversation", ["admin_user_id", "teacher_user_id"], { unique: true });
  pgm.createIndex("conversation", "teacher_user_id");

  pgm.createTable("conversation_message", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    conversation_id: { type: "uuid", notNull: true, references: "conversation", onDelete: "cascade" },
    sender_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    body: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("conversation_message", ["conversation_id", "created_at"]);

  pgm.createTable("broadcast", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    sender_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    // 'teachers' (school_admin -> every teacher) or 'class' (teacher -> his class).
    scope: { type: "text", notNull: true },
    class_id: { type: "uuid", references: "classes", onDelete: "set null" },
    stream_id: { type: "uuid", references: "streams", onDelete: "set null" },
    title: { type: "text", notNull: true },
    body: { type: "text", notNull: true },
    recipient_count: { type: "integer", notNull: true, default: 0 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("broadcast", ["school_id", "sender_user_id", "created_at"]);
};

exports.down = (pgm) => {
  pgm.dropTable("broadcast");
  pgm.dropTable("conversation_message");
  pgm.dropTable("conversation");
};
