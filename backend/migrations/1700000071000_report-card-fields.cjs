/* eslint-disable */
exports.shorthands = undefined;

// What a school's printed report cards show, per section — the learner's
// photo, the school's address, subject remarks, attendance, signatures, ...
// A JSON object of { field: true | false } holding only what the school has
// changed; anything missing takes its default (see REPORT_CARD_FIELDS in
// section-settings.repository.ts), so a new field never needs a backfill.
// Positions keep their own column (show_positions), as before.

exports.up = (pgm) => {
  pgm.addColumns("school_section", {
    report_card_fields: { type: "jsonb" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("school_section", ["report_card_fields"]);
};
