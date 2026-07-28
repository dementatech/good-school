"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#roles", label: "Who it's for" },
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#contact", label: "Contact" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold text-primary-foreground"
            style={{ backgroundColor: "var(--primary)" }}
          >
            S
          </div>
          <span className="text-base font-semibold text-foreground">School OS</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button
            variant="ghost"
            className="h-10 px-4"
            nativeButton={false}
            render={<Link href="/login">Sign in</Link>}
          />
          <Button
            className="h-10 px-4"
            nativeButton={false}
            render={<a href="#contact">Request a demo</a>}
          />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background px-4 pb-6 md:hidden">
          <nav className="flex flex-col gap-1 pt-2">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-medium text-foreground hover:bg-muted"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              className="h-11 w-full justify-center"
              nativeButton={false}
              render={<Link href="/login">Sign in</Link>}
            />
            <Button
              className="h-11 w-full justify-center"
              nativeButton={false}
              render={
                <a href="#contact" onClick={() => setOpen(false)}>
                  Request a demo
                </a>
              }
            />
          </div>
        </div>
      )}
    </header>
  );
}
