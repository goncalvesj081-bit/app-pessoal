"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Undo2, X } from "lucide-react";
import {
  createTransaction,
  deleteTransaction,
  setTransactionCategory,
  setTransactionKind,
  undoImport,
} from "@/app/(app)/financeiro/actions";
import { formatBRL } from "@/lib/finance/money";
import { TX_KINDS, type Account, type Category, type Transaction, type TxKind } from "@/lib/finance/types";

export function CategorySelect({
  value,
  categories,
  amount,
  onChange,
  className = "",
}: {
  value: string | null;
  categories: Category[];
  amount: number;
  onChange: (v: string | null) => void;
  className?: string;
}) {
  const primary = amount > 0 ? "income" : "expense";
  const sorted = [...categories].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === primary ? -1 : 1));
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`rounded-md border border-border bg-surface px-1.5 py-1 text-xs ${value ? "" : "text-warning"} ${className}`}
      aria-label="Categoria"
    >
      <option value="">Sem categoria</option>
      {sorted.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.kind !== primary ? (c.kind === "income" ? " (receita)" : " (gasto)") : ""}
        </option>
      ))}
    </select>
  );
}

export function TransactionRow({ tx, accountName, categories }: { tx: Transaction; accountName: string; categories: Category[] }) {
  const [pending, start] = useTransition();
  const [category, setCategory] = useState(tx.category_id);
  const muted = tx.kind !== "normal";

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 ${pending ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1 basis-48">
        <p className={`truncate text-sm ${muted ? "text-muted" : ""}`} title={tx.raw_description ?? tx.description}>{tx.description}</p>
        <p className="text-xs text-muted">
          {accountName}
          {tx.installment_total ? ` · parcela ${tx.installment_current}/${tx.installment_total}` : ""}
          {muted && tx.notes ? ` · ${tx.notes} (não conta no mês)` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {tx.kind === "normal" ? (
          <CategorySelect
            value={category}
            categories={categories}
            amount={tx.amount}
            className="max-w-40"
            onChange={(v) => {
              setCategory(v);
              start(() => setTransactionCategory(tx.id, v, tx.description));
            }}
          />
        ) : null}
        <select
          value={tx.kind}
          onChange={(e) => start(() => setTransactionKind(tx.id, e.target.value as TxKind))}
          className={`max-w-32 rounded-md border border-border bg-surface px-1.5 py-1 text-xs ${muted ? "text-accent" : "text-muted"}`}
          aria-label="Tipo"
          title="Marque como pagamento de fatura ou transferência entre suas contas para não contar como gasto"
        >
          {Object.entries(TX_KINDS).map(([k, v]) => (
            <option key={k} value={k}>{k === "normal" ? (tx.amount > 0 ? "Receita" : "Gasto") : v}</option>
          ))}
        </select>
        <span className={`w-28 text-right text-sm tabular-nums ${muted ? "text-muted" : tx.amount > 0 ? "text-success" : ""}`}>
          {formatBRL(tx.amount)}
        </span>
        <button
          onClick={() => {
            if (confirm("Excluir este lançamento?")) start(() => deleteTransaction(tx.id));
          }}
          className="text-muted hover:text-danger"
          aria-label="Excluir"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </li>
  );
}

export function NewTransaction({ accounts, categories, today }: { accounts: Account[]; categories: Category[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"expense" | "income">("expense");
  const [category, setCategory] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-1" disabled={accounts.length === 0}>
        <Plus size={16} /> Novo lançamento
      </button>
    );

  return (
    <form
      ref={ref}
      action={(fd) =>
        start(async () => {
          setError("");
          fd.set("type", type);
          if (category) fd.set("category_id", category);
          try {
            await createTransaction(fd);
            ref.current?.reset();
            setCategory(null);
          } catch (e) {
            setError((e as Error).message);
          }
        })
      }
      className="card grid w-full gap-2 sm:grid-cols-6"
    >
      <div className="flex justify-between sm:col-span-6">
        <div className="flex gap-1 text-sm">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-full px-3 py-1 ${type === t ? (t === "expense" ? "bg-danger/15 text-danger" : "bg-success/15 text-success") : "text-muted"}`}
            >
              {t === "expense" ? "Saída" : "Entrada"}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-muted" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>
      <input name="description" required maxLength={300} placeholder="Descrição" className="input sm:col-span-3" />
      <input name="amount" required inputMode="decimal" placeholder="Valor (ex.: 49,90)" className="input sm:col-span-1" />
      <input name="date" type="date" required defaultValue={today} className="input sm:col-span-2" aria-label="Data" />
      <select name="account_id" required className="input sm:col-span-3" aria-label="Conta">
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <CategorySelect value={category} categories={categories} amount={type === "income" ? 1 : -1} onChange={setCategory} className="input sm:col-span-3 !text-sm" />
      {error && <p className="text-sm text-danger sm:col-span-6">{error}</p>}
      <button disabled={pending} className="btn-primary sm:col-span-6">{pending ? "Salvando..." : "Salvar"}</button>
    </form>
  );
}

export function UndoImport({ info }: { info: { id: string; filename: string; inserted_count: number; skipped_count: number } }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 text-sm">
      <div>
        <p className="font-medium">Importação: {info.filename}</p>
        <p className="text-muted">
          {info.inserted_count} lançamento(s) importado(s){info.skipped_count ? `, ${info.skipped_count} já existiam e foram ignorados` : ""}.
        </p>
      </div>
      <button
        disabled={pending}
        onClick={() => {
          if (confirm("Desfazer esta importação? Todos os lançamentos dela serão apagados."))
            start(async () => {
              await undoImport(info.id);
              router.push("/financeiro/importar");
            });
        }}
        className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-muted hover:border-danger hover:text-danger"
      >
        <Undo2 size={15} /> Desfazer importação
      </button>
    </div>
  );
}
