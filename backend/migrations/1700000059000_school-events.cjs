/* eslint-disable */
exports.shorthands = undefined;

// A school's calendar — holidays, meetings, deadlines, exam-window markers,
// anything worth putting a dot on a day. Deliberately simple (single date,
// no recurrence/time-of-day) for v1: the ask this closes is "the calendar is
// static and not functional," not a full scheduling system.
//
// `audience` controls who sees it beyond the school_admin managing it:
// 'all' | 'staff' | 'students' | 'parents' — one row, filtered per viewer's
// role at read time (see events.repository.ts), not fanned out into rows.

exports.up = (pgm) => {
  pgm.createTable("school_event", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    title: { type: "text", notNull: true },
    description: { type: "text" },
    event_date: { type: "date", notNull: true },
    event_type: { type: "text", notNull: true, default: "other" },
    audience: { type: "text", notNull: true, default: "all" },
    created_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("school_event", "school_event_type_check", {
    check: "event_type in ('holiday','exam','meeting','deadline','other')",
  });
  pgm.addConstraint("school_event", "school_event_audience_check", {
    check: "audience in ('all','staff','students','parents')",
  });

  // "What's happening this month" is the only query shape this table serves.
  pgm.createIndex("school_event", ["school_id", "event_date"]);
};

exports.down = (pgm) => {
  pgm.dropTable("school_event");
};
