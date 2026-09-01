/* eslint-disable */
exports.shorthands = undefined;

// Phase 2B — expand `schools` from {id, name, theme_config} to the real tenant
// model (see frontend/components/school-onboarding-enrollment.md §2). Every new
// column is nullable or defaulted, so an existing deployment migrates without
// data loss. `name` stays as the display name — it's the FK target for users,
// academic structure and theming.

const CHECKS = {
  ownership_type: "ownership_type is null or ownership_type in ('government','private','community','religious','international')",
  registration_status: "registration_status is null or registration_status in ('registered','licensed','provisional','unregistered')",
  school_type: "school_type is null or school_type in ('day','boarding','mixed')",
  gender_composition: "gender_composition is null or gender_composition in ('boys','girls','mixed')",
  onboarding_status: "onboarding_status in ('pending_verification','active','suspended','churned')",
  data_import_source: "data_import_source is null or data_import_source in ('fresh','migrated')",
};

exports.up = (pgm) => {
  pgm.addColumns("schools", {
    // ── Identity ──────────────────────────────────────────────────────────
    legal_name: { type: "text" },
    slug: { type: "text" },

    // ── Regulatory identifiers ────────────────────────────────────────────
    emis_code: { type: "text" },
    uneb_centre_number: { type: "text" },
    ownership_type: { type: "text" },
    registration_status: { type: "text" },

    // ── Location ──────────────────────────────────────────────────────────
    district: { type: "text" },
    sub_county: { type: "text" },
    address: { type: "text" },
    gps_lat: { type: "numeric" },
    gps_lng: { type: "numeric" },

    // ── Leadership / contact (distinct from the admin LOGIN) ───────────────
    head_teacher_name: { type: "text" },
    head_teacher_contact: { type: "text" },
    phone: { type: "text" },
    email: { type: "text" },
    website: { type: "text" },

    // ── Operating profile ─────────────────────────────────────────────────
    school_type: { type: "text" },
    gender_composition: { type: "text" },
    offers_o_level: { type: "boolean", notNull: true, default: true },
    offers_a_level: { type: "boolean", notNull: true, default: true },

    // ── Platform / onboarding ─────────────────────────────────────────────
    onboarding_status: { type: "text", notNull: true, default: "pending_verification" },
    verified_at: { type: "timestamptz" },
    data_import_source: { type: "text" },

    // ── Multi-campus seam — a future `school_group` table would own this ───
    school_group_id: { type: "uuid" },
  });

  for (const [col, check] of Object.entries(CHECKS)) {
    pgm.addConstraint("schools", `schools_${col}_check`, { check });
  }

  // EMIS codes and slugs are unique across the platform when present.
  pgm.createIndex("schools", "emis_code", { unique: true, where: "emis_code is not null" });
  pgm.createIndex("schools", "slug", { unique: true, where: "slug is not null" });
  pgm.createIndex("schools", "onboarding_status");

  // Existing schools are already operating — don't drop them into
  // pending_verification.
  pgm.sql(`update schools set onboarding_status = 'active', verified_at = now() where onboarding_status = 'pending_verification';`);

  // ── school_curriculum: mark one curriculum primary per school ───────────
  pgm.addColumns("school_curriculum", {
    is_primary: { type: "boolean", notNull: true, default: false },
  });
  pgm.createIndex("school_curriculum", "school_id", {
    unique: true,
    name: "school_curriculum_one_primary_per_school",
    where: "is_primary",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("school_curriculum", "school_id", { name: "school_curriculum_one_primary_per_school" });
  pgm.dropColumns("school_curriculum", ["is_primary"]);

  for (const col of Object.keys(CHECKS)) {
    pgm.dropConstraint("schools", `schools_${col}_check`);
  }
  pgm.dropColumns("schools", [
    "legal_name", "slug", "emis_code", "uneb_centre_number", "ownership_type",
    "registration_status", "district", "sub_county", "address", "gps_lat", "gps_lng",
    "head_teacher_name", "head_teacher_contact", "phone", "email", "website",
    "school_type", "gender_composition", "offers_o_level", "offers_a_level",
    "onboarding_status", "verified_at", "data_import_source", "school_group_id",
  ]);
};
