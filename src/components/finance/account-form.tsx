"use client";

import { useRef, useState, useTransition } from "react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { createAccount, setAccountArchived, updateAccount } from "@/app/(app)/financeiro/actions";
import { formatBRL } from "@/lib/finance/money";
import type { Account, AccountKind, Bank } from "@/lib/finance/types";

export function AccountForm({ banks, kinds }: { banks: Record<Bank, string>; kinds: Record<AccountKind, string> }) {
  const ref = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<AccountKind>("checking");
  const [bank, setBank] = useState<Bank>("nubank");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const suggestedName = kind === "wallet" ? "Carteira" : `${kind === "credit_card" ? "Cartão " : ""}${banks[bank]}`;

  return (
    <form
      ref={ref}
      action={(fd) =>
        start(async () => {
          setError("");
          if (!String(fd.get("name") ?? "").trim()) fd.set("name", suggestedName);
          try {
            await createAccount(fd);
            ref.current?.reset();
            setKind("checking");
          } catch (e) {
            setError((e as Error).message);
          }
        })
      }
      className="card space-y-3"
    >
      <p className="text-sm font-medium">Nova conta ou cartão</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)} className="input" aria-label="Tipo">
          {Object.entries(kinds).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {kind !== "wallet" ? (
          <select name="bank" value={bank} onChange={(e) => setBank(e.target.value as Bank)} className="input" aria-label="Banco">
            {Object.entries(banks).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        ) : (
          <input type="hidden" name="bank" value="outro" />
        )}
        <input name="name" placeholder={suggestedName} maxLength={60} className="input" aria-label="Nome" />
      </div>
      {kind === "credit_card" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            Dia que a fatura fecha
            <input name="closing_day" type="number" min={1} max={31} placeholder="ex.: 8" className="input mt-1" />
          </label>
          <label className="text-xs text-muted">
            Dia do vencimento
            <input name="due_day" type="number" min={1} max={31} placeholder="ex.: 15" className="input mt-1" />
          </label>
        </div>
      ) : (
        <p className="text-xs text-muted">
          O saldo você informa depois: importe os extratos e então clique no lápis da conta e coloque o saldo que aparece hoje no app do banco.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <button disabled={pending} className="btn-primary flex items-center gap-1">
        <Plus size={16} /> {pending ? "Salvando..." : "Adicionar"}
      </button>
    </form>
  );
}

export function AccountRow({ account: a, bankLabel, balance }: { account: Account; bankLabel: string; balance: number }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <li className="p-4">
        <form
          action={(fd) =>
            start(async () => {
              await updateAccount(a.id, fd);
              setEditing(false);
            })
          }
          className="grid gap-2 sm:grid-cols-4"
        >
          <input name="name" defaultValue={a.name} required maxLength={60} className="input sm:col-span-2" aria-label="Nome" />
          {a.kind === "credit_card" ? (
            <>
              <input name="closing_day" type="number" min={1} max={31} defaultValue={a.closing_day ?? ""} placeholder="Fecha dia" className="input" aria-label="Fecha dia" />
              <input name="due_day" type="number" min={1} max={31} defaultValue={a.due_day ?? ""} placeholder="Vence dia" className="input" aria-label="Vence dia" />
            </>
          ) : (
            <label className="text-xs text-muted sm:col-span-2">
              Saldo atual (igual ao app do banco hoje)
              <input
                name="current_balance"
                inputMode="decimal"
                defaultValue={balance.toFixed(2).replace(".", ",")}
                className="input mt-1"
              />
            </label>
          )}
          <div className="flex gap-2 sm:col-span-4">
            <button disabled={pending} className="btn-primary">Salvar</button>
            <button type="button" onClick={() => setEditing(false)} className="px-3 text-sm text-muted">Cancelar</button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${a.archived ? "opacity-50" : ""} ${pending ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{a.name}</p>
        <p className="text-xs text-muted">
          {bankLabel}
          {a.kind === "credit_card"
            ? ` · fecha dia ${a.closing_day ?? "?"}, vence dia ${a.due_day ?? "?"}`
            : ` · saldo ${formatBRL(balance)}`}
          {a.archived && " · arquivada"}
        </p>
      </div>
      <button onClick={() => setEditing(true)} className="text-muted hover:text-fg" aria-label="Editar">
        <Pencil size={16} />
      </button>
      <button
        onClick={() => start(() => setAccountArchived(a.id, !a.archived))}
        className="text-muted hover:text-fg"
        aria-label={a.archived ? "Reativar" : "Arquivar"}
        title={a.archived ? "Reativar" : "Arquivar (esconde, mas mantém o histórico)"}
      >
        {a.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
      </button>
    </li>
  );
}
