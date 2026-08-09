export type Role = "student" | "teacher" | "parent" | "admin" | "super_admin";

export const ROLE_HOME: Record<Role, string> = {
  student: "/student",
  teacher: "/teacher",
  parent: "/parent",
  admin: "/admin",
  super_admin: "/super-admin",
};
