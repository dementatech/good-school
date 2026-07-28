import { Building2, KeyRound, ShieldCheck, Smartphone } from "lucide-react";

const ITEMS = [
  { icon: Building2, label: "Multi-school ready" },
  { icon: KeyRound, label: "System ID, phone, or email login" },
  { icon: Smartphone, label: "Installs like an app" },
  { icon: ShieldCheck, label: "Role-based access control" },
];

export function TrustStrip() {
  return (
    <section className="border-y border-border bg-muted/40">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4 md:gap-4">
        {ITEMS.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2.5">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
