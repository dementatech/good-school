import { resolveTheme } from "@/lib/theme/resolve-theme";

export async function TopBar() {
  const theme = await resolveTheme();

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
      {theme.logoUrl ? (
        // Arbitrary per-school host — can't allowlist domains for next/image ahead of time.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.logoUrl} alt="School logo" className="h-8 w-auto" />
      ) : (
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold text-primary-foreground"
          style={{ backgroundColor: "var(--primary)" }}
        >
          S
        </div>
      )}
      <span className="text-sm font-medium text-foreground">School OS</span>
    </header>
  );
}
