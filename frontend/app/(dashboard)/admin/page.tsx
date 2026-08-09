import { AdminDashboard } from "@/components/admin/AdminDashboard";

export default function AdminPage() {
  return (
    <div className="w-full space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">An overview of your school.</p>
      </div>
      <AdminDashboard />
    </div>
  );
}
