/* eslint-disable */
exports.shorthands = undefined;

// Academic/certification documents — optional, and unlike everything else on
// the staff record, self-service: a staff member uploads their own after
// logging in, not just an admin on their behalf. `uploaded_by` distinguishes
// the two (nullable — a person uploading their own doesn't need to record
// that as a separate fact about themselves).

exports.up = (pgm) => {
  pgm.createTable("staff_document", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    staff_id: {
      type: "uuid",
      notNull: true,
      references: "staff",
      onDelete: "cascade",
    },
    title: { type: "text", notNull: true },
    mime_type: { type: "text", notNull: true },
    file_provider: { type: "text", notNull: true },
    file_ref: { type: "text", notNull: true },
    uploaded_by: {
      type: "uuid",
      references: "users",
      onDelete: "set null",
    },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("staff_document", "staff_document_file_provider_check", {
    check: "file_provider in ('local','cloudinary')",
  });
  pgm.createIndex("staff_document", "staff_id");
};

exports.down = (pgm) => {
  pgm.dropTable("staff_document");
};
