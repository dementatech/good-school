import { Building2, GraduationCap, ShieldCheck, Users } from "lucide-react";

const ROLES = [
  {
    icon: Building2,
    title: "Admin",
    description: "Create accounts, manage staff and students, and see the whole school at a glance.",
  },
  {
    icon: GraduationCap,
    title: "Teacher",
    description: "Take attendance, record grades, and reach parents without leaving the classroom.",
  },
  {
    icon: Users,
    title: "Parent",
    description: "Follow your child's attendance and results with a login tied to your phone number.",
  },
  {
    icon: ShieldCheck,
    title: "Student",
    description: "Check timetables and results with a System ID — no personal email required.",
  },
];

export function RoleShowcase() {
  return (
    <section id="roles" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          One system, built for every role
        </h2>
        <p className="mt-4 text-muted-foreground">
          Everyone signs into the same School OS — what they see is scoped to who
          they are.
        </p>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/30"
          >
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <Icon className="size-5" style={{ color: "var(--accent-foreground)" }} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
