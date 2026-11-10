/* eslint-disable */
exports.shorthands = undefined;

// Voice notes in chat. The audio itself is an ordinary attachment (see
// 1700000075000_chat.cjs); these say it was recorded in the app, how long it
// runs, and the bar heights for its waveform (0-100 each, drawn by the
// player without decoding the file). Length is stored because recordings
// made in the browser often carry no duration in the file itself.

exports.up = (pgm) => {
  pgm.addColumns("chat_message", {
    is_voice_note: { type: "boolean", notNull: true, default: false },
    attachment_duration_ms: { type: "integer" },
    attachment_waveform: { type: "smallint[]" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("chat_message", ["is_voice_note", "attachment_duration_ms", "attachment_waveform"]);
};
