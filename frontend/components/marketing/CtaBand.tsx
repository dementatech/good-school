import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaBand() {
  return (
    <section id="contact" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
      <div
        className="flex flex-col items-center gap-6 rounded-3xl px-6 py-14 text-center sm:px-12"
        style={{ backgroundColor: "var(--primary)" }}
      >
        <h2 className="text-3xl font-semibold tracking-tight text-primary-foreground sm:text-4xl">
          Ready to bring your school online?
        </h2>
        <p className="max-w-xl text-primary-foreground/85">
          Tell us about your school and we&apos;ll set up a walkthrough for your
          admin team.
        </p>
        <Button
          variant="secondary"
          className="h-12 px-6 text-base"
          nativeButton={false}
          render={
            <a href="mailto:hello@schoolos.app">
              <Mail data-icon="inline-start" />
              hello@schoolos.app
            </a>
          }
        />
      </div>
    </section>
  );
}
