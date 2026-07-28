import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold text-primary-foreground"
            style={{ backgroundColor: "var(--primary)" }}
          >
            S
          </div>
          <span className="text-sm font-medium text-foreground">School OS</span>
        </div>

        <p className="text-sm text-muted-foreground">
          {`© ${new Date().getFullYear()} Dementa Technologies. Built for Uganda's secondary schools.`}
        </p>

        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
          <a href="mailto:hello@schoolos.app" className="hover:text-foreground">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
