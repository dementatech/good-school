/* eslint-disable */
exports.shorthands = undefined;

// First slice of a system-wide notification system (in-app feed + Web Push).
// frontend/components/ui/NotificationBell.tsx and the parent /notifications
// page were already built against this exact shape but feature-flagged off
// pending a real backend — see frontend/lib/features.ts.
//
// `notification.id` is a plain serial (not uuid, unlike the rest of the
// schema) because the existing frontend contract types it as `id: number`.

exports.up = (pgm) => {
  pgm.createTable("notification", {
    id: { type: "serial", primaryKey: true },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    // e.g. 'exam_results_published' — a free-text tag, not an enum: the set
    // of event types will grow as more of the system starts calling
    // notifyUser(), and a new kind should never need a migration.
    type: { type: "text", notNull: true },
    title: { type: "text", notNull: true },
    body: { type: "text", notNull: true, default: "" },
    link: { type: "text" },
    is_read: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  // The feed query (latest N for a user) and the unread-count query are the
  // only two reads this table ever serves.
  pgm.createIndex("notification", ["user_id", "created_at"]);
  pgm.createIndex("notification", ["user_id", "is_read"]);

  // One row per browser/device a user has granted push permission on.
  // `endpoint` is globally unique by construction (it's a per-registration
  // URL the push service mints), which also makes it the natural conflict
  // target for re-subscribing the same device.
  pgm.createTable("push_subscription", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    endpoint: { type: "text", notNull: true, unique: true },
    p256dh: { type: "text", notNull: true },
    auth: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("push_subscription", "user_id");
};

exports.down = (pgm) => {
  pgm.dropTable("push_subscription");
  pgm.dropTable("notification");
};
