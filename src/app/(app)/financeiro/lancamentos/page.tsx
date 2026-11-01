import Link from "next/link";
import { loadBasics, monthRange, resolveMonth } from "@/lib/finance/data";
import { formatBRL } from "@/lib/finance/money";
import { todayISO } from "@/lib/dates";
import { MonthNav } from "@/components/finance/month-nav";
import { NewTransaction, TransactionRow, UndoImport } from "@/components/finance/transactions";
import type { Transaction } from "@/lib/finance/types";

type SP = { m?: string; a?: string; c?: string; i?: string };

export default async function LancamentosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const month = resolveMonth(sp.m);
  const { start, end } = monthRange(month);
  const { supabase, accounts, categories } = await loadBasics();

  let query = supabase
    .from("transactions")
    .select("id,account_id,date,description,amount,category_id,kind,bill_month,installment_current,installment_total,import_id")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);

  let importInfo: { id: string; filename: string; inserted_count: number; skipped_count: number } | null = null;
  if (sp.i) {
    query = query.eq("import_id", sp.i);
    const { data } = await supabase.from("imports").select("id,filename,inserted_count,skipped_count").eq("id", sp.i).maybeSingle();
    importInfo = data;
  } else {
    query = query.gte("date", start).lt("date", end);
  }
  if (sp.a) query = query.eq("account_id", sp.a);
  if (sp.c === "none") query = query.is("category_id", null);
  else if (sp.c) query = query.eq("category_id", sp.c);

  const { data } = await query;
  const txs = ((data ?? []) as Transaction[]).map((t) => ({ ...t, amount: Number(t.amount) }));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const total = txs.filter((t) => t.kind === "normal").reduce((s, t) => s + t.amount, 0);

  // agrupa por dia
  const days = new Map<string, Transaction[]>();
  for (const t of txs) days.set(t.date, [...(days.get(t.date) ?? []), t]);

  const keep = (k: keyof SP, v?: string) => {
    const p = new URLSearchParams();
    for (const key of ["m", "a", "c"] as const) {
      const val = key === k ? v : sp[key];
      if (val) p.set(key, val);
    }
    return `/financeiro/lancamentos?${p.toString()}`;
  };
  const extra = [sp.a && `&a=${sp.a}`, sp.c && `&c=${sp.c}`].filter(Boolean).join("");
  const activeAccounts = accounts.filter((a) => !a.archived);

  return (
    <div className="space-y-4">
      {importInfo ? (
        <UndoImport info={importInfo} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MonthNav month={month} basePath="/financeiro/lancamentos" extra={extra} />
          <NewTransaction accounts={activeAccounts} categories={categories} today={todayISO()} />
        </div>
      )}

      {!importInfo && (
        <div className="flex flex-wrap gap-2 text-sm">
          <FilterSelect label="Conta" current={sp.a} options={accounts.map((a) => [a.id, a.name])} hrefFor={(v) => keep("a", v)} />
          <FilterSelect
            label="Categoria"
            current={sp.c}
            options={[["none", "Sem categoria"], ...categories.map((c) => [c.id, c.name] as [string, string])]}
            hrefFor={(v) => keep("c", v)}
          />
        </div>
      )}

      <div className="flex justify-between text-sm text-muted">
        <span>{txs.length} lançamento(s)</span>
        <span>
          Saldo do período: <span className={`tabular-nums ${total < 0 ? "text-danger" : "text-success"}`}>{formatBRL(total)}</span>
        </span>
      </div>

      {txs.length === 0 ? (
        <p className="card text-sm text-muted">
          Nada por aqui. <Link href="/financeiro/importar" className="text-accent">Importe um extrato</Link> ou adicione um lançamento.
        </p>
      ) : (
        [...days].map(([date, list]) => (
          <section key={date} className="space-y-1.5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
              {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
            </h3>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {list.map((t) => (
                <TransactionRow key={t.id} tx={t} accountName={accountName.get(t.account_id) ?? ""} categories={categories} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function FilterSelect({
  label,
  current,
  options,
  hrefFor,
}: {
  label: string;
  current?: string;
  options: [string, string][];
  hrefFor: (v?: string) => string;
}) {
  const currentLabel = options.find(([v]) => v === current)?.[1];
  return (
    <details className="relative">
      <summary className={`cursor-pointer list-none rounded-full border px-3 py-1 ${current ? "border-accent text-accent" : "border-border text-muted"}`}>
        {currentLabel ?? label} ▾
      </summary>
      <div className="absolute z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg">
        <Link href={hrefFor(undefined)} className="block rounded px-2 py-1.5 text-muted hover:bg-border/50">Todas</Link>
        {options.map(([v, l]) => (
          <Link key={v} href={hrefFor(v)} className={`block rounded px-2 py-1.5 hover:bg-border/50 ${v === current ? "text-accent" : ""}`}>
            {l}
          </Link>
        ))}
      </div>
    </details>
  );
}
