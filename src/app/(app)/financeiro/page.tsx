import Link from "next/link";
import { CreditCard, Landmark, Upload, Wallet } from "lucide-react";
import { loadBasics, monthRange, resolveMonth } from "@/lib/finance/data";
import { billMonthFor, monthLabel } from "@/lib/finance/billing";
import { formatBRL } from "@/lib/finance/money";
import { todayISO } from "@/lib/dates";
import { MonthNav } from "@/components/finance/month-nav";
import type { Transaction } from "@/lib/finance/types";

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const month = resolveMonth((await searchParams).m);
  const { start, end } = monthRange(month);
  const { supabase, accounts, categories } = await loadBasics();
  const active = accounts.filter((a) => !a.archived);

  if (active.length === 0) {
    return (
      <div className="card space-y-3 text-sm">
        <p className="font-medium">Comece cadastrando suas contas e cartões</p>
        <p className="text-muted">Ex.: Sicoob, Mercado Pago, Nubank e Inter (conta) + cartões Nubank e Inter.</p>
        <Link href="/financeiro/contas" className="btn-primary inline-block">Cadastrar contas</Link>
      </div>
    );
  }

  const today = todayISO();
  const cards = active.filter((a) => a.kind === "credit_card");
  const billMonths = [...new Set(cards.map((c) => billMonthFor(today, c.closing_day, c.due_day)))];

  const [{ data: monthTx }, { data: totals }, { data: billTx }] = await Promise.all([
    supabase.from("transactions").select("account_id,amount,category_id,kind").gte("date", start).lt("date", end),
    supabase.rpc("account_totals"),
    cards.length
      ? supabase.from("transactions").select("account_id,amount,bill_month").in("account_id", cards.map((c) => c.id)).in("bill_month", billMonths)
      : Promise.resolve({ data: [] as { account_id: string; amount: number; bill_month: string }[] }),
  ]);

  const cardIds = new Set(cards.map((c) => c.id));
  const txs = (monthTx ?? []) as Pick<Transaction, "account_id" | "amount" | "category_id" | "kind">[];

  // Entradas e saídas do mês (pagamento de fatura e transferências não contam)
  let income = 0;
  let expense = 0;
  const byCategory = new Map<string | null, number>();
  for (const t of txs) {
    if (t.kind !== "normal") continue;
    const amount = Number(t.amount);
    if (amount > 0 && !cardIds.has(t.account_id)) income += amount;
    else {
      expense += -amount; // estorno no cartão reduz o gasto
      byCategory.set(t.category_id, (byCategory.get(t.category_id) ?? 0) - amount);
    }
  }

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const ranking = [...byCategory]
    .filter(([, v]) => v > 0.005)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => ({ id, name: id ? catName.get(id) ?? "Sem categoria" : "Sem categoria", value: v }));
  const max = ranking[0]?.value ?? 1;

  const totalBy = new Map<string, number>(((totals ?? []) as { account_id: string; total: number }[]).map((t) => [t.account_id, Number(t.total)]));
  const balances = active
    .filter((a) => a.kind !== "credit_card")
    .map((a) => ({ ...a, balance: a.initial_balance + (totalBy.get(a.id) ?? 0) }));
  const totalBalance = balances.reduce((s, a) => s + a.balance, 0);

  const bills = cards.map((c) => {
    const bm = billMonthFor(today, c.closing_day, c.due_day);
    const sum = (billTx ?? []).filter((t) => t.account_id === c.id && t.bill_month === bm).reduce((s, t) => s + Number(t.amount), 0);
    return { ...c, billMonth: bm, value: -sum };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav month={month} basePath="/financeiro" />
        <Link href="/financeiro/importar" className="btn-primary flex items-center gap-1.5">
          <Upload size={16} /> Importar extrato/fatura
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Entradas" value={income} tone="success" />
        <Stat label="Saídas" value={expense} tone="danger" />
        <Stat label="Resultado do mês" value={income - expense} tone={income - expense >= 0 ? "success" : "danger"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Saldo das contas</h2>
            <span className="text-sm font-semibold tabular-nums">{formatBRL(totalBalance)}</span>
          </div>
          <ul className="space-y-2 text-sm">
            {balances.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-muted">
                  {a.kind === "wallet" ? <Wallet size={15} /> : <Landmark size={15} />} {a.name}
                </span>
                <span className={`tabular-nums ${a.balance < 0 ? "text-danger" : ""}`}>{formatBRL(a.balance)}</span>
              </li>
            ))}
          </ul>
          {bills.length > 0 && (
            <>
              <h3 className="pt-2 text-sm font-medium">Faturas abertas</h3>
              <ul className="space-y-2 text-sm">
                {bills.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-muted">
                      <CreditCard size={15} /> {b.name}
                      <span className="text-xs">· {monthLabel(b.billMonth)}{b.due_day ? `, vence dia ${b.due_day}` : ""}</span>
                    </span>
                    <span className="tabular-nums">{formatBRL(b.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-muted">Saldo diferente do banco? Em Contas e cartões, clique no lápis e informe o saldo atual.</p>
        </section>

        <section className="card space-y-3">
          <h2 className="font-medium">Gastos por categoria</h2>
          {ranking.length === 0 ? (
            <p className="text-sm text-muted">Nenhum gasto neste mês ainda.</p>
          ) : (
            <ul className="space-y-2.5">
              {ranking.map((r) => (
                <li key={r.id ?? "none"} title={`${r.name}: ${formatBRL(r.value)} (${Math.round((r.value / expense) * 100)}% das saídas)`}>
                  <Link
                    href={`/financeiro/lancamentos?m=${month}&c=${r.id ?? "none"}`}
                    className="block space-y-1 rounded-md hover:bg-border/30"
                  >
                    <div className="flex justify-between text-sm">
                      <span className={r.id ? "" : "text-muted italic"}>{r.name}</span>
                      <span className="tabular-nums text-muted">{formatBRL(r.value)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-border/60">
                      <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "success" | "danger" }) {
  return (
    <div className="card">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "danger" ? "text-danger" : "text-success"}`}>{formatBRL(value)}</p>
    </div>
  );
}
