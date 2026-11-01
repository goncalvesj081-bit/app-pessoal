import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthLabel, shiftMonth } from "@/lib/finance/billing";

export function MonthNav({ month, basePath, extra = "" }: { month: string; basePath: string; extra?: string }) {
  return (
    <div className="flex items-center gap-1">
      <Link href={`${basePath}?m=${shiftMonth(month, -1)}${extra}`} className="rounded-lg p-1.5 text-muted hover:bg-border/50 hover:text-fg" aria-label="Mês anterior">
        <ChevronLeft size={18} />
      </Link>
      <span className="min-w-36 text-center text-sm font-medium">{monthLabel(month + "-01")}</span>
      <Link href={`${basePath}?m=${shiftMonth(month, 1)}${extra}`} className="rounded-lg p-1.5 text-muted hover:bg-border/50 hover:text-fg" aria-label="Próximo mês">
        <ChevronRight size={18} />
      </Link>
    </div>
  );
}
