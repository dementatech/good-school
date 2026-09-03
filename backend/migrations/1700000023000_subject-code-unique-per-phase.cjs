/* eslint-disable */
exports.shorthands = undefined;

// Bugfix, surfaced while building Phase 3B: `subject` was made unique on
// (curriculum_id, code) in migration 12000, before `phase` existed (added in
// 14000) — so "PHY" as an O-Level subject and "PHY" as a separate A-Level
// subject (a completely normal, expected case — see
// docs/design/uganda-secondary-school-foundations.md §3) collide on the same
// real-world subject code. Scope the uniqueness to (curriculum_id, phase,
// code) instead — O-Level and A-Level are different syllabi and should be
// free to reuse the same code.

exports.up = (pgm) => {
  pgm.dropIndex("subject", ["curriculum_id", "code"], { unique: true });
  pgm.createIndex("subject", ["curriculum_id", "phase", "code"], { unique: true });
};

exports.down = (pgm) => {
  pgm.dropIndex("subject", ["curriculum_id", "phase", "code"], { unique: true });
  pgm.createIndex("subject", ["curriculum_id", "code"], { unique: true });
};
