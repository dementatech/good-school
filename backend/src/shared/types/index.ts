export type Role = "student" | "teacher" | "parent" | "admin";

export interface JwtPayload {
  user_id: string;
  role: Role;
  school_id: string;
}

declare module "fastify" {
  interface FastifyRequest {
    // Populated by the auth verification hook once a route requires it.
    authUser?: JwtPayload;
  }
}
