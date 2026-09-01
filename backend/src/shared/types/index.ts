export type Role =
  | "student"
  | "teacher"
  | "parent"
  | "school_admin"
  | "admin"
  | "super_admin";

export interface JwtPayload {
  user_id: string;
  role: Role;
  // null for super_admin — a platform-level account not scoped to any school.
  school_id: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    // Populated by the auth verification hook once a route requires it.
    authUser?: JwtPayload;
  }
}
