import { CreditCard, Landmark, Wallet } from "lucide-react";
import { loadBasics } from "@/lib/finance/data";
import { BANKS, KINDS } from "@/lib/finance/types";
import { AccountForm, AccountRow } from "@/components/finance/account-form";

export default async function ContasPage() {
  const { supabase, accounts } = await loadBasics();
  const { data: totals } = await supabase.rpc("account_totals");
  const totalBy = new Map(((totals ?? []) as { account_id: string; total: number }[]).map((t) => [t.account_id, Number(t.total)]));
  const groups = [
    { title: "Contas", icon: Landmark, items: accounts.filter((a) => a.kind === "checking") },
    { title: "Cartões de crédito", icon: CreditCard, items: accounts.filter((a) => a.kind === "credit_card") },
    { title: "Dinheiro", icon: Wallet, items: accounts.filter((a) => a.kind === "wallet") },
  ].filter((g) => g.items.length);

  return (
    <div className="space-y-5">
      <AccountForm banks={BANKS} kinds={KINDS} />
      {groups.length === 0 && <p className="card text-sm text-muted">Nenhuma conta ainda. Cadastre a primeira acima.</p>}
      {groups.map((g) => (
        <section key={g.title} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted">
            <g.icon size={16} /> {g.title}
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {g.items.map((a) => (
              <AccountRow key={a.id} account={a} bankLabel={BANKS[a.bank]} balance={a.initial_balance + (totalBy.get(a.id) ?? 0)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
