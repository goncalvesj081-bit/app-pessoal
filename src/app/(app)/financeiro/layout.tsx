import { FinanceTabs } from "@/components/finance/tabs";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
      <FinanceTabs />
      {children}
    </div>
  );
}
