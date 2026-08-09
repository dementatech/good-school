import { SchoolsManager } from "@/components/super-admin/SchoolsManager";

export default function SchoolsPage() {
  return (
    <div className="w-full space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Schools</h1>
        <p className="text-sm text-muted-foreground">
          Every school running on School OS, and their admin accounts.
        </p>
      </div>
      <SchoolsManager />
    </div>
  );
}
