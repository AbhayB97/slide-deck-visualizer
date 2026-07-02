"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/draw/slot-machine", label: "Draw" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-foreground">
          <ShieldCheck size={20} className="text-primary" />
          <span>Security Awareness</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {links.map((link) => {
            const isActive =
              link.href === "/" ? pathname === "/" : pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  isActive
                    ? "bg-primary-soft text-primary"
                    : "text-foreground/60 hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
