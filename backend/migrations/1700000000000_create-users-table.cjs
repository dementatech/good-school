/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.createType("user_role", ["student", "teacher", "parent", "admin"]);

  pgm.createTable("users", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    school_id: {
      type: "uuid",
      notNull: true,
    },
    system_id: {
      type: "text",
    },
    email: {
      type: "text",
    },
    phone_number: {
      type: "text",
    },
    password_hash: {
      type: "text",
      notNull: true,
    },
    role: {
      type: "user_role",
      notNull: true,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // system_id is the primary login identifier for Students/Teachers, unique per school.
  pgm.createIndex("users", ["school_id", "system_id"], {
    unique: true,
    where: "system_id IS NOT NULL",
  });

  // Parents log in by phone number; also used for SMS elsewhere.
  pgm.createIndex("users", ["school_id", "phone_number"], {
    unique: true,
    where: "phone_number IS NOT NULL",
  });

  // Email is optional for any role but still unique per school when present.
  pgm.createIndex("users", ["school_id", "email"], {
    unique: true,
    where: "email IS NOT NULL",
  });

  pgm.createIndex("users", "school_id");
};

exports.down = (pgm) => {
  pgm.dropTable("users");
  pgm.dropType("user_role");
};
