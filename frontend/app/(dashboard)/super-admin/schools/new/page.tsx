import { SchoolOnboarding } from "@/components/super-admin/SchoolOnboarding";

export default function OnboardSchoolPage() {
  return (
    <div className="w-full space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Onboard a school</h1>
        <p className="text-sm text-muted-foreground">
          Create the school, then give it its first admin login.
        </p>
      </div>
      <SchoolOnboarding />
    </div>
  );
}
