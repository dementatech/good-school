import jwt from "jsonwebtoken";
import type { JwtPayload } from "../../../shared/types/index.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = "7d";

export function issueToken(payload: JwtPayload): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not set");
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JwtPayload {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not set");
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
