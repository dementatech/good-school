/* eslint-disable */
exports.shorthands = undefined;

// Two additions requested after teacher-staff-module.md shipped, neither of
// which the doc's `employment_type` covers:
//
// `employment_basis` is a different axis from `employment_type`
// (government/private/pta/volunteer — who pays, real Uganda payroll/
// reporting significance per the doc §1) — this is fulltime/parttime/
// practicing, i.e. time commitment. Kept as a second column rather than
// replacing employment_type, so neither classification is lost.
//
// `photo_path` is the on-disk relative path under the uploads root (e.g.
// "staff/<userId>.jpg"), not a full URL — the API layer builds the served
// URL from it, so a photo survives APP_URL changing later. Nullable: no
// default avatar is stored, the frontend renders an initials avatar when
// this is null.

exports.up = (pgm) => {
  pgm.addColumns("staff", {
    employment_basis: { type: "text" },
    photo_path: { type: "text" },
  });

  pgm.addConstraint("staff", "staff_employment_basis_check", {
    check: "employment_basis is null or employment_basis in ('fulltime','parttime','practicing')",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint("staff", "staff_employment_basis_check");
  pgm.dropColumns("staff", ["employment_basis", "photo_path"]);
};
