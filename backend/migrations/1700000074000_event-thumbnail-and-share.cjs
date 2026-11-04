/* eslint-disable */
exports.shorthands = undefined;

// An event's picture, and its public link.
//
// `thumbnail_path` + `thumbnail_provider` follow schools.logo_path/logo_provider:
// a stored-file reference plus how to read it (see shared/media.ts).
//
// `share_token` is null until someone with manage rights shares the event, and
// clearing it switches the public page off. It's a random token rather than the
// event's id so a public link can't be used to guess at other events.

exports.up = (pgm) => {
  pgm.addColumn("school_event", {
    thumbnail_path: { type: "text" },
    thumbnail_provider: { type: "text" },
    share_token: { type: "text" },
  });
  pgm.createIndex("school_event", "share_token", { unique: true, where: "share_token is not null" });
};

exports.down = (pgm) => {
  pgm.dropIndex("school_event", "share_token", { where: "share_token is not null" });
  pgm.dropColumn("school_event", ["thumbnail_path", "thumbnail_provider", "share_token"]);
};
