/* eslint-disable */
exports.shorthands = undefined;

// Support chats: one room per school between that school's admins and the
// Dementa support team (the platform owner and support agents, the same
// people who work the support inbox). Members are kept in sync by
// communications/domain/auto-rooms.ts like the other automatic rooms.

exports.up = (pgm) => {
  pgm.dropConstraint("chat_room", "chat_room_kind_check");
  pgm.addConstraint("chat_room", "chat_room_kind_check", {
    check: "kind in ('direct','group','staff_room','announcements','class','class_parents','support')",
  });
  pgm.dropIndex("chat_room", ["school_id", "kind"], { name: "chat_room_one_per_school" });
  pgm.createIndex("chat_room", ["school_id", "kind"], {
    unique: true,
    where: "kind in ('staff_room','announcements','support')",
    name: "chat_room_one_per_school",
  });
};

exports.down = (pgm) => {
  pgm.sql(`delete from chat_room where kind = 'support'`);
  pgm.dropIndex("chat_room", ["school_id", "kind"], { name: "chat_room_one_per_school" });
  pgm.createIndex("chat_room", ["school_id", "kind"], {
    unique: true,
    where: "kind in ('staff_room','announcements')",
    name: "chat_room_one_per_school",
  });
  pgm.dropConstraint("chat_room", "chat_room_kind_check");
  pgm.addConstraint("chat_room", "chat_room_kind_check", {
    check: "kind in ('direct','group','staff_room','announcements','class','class_parents')",
  });
};
