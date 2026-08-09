import {
  Building2Icon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth/roles";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Mirrors ROLE_HOME's per-role keying (lib/auth/roles.ts) — same shape, same
// spirit. Thin today (most roles have exactly one page); the point is that
// adding a page later is a one-line addition here, not new markup.
export const NAV_ITEMS: Record<Role, NavItem[]> = {
  super_admin: [{ label: "Schools", href: "/super-admin", icon: Building2Icon }],
  admin: [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboardIcon },
    { label: "Academic structure", href: "/admin/academic-structure", icon: GraduationCapIcon },
    { label: "Students", href: "/admin/students", icon: UsersIcon },
  ],
  teacher: [{ label: "Dashboard", href: "/teacher", icon: LayoutDashboardIcon }],
  parent: [{ label: "Dashboard", href: "/parent", icon: LayoutDashboardIcon }],
  student: [{ label: "Dashboard", href: "/student", icon: LayoutDashboardIcon }],
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  teacher: "Teacher",
  parent: "Parent",
  student: "Student",
};
