import { randomInt } from "node:crypto";

// Uppercase letters only, no digits, and no ambiguous I/O — this gets read
// off a screen and typed by hand by whoever is handing it to the new account
// holder. Short (6 chars) on purpose: it is single-use, `must_change_password`
// forces a real password on first login.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateTempPassword(length = 6): string {
  let password = "";
  for (let i = 0; i < length; i++) {
    password += ALPHABET[randomInt(ALPHABET.length)];
  }
  return password;
}
