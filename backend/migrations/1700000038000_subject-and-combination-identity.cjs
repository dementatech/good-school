/* eslint-disable */
exports.shorthands = undefined;

// A school can already add its own subject beyond the platform "constants"
// (core O-Level subjects, General Paper) via POST /academic/subjects, but it
// goes live immediately — no review step. This adds an approval gate
// (pending -> approved/rejected) plus a `short_name` field: subject `code`
// becomes a system-assigned sequential id (S001, S002, ...) rather than a
// typed abbreviation, so combination-name-building needs a human-typed
// abbreviation to concatenate instead — that's `short_name`.

exports.up = (pgm) => {
  pgm.addColumns("subject", {
    short_name: { type: "text" },
    status: { type: "text", notNull: true, default: "approved" },
    proposed_by_school_id: {
      type: "uuid",
      references: "schools",
      onDelete: "set null",
    },
    reviewed_by: { type: "uuid", references: "users", onDelete: "set null" },
    reviewed_at: { type: "timestamptz" },
    rejection_reason: { type: "text" },
  });

  // Backfill so existing rows stay displayable — short_name mirrors the old
  // free-typed code until an admin edits it.
  pgm.sql(`update subject set short_name = code where short_name is null`);
  pgm.alterColumn("subject", "short_name", { notNull: true });

  pgm.addConstraint("subject", "subject_status_check", {
    check: "status in ('pending', 'approved', 'rejected')",
  });

  // Same "no two subjects collide" rule the old typed code had, now on the
  // field admins actually type.
  pgm.createIndex("subject", ["curriculum_id", "phase", "short_name"], { unique: true });
};

exports.down = (pgm) => {
  pgm.dropIndex("subject", ["curriculum_id", "phase", "short_name"], { unique: true });
  pgm.dropConstraint("subject", "subject_status_check");
  pgm.dropColumns("subject", [
    "short_name",
    "status",
    "proposed_by_school_id",
    "reviewed_by",
    "reviewed_at",
    "rejection_reason",
  ]);
};
