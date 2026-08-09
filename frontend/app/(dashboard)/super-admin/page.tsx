import { SchoolsManager } from "@/components/super-admin/SchoolsManager";

export default function SuperAdminPage() {
  return (
    <div className="w-full space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Super admin</h1>
        <p className="text-sm text-muted-foreground">
          Schools running on School OS, and everyone signed up under them.
        </p>
      </div>
      <SchoolsManager />
    </div>
  );
}
