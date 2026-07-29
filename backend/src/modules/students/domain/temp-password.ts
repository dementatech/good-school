import { randomInt } from "node:crypto";

// No ambiguous chars (0/O, 1/I/L) — this gets read off a screen and typed
// by hand by an admin handing it to a student.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTempPassword(length = 10): string {
  let password = "";
  for (let i = 0; i < length; i++) {
    password += ALPHABET[randomInt(ALPHABET.length)];
  }
  return password;
}
