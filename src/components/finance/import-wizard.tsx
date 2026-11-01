"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, FileUp, RefreshCw } from "lucide-react";
import { findExisting, findTransferMatches, importTransactions } from "@/app/(app)/financeiro/actions";
import { decodeFile, parseStatement, ParseError, withExternalIds, type ParsedRow } from "@/lib/finance/parse";
import { isOwnTransfer, suggestCategory, type Rule } from "@/lib/finance/categorize";
import { billMonthFor, monthLabel, shiftMonth } from "@/lib/finance/billing";
import { formatBRL } from "@/lib/finance/money";
import { isTransferLike, REASON_LABEL, ruleKey, type InternalReason } from "@/lib/finance/text";
import { BANKS, type Account, type Category } from "@/lib/finance/types";
import { CategorySelect, TRANSFER } from "./transactions";

type Row = ParsedRow & {
  externalId: string;
  duplicate: boolean;
  include: boolean;
  categoryId: string | null;
  suggested: string | null;
  linkedId?: string; // o outro lado da transferência, em outra conta sua
  learnTransfer?: boolean; // você marcou como "entre minhas contas"
};

type Group = { key: string; label: string; idx: number[]; total: number; categoryId: string | null };

const HELP: Record<string, string> = {
  nubank: "Conta: app Nubank → Extrato → \"Pedir extrato\" (OFX ou CSV, chega por e-mail). Cartão: Fatura → \"Exportar fatura\".",
  inter: "App Inter → Extrato → ícone de exportar → OFX ou CSV. Cartão: Faturas → Exportar.",
  sicoob: "App/Internet banking Sicoob → Extrato → Exportar → OFX.",
  mercadopago: "Mercado Pago → Seu dinheiro → Relatórios → \"Relatório de dinheiro em conta\" → CSV.",
  outro: "Procure a opção de exportar o extrato em OFX (preferível) ou CSV.",
};

export function ImportWizard({
  accounts,
  categories,
  rules,
  checkExisting = findExisting,
  checkTransfers = findTransferMatches,
}: {
  accounts: Account[];
  categories: Category[];
  rules: Rule[];
  checkExisting?: (accountId: string, ids: string[]) => Promise<string[]>;
  checkTransfers?: typeof findTransferMatches;
}) {
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
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  async function handleFile(f: File) {
    setError("");
    if (f.size > 5 * 1024 * 1024) return setError("Arquivo muito grande (máx. 5 MB).");
    if (/\.pdf$/i.test(f.name)) return setError("PDF ainda não é aceito — por enquanto use OFX ou CSV.");
    setReading(true);
    try {
      const parsed = parseStatement(decodeFile(await f.arrayBuffer()), f.name);
      const withIds = await withExternalIds(parsed.rows);
      const existing = new Set(await checkExisting(accountId, withIds.map((r) => r.externalId)));
      const prepared: Row[] = withIds.map((r) => {
        const duplicate = existing.has(r.externalId);
        // Pessoa que você já marcou como "entre minhas contas"
        if (r.kind === "normal" && isOwnTransfer(r.description, rules)) {
          return { ...r, kind: "transfer", reason: "entre_contas", duplicate, include: !duplicate, categoryId: null, suggested: null };
        }
        const suggested = r.kind === "normal" ? suggestCategory(r.description, r.amount, rules, categories) : null;
        return { ...r, duplicate, include: !duplicate, categoryId: suggested, suggested };
      });
      // Transferência que bate com o "outro lado" já importado em outra conta sua
      if (!isCardAccount) {
        const items = prepared
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => !r.duplicate && r.kind === "normal" && isTransferLike(r.description))
          .map(({ r, i }) => ({ i, date: r.date, amount: r.amount }));
        for (const m of await checkTransfers(accountId, items)) {
          prepared[m.i] = { ...prepared[m.i], kind: "transfer", reason: "entre_contas", categoryId: null, linkedId: m.otherId };
        }
      }
      setRows(prepared);
      setFile({ name: f.name, format: parsed.format, isCard: parsed.isCard });
      if (isCardAccount) {
        const last = withIds.map((r) => r.date).sort().at(-1)!;
        setBillMonth(billMonthFor(last, account.closing_day, account.due_day));
      } else setBillMonth(null);
    } catch (e) {
      setRows([]);
      setFile(null);
      setError(e instanceof ParseError ? e.message : `Não consegui ler o arquivo: ${(e as Error).message}`);
    } finally {
      setReading(false);
    }
  }

  /* ---------- organiza em seções ---------- */
  const view = useMemo(() => {
    const groups = new Map<string, Group>();
    const internal = new Map<InternalReason, number[]>();
    const dupes: number[] = [];

    rows.forEach((r, i) => {
      if (r.duplicate) return dupes.push(i);
      if (r.kind !== "normal") {
        const reason = r.reason ?? "fatura";
        internal.set(reason, [...(internal.get(reason) ?? []), i]);
        return;
      }
      const key = (ruleKey(r.description) || r.description.toLowerCase()) + (r.amount > 0 ? "+" : "-");
      const g = groups.get(key) ?? { key, label: r.description, idx: [], total: 0, categoryId: r.categoryId };
      g.idx.push(i);
      if (r.include) g.total += r.amount;
      if (g.categoryId !== r.categoryId) g.categoryId = null;
      groups.set(key, g);
    });

    const all = [...groups.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    const pending = all.filter((g) => !g.categoryId);
    const byCategory = new Map<string, Group[]>();
    for (const g of all.filter((g) => g.categoryId)) byCategory.set(g.categoryId!, [...(byCategory.get(g.categoryId!) ?? []), g]);

    const counted = rows.filter((r) => r.include && r.kind === "normal");
    const income = counted.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const expense = counted.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0);
    return { pending, byCategory, internal, dupes, income, expense };
  }, [rows]);

  const setGroupCategory = (g: Group, categoryId: string | null) =>
    setRows((rs) =>
      rs.map((r, i) => {
        if (!g.idx.includes(i)) return r;
        if (categoryId === TRANSFER) return { ...r, kind: "transfer", reason: "entre_contas", categoryId: null, learnTransfer: true };
        return { ...r, categoryId };
      }),
    );
  // Volta a contar como gasto/receita normal
  const unmarkTransfer = (i: number) =>
    setRows((rs) =>
      rs.map((r, idx) =>
        idx === i ? { ...r, kind: "normal", reason: null, linkedId: undefined, learnTransfer: false, categoryId: r.suggested } : r,
      ),
    );
  const toggleRow = (i: number) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, include: !r.include } : r)));

  const selected = rows.filter((r) => r.include);
  const mismatch = file && file.isCard !== null && file.isCard !== isCardAccount;

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
            raw: r.raw,
            note: r.reason ? REASON_LABEL[r.reason] : null,
            amount: r.amount,
            externalId: r.externalId,
            categoryId: r.kind === "normal" ? r.categoryId : null,
            kind: r.kind,
            installment: r.installment,
            learn: !!r.categoryId && r.categoryId !== r.suggested,
          })),
          linkTransfers: selected.filter((r) => r.linkedId && r.kind === "transfer").map((r) => r.linkedId!),
          transferPeople: selected.filter((r) => r.learnTransfer && r.kind === "transfer").map((r) => r.description),
        });
        router.push(`/financeiro/lancamentos?i=${res.importId}`);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const fileInput = (
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
  );

  /* ---------- passo 1: escolher conta e arquivo ---------- */
  if (!file) {
    return (
      <div className="card space-y-4">
        <label className="block text-sm">
          <span className="text-muted">De qual conta ou cartão é o arquivo?</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input mt-1">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.kind === "credit_card" ? "(cartão)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center text-sm text-muted hover:border-accent hover:text-fg">
          <FileUp size={24} />
          <span className="font-medium">{reading ? "Lendo arquivo..." : "Escolher arquivo OFX ou CSV"}</span>
          <span className="text-xs">O arquivo é lido no seu navegador. Nada é salvo antes de você confirmar.</span>
          {fileInput}
        </label>
        <p className="text-xs text-muted">
          <span className="font-medium">Onde baixar ({BANKS[account.bank]}):</span> {HELP[account.bank]}
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  /* ---------- passo 2: revisar ---------- */
  const internalCount = [...view.internal.values()].reduce((s, l) => s + l.length, 0);

  return (
    <div className="space-y-4 pb-4">
      {/* Cabeçalho do arquivo */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted">
              {account.name} · {file.format} · {rows.length} lançamentos no arquivo
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-fg">
            <RefreshCw size={13} /> Trocar arquivo
            {fileInput}
          </label>
        </div>
        {mismatch && (
          <p className="flex items-center gap-1.5 text-sm text-warning">
            <AlertTriangle size={15} /> Esse arquivo parece ser de {file.isCard ? "cartão" : "conta"}, mas você escolheu{" "}
            {isCardAccount ? "um cartão" : "uma conta"}.
          </p>
        )}
        {isCardAccount && billMonth && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Fatura de</span>
            <select value={billMonth} onChange={(e) => setBillMonth(e.target.value)} className="input w-auto py-1">
              {[-2, -1, 0, 1, 2].map((d) => {
                const v = shiftMonth(billMonth.slice(0, 7), d) + "-01";
                return <option key={v} value={v}>{monthLabel(v)}</option>;
              })}
            </select>
          </label>
        )}
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          <Mini label="Entradas" value={formatBRL(view.income)} cls="text-success" />
          <Mini label="Saídas" value={formatBRL(view.expense)} cls="text-danger" />
          <Mini label="Resultado" value={formatBRL(view.income - view.expense)} />
        </div>
      </div>

      {/* 1. Sem categoria */}
      {view.pending.length > 0 ? (
        <section className="space-y-2">
          <div>
            <h2 className="font-medium">Escolha a categoria ({view.pending.length})</h2>
            <p className="text-xs text-muted">
              Agrupei por pessoa/estabelecimento. Escolha uma vez e vale pra todos do grupo — e o sistema lembra nas próximas importações.
            </p>
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {view.pending.map((g) => (
              <GroupRow key={g.key} g={g} rows={rows} categories={categories} onCategory={setGroupCategory} onToggle={toggleRow} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="card text-sm text-success">Tudo categorizado ✓</p>
      )}

      {/* 2. Categorizados */}
      {view.byCategory.size > 0 && (
        <Collapsible title={`Já categorizados (${[...view.byCategory.values()].reduce((s, l) => s + l.reduce((t, g) => t + g.idx.length, 0), 0)})`} hint="Confira se quiser — dá pra trocar a categoria de qualquer grupo.">
          <div className="space-y-3">
            {[...view.byCategory].map(([catId, groups]) => (
              <div key={catId}>
                <p className="mb-1 flex justify-between px-1 text-xs font-medium text-muted">
                  <span>{catName.get(catId)}</span>
                  <span className="tabular-nums">{formatBRL(groups.reduce((s, g) => s + g.total, 0))}</span>
                </p>
                <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                  {groups.map((g) => (
                    <GroupRow key={g.key} g={g} rows={rows} categories={categories} onCategory={setGroupCategory} onToggle={toggleRow} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {/* 3. Não contam */}
      {internalCount > 0 && (
        <Collapsible
          title={`Não contam como gasto nem receita (${internalCount})`}
          hint="Dinheiro que só mudou de lugar: entre suas contas, Pix no crédito (o gasto aparece na fatura do cartão), Caixinha e pagamento de fatura. São guardados, mas ficam fora das contas do mês."
        >
          <div className="space-y-3">
            {[...view.internal].map(([reason, idx]) => (
              <div key={reason}>
                <p className="mb-1 px-1 text-xs font-medium text-muted">{REASON_LABEL[reason]} ({idx.length})</p>
                <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                  {idx.map((i) => (
                    <SimpleRow
                      key={i}
                      r={rows[i]}
                      onToggle={() => toggleRow(i)}
                      onUnmark={reason === "entre_contas" ? () => unmarkTransfer(i) : undefined}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {/* 4. Já importados */}
      {view.dupes.length > 0 && (
        <Collapsible title={`Já importados antes (${view.dupes.length})`} hint="Esses já estão no sistema e serão ignorados.">
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface opacity-60">
            {view.dupes.map((i) => (
              <SimpleRow key={i} r={rows[i]} />
            ))}
          </ul>
        </Collapsible>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="sticky bottom-20 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs shadow-lg sm:text-sm md:bottom-4">
        <span className="text-muted">
          <span className="font-medium text-fg">{selected.length}</span> para importar
          {view.pending.length > 0 && <span className="text-warning"> · {view.pending.length} sem categoria</span>}
        </span>
        <button onClick={save} disabled={saving || selected.length === 0} className="btn-primary shrink-0">
          {saving ? "Importando..." : "Importar"}
        </button>
      </div>
    </div>
  );
}

function Mini({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}

function Collapsible({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm">
        <span>
          <span className="font-medium">{title}</span>
          {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
        </span>
        <ChevronDown size={16} className="shrink-0 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function GroupRow({
  g,
  rows,
  categories,
  onCategory,
  onToggle,
}: {
  g: Group;
  rows: Row[];
  categories: Category[];
  onCategory: (g: Group, id: string | null) => void;
  onToggle: (i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const many = g.idx.length > 1;
  const amount = rows[g.idx[0]].amount;
  const allOff = g.idx.every((i) => !rows[i].include);

  return (
    <li className={allOff ? "opacity-50" : ""}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
        <button onClick={() => setOpen(!open)} className="min-w-0 flex-1 basis-44 text-left">
          <p className="truncate text-sm">{g.label}</p>
          <p className="flex items-center gap-1 text-xs text-muted">
            {many ? `${g.idx.length} lançamentos` : new Date(rows[g.idx[0]].date + "T12:00:00").toLocaleDateString("pt-BR")}
            <ChevronDown size={12} className={`transition ${open ? "rotate-180" : ""}`} />
          </p>
        </button>
        <CategorySelect
          value={g.categoryId}
          categories={categories}
          amount={amount}
          onChange={(v) => onCategory(g, v)}
          className="max-w-44"
          transferOption={isTransferLike(g.label)}
        />
        <span className={`w-24 text-right text-sm tabular-nums ${g.total > 0 ? "text-success" : ""}`}>{formatBRL(g.total)}</span>
      </div>
      {open && (
        <ul className="border-t border-border bg-bg/50">
          {g.idx.map((i) => (
            <SimpleRow key={i} r={rows[i]} onToggle={() => onToggle(i)} showRaw />
          ))}
        </ul>
      )}
    </li>
  );
}

function SimpleRow({ r, onToggle, showRaw, onUnmark }: { r: Row; onToggle?: () => void; showRaw?: boolean; onUnmark?: () => void }) {
  return (
    <li className={`flex items-center gap-3 px-4 py-2 text-sm ${r.include ? "" : "opacity-50"}`}>
      {onToggle && (
        <input type="checkbox" checked={r.include} onChange={onToggle} aria-label="Importar este lançamento" className="size-4 accent-[var(--accent)]" />
      )}
      <span className="w-20 shrink-0 text-xs text-muted">{new Date(r.date + "T12:00:00").toLocaleDateString("pt-BR")}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted" title={r.raw}>
        {showRaw ? r.raw : r.description}
        {r.installment ? ` · parcela ${r.installment[0]}/${r.installment[1]}` : ""}
      </span>
      {onUnmark && (
        <button onClick={onUnmark} className="shrink-0 text-xs text-accent hover:underline" title="Não é entre minhas contas: contar como gasto/receita">
          contar
        </button>
      )}
      <span className={`shrink-0 tabular-nums ${r.amount > 0 ? "text-success" : ""}`}>{formatBRL(r.amount)}</span>
    </li>
  );
}
