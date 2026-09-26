/* eslint-disable */
exports.shorthands = undefined;

// The support desk: anyone signed in reports what isn't working or what's
// missing; the platform owner works through them and replies, and the reporter
// is notified as the ticket moves.
//
// The platform owner is a super_admin with `is_platform_owner` set — a flag,
// not a new role, so every super_admin route keeps working for them unchanged
// and only the owner-only surfaces (the support inbox) check the flag.
//
// Support agents are super_admins the owner has asked to help: they work the
// inbox too (reply, change status) but can't make anyone else an agent —
// granting either flag is a server-side script.

exports.up = (pgm) => {
  pgm.addColumn("users", {
    is_platform_owner: { type: "boolean", notNull: true, default: false },
  });
  pgm.addConstraint("users", "users_platform_owner_is_super_admin", {
    check: "not is_platform_owner or role = 'super_admin'",
  });
  pgm.addColumn("users", {
    is_support_agent: { type: "boolean", notNull: true, default: false },
  });
  pgm.addConstraint("users", "users_support_agent_is_super_admin", {
    check: "not is_support_agent or role = 'super_admin'",
  });

  pgm.createTable("support_ticket", {
    id: { type: "serial", primaryKey: true },
    reporter_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    // The reporter's school at the time of reporting — null for a super_admin.
    school_id: { type: "uuid", references: "schools", onDelete: "set null" },
    reporter_role: { type: "text", notNull: true },
    kind: { type: "text", notNull: true },
    subject: { type: "text", notNull: true },
    description: { type: "text", notNull: true },
    // The page the reporter was on, so a bug can be reproduced.
    page_url: { type: "text" },
    status: { type: "text", notNull: true, default: "open" },
    resolved_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("support_ticket", "support_ticket_kind_check", {
    check: "kind in ('problem', 'feature', 'question')",
  });
  pgm.addConstraint("support_ticket", "support_ticket_status_check", {
    check: "status in ('open', 'in_progress', 'resolved', 'closed')",
  });
  pgm.addConstraint("support_ticket", "support_ticket_subject_check", {
    check: "length(trim(subject)) between 1 and 150",
  });
  pgm.createIndex("support_ticket", ["reporter_id", "created_at"]);
  pgm.createIndex("support_ticket", ["status", "created_at"]);

  // The conversation under a ticket — the owner's answers and the reporter's
  // follow-ups ("still broken on my phone").
  pgm.createTable("support_ticket_reply", {
    id: { type: "serial", primaryKey: true },
    ticket_id: { type: "integer", notNull: true, references: "support_ticket", onDelete: "cascade" },
    author_id: { type: "uuid", references: "users", onDelete: "set null" },
    from_support: { type: "boolean", notNull: true },
    body: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("support_ticket_reply", ["ticket_id", "created_at"]);
};

exports.down = (pgm) => {
  pgm.dropTable("support_ticket_reply");
  pgm.dropTable("support_ticket");
  pgm.dropConstraint("users", "users_support_agent_is_super_admin");
  pgm.dropColumn("users", "is_support_agent");
  pgm.dropConstraint("users", "users_platform_owner_is_super_admin");
  pgm.dropColumn("users", "is_platform_owner");
};
