export type Role = "student" | "teacher" | "parent" | "admin";

export const ROLE_HOME: Record<Role, string> = {
  student: "/student",
  teacher: "/teacher",
  parent: "/parent",
  admin: "/admin",
};
