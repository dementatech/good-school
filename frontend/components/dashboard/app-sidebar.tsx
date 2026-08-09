import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { resolveTheme } from "@/lib/theme/resolve-theme";
import type { Role } from "@/lib/auth/roles";
import { NAV_ITEMS } from "./nav-items";
import { NavMain } from "./nav-main";

export async function AppSidebar({ role }: { role: Role }) {
  const theme = await resolveTheme();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          {theme.logoUrl ? (
            // Arbitrary per-school host — can't allowlist domains for next/image ahead of time.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoUrl} alt="School logo" className="h-7 w-7 shrink-0 rounded-md" />
          ) : (
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-primary-foreground"
              style={{ backgroundColor: "var(--primary)" }}
            >
              S
            </div>
          )}
          <span className="truncate text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            School OS
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={NAV_ITEMS[role].map((item) => ({
            label: item.label,
            href: item.href,
            icon: <item.icon />,
          }))}
        />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
