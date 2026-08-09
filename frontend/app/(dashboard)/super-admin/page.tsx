import { SuperAdminDashboard } from "@/components/super-admin/SuperAdminDashboard";

export default function SuperAdminPage() {
  return (
    <div className="w-full space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          An overview of every school running on School OS.
        </p>
      </div>
      <SuperAdminDashboard />
    </div>
  );
}
