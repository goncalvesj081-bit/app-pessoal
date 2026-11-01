"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileUp } from "lucide-react";
import { findExisting, importTransactions } from "@/app/(app)/financeiro/actions";
import { decodeFile, parseStatement, ParseError, withExternalIds, type ParsedRow } from "@/lib/finance/parse";
import { suggestCategory, type Rule } from "@/lib/finance/categorize";
import { billMonthFor, monthLabel, shiftMonth } from "@/lib/finance/billing";
import { formatBRL } from "@/lib/finance/money";
import { BANKS, type Account, type Category } from "@/lib/finance/types";
import { CategorySelect } from "./transactions";

type Row = ParsedRow & {
  externalId: string;
  duplicate: boolean;
  include: boolean;
  categoryId: string | null;
  suggested: string | null;
};

const HELP: Record<string, string> = {
  nubank: "App Nubank → Conta: \"Pedir extrato\" (escolha OFX ou CSV, chega por e-mail). Cartão: Fatura → \"Exportar fatura\" (CSV/OFX).",
  inter: "App Inter → Extrato → ícone de exportar → OFX ou CSV. Cartão: Faturas → Exportar.",
  sicoob: "App/Internet banking Sicoob → Extrato → Exportar → OFX (Money/Quicken).",
  mercadopago: "Mercado Pago → Seu dinheiro → Relatórios → \"Relatório de dinheiro em conta\" → Baixar CSV.",
  outro: "Procure a opção de exportar o extrato em OFX (preferível) ou CSV.",
};

export function ImportWizard({ accounts, categories, rules }: { accounts: Account[]; categories: Category[]; rules: Rule[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0].id);
  const [file, setFile] = useState<{ name: string; format: string; isCard: boolean | null } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [billMonth, setBillMonth] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, startSaving] = useTransition();

  const account = accounts.find((a) => a.id === accountId)!;
  const isCardAccount = account.kind === "credit_card";

  async function handleFile(f: File) {
    setError("");
    setRows([]);
    setFile(null);
    if (f.size > 5 * 1024 * 1024) return setError("Arquivo muito grande (máx. 5 MB).");
    if (/\.pdf$/i.test(f.name)) return setError("PDF ainda não é aceito — essa é a próxima etapa. Por enquanto use OFX ou CSV.");
    setReading(true);
    try {
      const text = decodeFile(await f.arrayBuffer());
      const parsed = parseStatement(text, f.name);
      const withIds = await withExternalIds(parsed.rows);
      const existing = new Set(await findExisting(accountId, withIds.map((r) => r.externalId)));
      setRows(
        withIds.map((r) => {
          const suggested = r.kind === "normal" ? suggestCategory(r.description, r.amount, rules, categories) : null;
          const duplicate = existing.has(r.externalId);
          return { ...r, duplicate, include: !duplicate, categoryId: suggested, suggested };
        }),
      );
      setFile({ name: f.name, format: parsed.format, isCard: parsed.isCard });
      if (isCardAccount) {
        const last = withIds.map((r) => r.date).sort().at(-1)!;
        setBillMonth(billMonthFor(last, account.closing_day, account.due_day));
      } else setBillMonth(null);
    } catch (e) {
      setError(e instanceof ParseError ? e.message : `Não consegui ler o arquivo: ${(e as Error).message}`);
    } finally {
      setReading(false);
    }
  }

  const selected = rows.filter((r) => r.include);
  const totals = useMemo(() => {
    const normal = selected.filter((r) => r.kind === "normal");
    return {
      out: normal.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0),
      in: normal.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0),
      uncategorized: normal.filter((r) => !r.categoryId).length,
    };
  }, [selected]);
  const duplicates = rows.filter((r) => r.duplicate).length;
  const mismatch = file && file.isCard !== null && file.isCard !== isCardAccount;

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  function save() {
    startSaving(async () => {
      setError("");
      try {
        const res = await importTransactions({
          accountId,
          filename: file!.name,
          format: file!.format,
          billMonth: isCardAccount ? billMonth : null,
          rows: selected.map((r) => ({
            date: r.date,
            description: r.description,
            amount: r.amount,
            externalId: r.externalId,
            categoryId: r.kind === "normal" ? r.categoryId : null,
            kind: r.kind,
            installment: r.installment,
            learn: !!r.categoryId && r.categoryId !== r.suggested,
          })),
        });
        router.push(`/financeiro/lancamentos?i=${res.importId}`);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <label className="block text-sm">
          <span className="text-muted">1. De qual conta ou cartão é o arquivo?</span>
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setRows([]);
              setFile(null);
            }}
            className="input mt-1"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.kind === "credit_card" ? "(cartão)" : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted">Como baixar no {BANKS[account.bank]}: {HELP[account.bank]}</p>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted hover:border-accent">
          <FileUp size={22} />
          <span>{reading ? "Lendo arquivo..." : "2. Escolha o arquivo OFX ou CSV"}</span>
          <input
            type="file"
            accept=".ofx,.csv,.txt,.OFX,.CSV"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <p className="text-xs text-muted">O arquivo é lido aqui no seu navegador; só os lançamentos que você confirmar são salvos.</p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      {file && rows.length > 0 && (
        <div className="space-y-3">
          <div className="card space-y-2 text-sm">
            <p>
              <span className="font-medium">{file.name}</span> <span className="text-muted">· formato reconhecido: {file.format}</span>
            </p>
            <p className="text-muted">
              {rows.length} lançamentos encontrados{duplicates ? ` · ${duplicates} já importados antes (desmarcados)` : ""}.
            </p>
            {mismatch && (
              <p className="flex items-center gap-1.5 text-warning">
                <AlertTriangle size={15} />
                Esse arquivo parece ser de {file.isCard ? "cartão" : "conta"}, mas você escolheu {isCardAccount ? "um cartão" : "uma conta"}. Confira.
              </p>
            )}
            {isCardAccount && billMonth && (
              <label className="flex flex-wrap items-center gap-2">
                <span className="text-muted">Fatura de:</span>
                <select value={billMonth} onChange={(e) => setBillMonth(e.target.value)} className="input w-auto py-1">
                  {[-2, -1, 0, 1, 2].map((d) => {
                    const v = shiftMonth(billMonth.slice(0, 7), d) + "-01";
                    return (
                      <option key={v} value={v}>{monthLabel(v)}</option>
                    );
                  })}
                </select>
              </label>
            )}
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {rows.map((r, i) => (
              <li key={r.externalId} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 ${r.include ? "" : "opacity-50"}`}>
                <input type="checkbox" checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} aria-label="Importar" className="size-4 accent-[var(--accent)]" />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm" title={r.description}>{r.description}</p>
                  <p className="text-xs text-muted">
                    {new Date(r.date + "T12:00:00").toLocaleDateString("pt-BR")}
                    {r.installment ? ` · parcela ${r.installment[0]}/${r.installment[1]}` : ""}
                    {r.duplicate ? " · já importado" : ""}
                  </p>
                </div>
                {r.kind === "card_payment" ? (
                  <span className="text-xs text-accent">Pagamento de fatura</span>
                ) : (
                  <CategorySelect value={r.categoryId} categories={categories} amount={r.amount} onChange={(v) => update(i, { categoryId: v })} className="max-w-40" />
                )}
                <span className={`w-28 text-right text-sm tabular-nums ${r.amount > 0 ? "text-success" : ""}`}>{formatBRL(r.amount)}</span>
              </li>
            ))}
          </ul>

          <div className="card sticky bottom-20 flex flex-wrap items-center justify-between gap-3 text-sm md:bottom-4">
            <div className="text-muted">
              <span className="font-medium text-fg">{selected.length}</span> selecionados · saídas{" "}
              <span className="tabular-nums">{formatBRL(totals.out)}</span> · entradas <span className="tabular-nums">{formatBRL(totals.in)}</span>
              {totals.uncategorized > 0 && <span className="text-warning"> · {totals.uncategorized} sem categoria</span>}
            </div>
            <button onClick={save} disabled={saving || selected.length === 0} className="btn-primary">
              {saving ? "Importando..." : `Importar ${selected.length}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
