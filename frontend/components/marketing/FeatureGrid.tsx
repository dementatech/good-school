import {
  ClipboardCheck,
  KeyRound,
  Lock,
  MessageCircle,
  Smartphone,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: KeyRound,
    title: "Flexible login",
    description:
      "Sign in with a System ID, phone number, or email — no student needs a personal inbox.",
  },
  {
    icon: Lock,
    title: "Secure by design",
    description:
      "Passwords are never stored in plain text, and sessions are protected against script-based attacks.",
  },
  {
    icon: ClipboardCheck,
    title: "Attendance & grades",
    description: "Teachers record attendance and results once, and it's visible to the right people instantly.",
  },
  {
    icon: MessageCircle,
    title: "Role-scoped announcements",
    description: "Reach exactly the students, parents, or staff who need to know — nobody else.",
  },
  {
    icon: Smartphone,
    title: "Installable on any device",
    description: "Add School OS to a phone or desktop home screen like a native app, no app store needed.",
  },
  {
    icon: Zap,
    title: "Fast, even on a weak connection",
    description: "Built lean from the ground up for the networks schools actually have.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="bg-muted/40 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Everything a school office needs
          </h2>
          <p className="mt-4 text-muted-foreground">
            No modules to bolt on later — the essentials are built in from day one.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
              <Icon className="size-5" style={{ color: "var(--primary)" }} />
              <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
