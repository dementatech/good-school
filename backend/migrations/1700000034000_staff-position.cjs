/* eslint-disable */
exports.shorthands = undefined;

// docs/design/organization-studio.md §1 — who currently (or historically)
// occupies a position. Time-bound like every other staff relationship
// (teacher-staff-module.md §2) so a leadership change or a HOD rotation
// doesn't erase who held the role and when.
//
// The "at most one active holder for an is_unique position" rule (§5) can't
// be a plain partial-unique index — it depends on `position.is_unique`, a
// column on a different table, which a Postgres index predicate can't
// reference. Enforced in the repository instead (check before insert), same
// as the doc's own framing of it as a "validation" rather than a hard
// constraint.

exports.up = (pgm) => {
  pgm.createTable("staff_position", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    staff_id: {
      type: "uuid",
      notNull: true,
      references: "staff",
      onDelete: "cascade",
    },
    position_id: {
      type: "uuid",
      notNull: true,
      references: "position",
      onDelete: "cascade",
    },
    academic_year_id: {
      type: "uuid",
      notNull: true,
      references: "academic_years",
      onDelete: "restrict",
    },
    start_date: { type: "date", notNull: true },
    end_date: { type: "date" },
    status: { type: "text", notNull: true, default: "active" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("staff_position", "staff_position_status_check", {
    check: "status in ('active','ended')",
  });
  pgm.createIndex("staff_position", ["position_id", "academic_year_id", "status"]);
  pgm.createIndex("staff_position", "staff_id");
};

exports.down = (pgm) => {
  pgm.dropTable("staff_position");
};
