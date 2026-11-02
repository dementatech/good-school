/* eslint-disable */
exports.shorthands = undefined;

// A school's own web address (portal.stmarys.ac.ug). The app records the domain
// and checks its DNS; nginx and HTTPS are set up on the host by
// deploy/domains/provision-domains.sh, which watches this table.
//
//   pending_dns → (DNS check passes) → provisioning → active
//                                                  ↘ failed → (check again) → provisioning
//   anything set up on the host → removing → (row deleted by the host job)

exports.up = (pgm) => {
  pgm.createTable("school_domain", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "CASCADE" },
    domain: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "pending_dns" },
    last_error: { type: "text" },
    activated_at: { type: "timestamptz" },
    created_by: { type: "uuid", references: "users", onDelete: "SET NULL" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("school_domain", "school_domain_status_check", {
    check: "status in ('pending_dns','provisioning','active','failed','removing')",
  });
  pgm.addConstraint("school_domain", "school_domain_domain_lowercase_check", {
    check: "domain = lower(domain)",
  });
  // One address per school, and an address belongs to one school.
  pgm.createIndex("school_domain", "school_id", { unique: true });
  pgm.createIndex("school_domain", "domain", { unique: true });
};

exports.down = (pgm) => {
  pgm.dropTable("school_domain");
};
