import Link from "next/link";
import { ArrowRight, GraduationCap, ShieldCheck, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const PREVIEW_CARDS = [
  { icon: Users, label: "Admin", detail: "Manage staff & students" },
  { icon: GraduationCap, label: "Teacher", detail: "Attendance & grades" },
  { icon: ShieldCheck, label: "Parent", detail: "Track your child" },
  { icon: Smartphone, label: "Student", detail: "Timetable & results" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[480px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, color-mix(in oklch, var(--primary), transparent 88%) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:items-center lg:py-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--primary)" }} />
            Built for Ugandan secondary schools
          </span>

          <h1 className="mt-5 text-4xl leading-tight font-semibold tracking-tight text-foreground sm:text-5xl">
            Run your whole school from one place
          </h1>

          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Admins, teachers, parents, and students each get a dashboard built for
            them — attendance, grades, and communication in one secure system that
            installs like an app, even on a slow connection.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              className="h-12 justify-center px-6 text-base"
              nativeButton={false}
              render={<a href="#contact">Request a demo</a>}
            />
            <Button
              variant="outline"
              className="h-12 justify-center px-6 text-base"
              nativeButton={false}
              render={
                <Link href="/login">
                  Sign in
                  <ArrowRight data-icon="inline-end" />
                </Link>
              }
            />
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            No self-signup — your school admin creates every account.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold text-primary-foreground"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  S
                </div>
                <span className="text-sm font-medium text-foreground">School OS</span>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Live
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {PREVIEW_CARDS.map(({ icon: Icon, label, detail }) => (
                <div key={label} className="rounded-xl border border-border bg-background p-3.5">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    <Icon className="size-4" style={{ color: "var(--accent-foreground)" }} />
                  </div>
                  <p className="mt-2.5 text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            className="pointer-events-none absolute -right-6 -bottom-6 -z-10 h-32 w-32 rounded-full opacity-40 blur-2xl"
            style={{ backgroundColor: "var(--accent)" }}
            aria-hidden
          />
        </div>
      </div>
    </section>
  );
}
