"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/financeiro", label: "Resumo" },
  { href: "/financeiro/lancamentos", label: "Lançamentos" },
  { href: "/financeiro/importar", label: "Importar" },
  { href: "/financeiro/contas", label: "Contas e cartões" },
  { href: "/financeiro/categorias", label: "Categorias" },
];

export function FinanceTabs() {
  const pathname = usePathname();
  return (
    <div className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
      {TABS.map((t) => {
        const active = t.href === "/financeiro" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${active ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
