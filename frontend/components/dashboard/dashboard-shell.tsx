import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { Role } from "@/lib/auth/roles";
import { AppSidebar } from "./app-sidebar";
import { UserMenu } from "./user-menu";
import { DashboardFooter } from "./dashboard-footer";

export async function DashboardShell({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <SidebarProvider>
      <AppSidebar role={role} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex-1" />
          {user && <UserMenu user={user} />}
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        <DashboardFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
