/* eslint-disable */
exports.shorthands = undefined;

// Two additions to school_event:
//
// 1. `school_id` becomes nullable — a null school_id is a *global* platform
//    event (public holidays, platform maintenance), managed only by
//    super_admin and shown on every school's calendar alongside that
//    school's own events. A school_admin's events always keep a real
//    school_id; they can't see or touch another school's rows, global or
//    otherwise, beyond having global ones show up read-only on their calendar.
//
// 2. `school_exam_id` — when set, this event is the auto-synced calendar
//    marker for that exam (see events.repository.ts syncEventForExam),
//    created/updated/deleted alongside the exam rather than by hand. Unique
//    so "sync" is a straightforward find-by-exam-id upsert, and cascades on
//    exam deletion so a deleted exam doesn't leave an orphaned event.

exports.up = (pgm) => {
  pgm.alterColumn("school_event", "school_id", { notNull: false });

  pgm.addColumn("school_event", {
    school_exam_id: { type: "uuid", references: "school_exam", onDelete: "cascade" },
  });
  pgm.createIndex("school_event", "school_exam_id", { unique: true, where: "school_exam_id is not null" });

  // "What's on the calendar this month" for a viewer with no school (super_admin).
  pgm.createIndex("school_event", "event_date", {
    name: "school_event_global_date_index",
    where: "school_id is null",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("school_event", "event_date", { name: "school_event_global_date_index" });
  pgm.dropColumn("school_event", "school_exam_id");
  pgm.alterColumn("school_event", "school_id", { notNull: true });
};
