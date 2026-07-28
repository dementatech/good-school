const STEPS = [
  {
    step: "1",
    title: "We set up your school",
    description: "Your school is registered as its own tenant, with your colors and logo.",
  },
  {
    step: "2",
    title: "Admin creates accounts",
    description: "Your admin adds staff, students, and parents — each one gets a System ID or uses their phone number.",
  },
  {
    step: "3",
    title: "Everyone signs in and gets to work",
    description: "No downloads, no training manuals — just a login screen and a dashboard for their role.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Live in three steps
        </h2>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-3 md:gap-6">
        {STEPS.map(({ step, title, description }) => (
          <div key={step} className="relative pl-14 md:pl-0">
            <div
              className="absolute top-0 left-0 flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-primary-foreground md:static md:mb-4"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {step}
            </div>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
