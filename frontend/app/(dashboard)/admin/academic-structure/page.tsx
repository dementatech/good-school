import { AcademicStructureManager } from "@/components/admin/AcademicStructureManager";

export default function AcademicStructurePage() {
  return (
    <div className="w-full space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Academic structure</h1>
        <p className="text-sm text-muted-foreground">
          Academic levels, years, terms, classes, and streams for your school.
        </p>
      </div>
      <AcademicStructureManager />
    </div>
  );
}
