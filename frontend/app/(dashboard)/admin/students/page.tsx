import { StudentsManager } from "@/components/admin/StudentsManager";

export default function StudentsPage() {
  return (
    <div className="w-full space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Students</h1>
        <p className="text-sm text-muted-foreground">Enroll and manage students.</p>
      </div>
      <StudentsManager />
    </div>
  );
}
