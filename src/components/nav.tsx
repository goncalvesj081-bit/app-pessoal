"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare, Home, Wallet } from "lucide-react";

const items = [
  { href: "/", label: "Início", icon: Home },
  { href: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
];

export function Nav({ variant }: { variant: "side" | "bottom" }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  if (variant === "bottom") {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface md:hidden">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
              isActive(href) ? "text-accent" : "text-muted"
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="space-y-1">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
            isActive(href) ? "bg-accent/10 text-accent font-medium" : "text-muted hover:bg-border/50 hover:text-fg"
          }`}
        >
          <Icon size={18} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
