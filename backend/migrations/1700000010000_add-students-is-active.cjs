/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Soft-delete for students specifically — schools want to stop seeing a
  // student who left without losing their academic history. Scoped to
  // students only; other entities (schools, academic structure) don't have
  // a real "archive" concept yet.
  pgm.addColumn("students", {
    is_active: {
      type: "boolean",
      notNull: true,
      default: true,
    },
  });

  pgm.createIndex("students", "is_active");
};

exports.down = (pgm) => {
  pgm.dropColumn("students", "is_active");
};
