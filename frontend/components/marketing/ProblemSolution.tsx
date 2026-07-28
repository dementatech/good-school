import { CheckCircle2, XCircle } from "lucide-react";

const PROBLEMS = [
  "Attendance and results locked in paper registers",
  "Parents only find out about problems at the end of term",
  "Staff juggling WhatsApp groups for official communication",
  "No single record of a student across their school life",
];

const SOLUTIONS = [
  "Attendance, grades, and records kept in one system",
  "Parents see their child's progress as it happens",
  "One place for school-wide announcements, by role",
  "A student's full history follows them, term to term",
];

export function ProblemSolution() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          The old way slows everyone down
        </h2>
        <p className="mt-4 text-muted-foreground">
          Most secondary schools still run on paper and group chats. School OS
          replaces the scramble with one system every role can rely on.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-muted-foreground">Without School OS</h3>
          <ul className="mt-4 space-y-3">
            {PROBLEMS.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-foreground">
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="rounded-2xl border p-6"
          style={{ borderColor: "var(--primary)", backgroundColor: "color-mix(in oklch, var(--primary), transparent 95%)" }}
        >
          <h3 className="text-sm font-semibold" style={{ color: "var(--primary)" }}>
            With School OS
          </h3>
          <ul className="mt-4 space-y-3">
            {SOLUTIONS.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: "var(--primary)" }} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
