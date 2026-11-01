"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { billMonthFor } from "@/lib/finance/billing";
import { isTransferLike, personKey, ruleKey } from "@/lib/finance/text";
import type { AccountKind, Bank, TxKind } from "@/lib/finance/types";

function refresh() {
  revalidatePath("/", "layout");
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  return s === "" ? null : Number(s);
};
const day = (v: FormDataEntryValue | null) => {
  const n = num(v);
  return n && n >= 1 && n <= 31 ? Math.trunc(n) : null;
};

/* ---------- Contas ---------- */

export async function createAccount(formData: FormData) {
  const kind = String(formData.get("kind")) as AccountKind;
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").insert({
    name: String(formData.get("name") ?? "").trim(),
    kind,
    bank: String(formData.get("bank") ?? "outro") as Bank,
    initial_balance: 0,
    closing_day: kind === "credit_card" ? day(formData.get("closing_day")) : null,
    due_day: kind === "credit_card" ? day(formData.get("due_day")) : null,
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function updateAccount(id: string, formData: FormData) {
  const supabase = await createClient();
  const fields: Record<string, unknown> = { name: String(formData.get("name") ?? "").trim() };
  if (formData.has("bank")) fields.bank = String(formData.get("bank")) as Bank;
  // Você informa o saldo ATUAL (o que aparece no app do banco hoje);
  // o sistema calcula o saldo inicial = saldo atual - soma de tudo que foi lançado/importado.
  const current = num(formData.get("current_balance"));
  if (current !== null && Number.isFinite(current)) {
    const { data: totals } = await supabase.rpc("account_totals");
    const sum = Number(((totals ?? []) as { account_id: string; total: number }[]).find((t) => t.account_id === id)?.total ?? 0);
    fields.initial_balance = Math.round((current - sum) * 100) / 100;
  }
  if (formData.has("closing_day")) fields.closing_day = day(formData.get("closing_day"));
  if (formData.has("due_day")) fields.due_day = day(formData.get("due_day"));
  const { error } = await supabase.from("accounts").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function setAccountArchived(id: string, archived: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").update({ archived }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

// Exclui a conta e TODOS os lançamentos/importações dela
export async function deleteAccount(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

/* ---------- Lançamentos ---------- */

export async function createTransaction(formData: FormData) {
  const supabase = await createClient();
  const accountId = String(formData.get("account_id"));
  const date = String(formData.get("date"));
  const value = Math.abs(num(formData.get("amount")) ?? 0);
  if (!value) throw new Error("Informe o valor.");
  const amount = formData.get("type") === "income" ? value : -value;

  const { data: account } = await supabase
    .from("accounts")
    .select("kind, closing_day, due_day")
    .eq("id", accountId)
    .single();
  if (!account) throw new Error("Conta não encontrada.");

  const { error } = await supabase.from("transactions").insert({
    account_id: accountId,
    date,
    description: String(formData.get("description") ?? "").trim(),
    amount,
    category_id: String(formData.get("category_id") ?? "") || null,
    kind: (String(formData.get("kind") ?? "normal") as TxKind) || "normal",
    bill_month: account.kind === "credit_card" ? billMonthFor(date, account.closing_day, account.due_day) : null,
  });
  if (error) throw new Error(error.message);
  refresh();
}

// Muda a categoria e aprende: próximos lançamentos parecidos já vêm com ela.
export async function setTransactionCategory(id: string, categoryId: string | null, description: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").update({ category_id: categoryId }).eq("id", id);
  if (error) throw new Error(error.message);
  if (categoryId) await learnRules([{ description, categoryId }]);
  refresh();
}

export async function setTransactionKind(id: string, kind: TxKind, description?: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ kind, notes: kind === "transfer" ? "Entre minhas contas" : null, ...(kind !== "normal" ? { category_id: null } : {}) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (kind === "transfer" && description) await learnTransferPeople([description]);
  refresh();
}

// Lembra que Pix/transferências com essa pessoa são entre as suas contas
async function learnTransferPeople(descriptions: string[]) {
  const patterns = [...new Set(descriptions.map(personKey).filter((k): k is string => !!k))];
  if (!patterns.length) return;
  const supabase = await createClient();
  await supabase
    .from("category_rules")
    .upsert(patterns.map((pattern) => ({ pattern, kind: "transfer", category_id: null })), { onConflict: "user_id,pattern" });
}

// Procura, nas OUTRAS contas, o "outro lado" de cada transferência (mesmo valor com sinal oposto, até 3 dias)
export async function findTransferMatches(accountId: string, items: { i: number; date: string; amount: number }[]) {
  if (items.length === 0) return [];
  const supabase = await createClient();
  const dates = items.map((x) => x.date).sort();
  const shift = (d: string, n: number) => new Date(new Date(d + "T12:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

  type Cand = { id: string; account_id: string; date: string; amount: number; description: string };
  const cands: Cand[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("transactions")
      .select("id,account_id,date,amount,description")
      .neq("account_id", accountId)
      .eq("kind", "normal")
      .gte("date", shift(dates[0], -3))
      .lte("date", shift(dates.at(-1)!, 3))
      .range(from, from + 999);
    if (!data?.length) break;
    cands.push(...data.map((c) => ({ ...c, amount: Number(c.amount) })));
    if (data.length < 1000) break;
  }

  const used = new Set<string>();
  const out: { i: number; otherId: string }[] = [];
  for (const it of items) {
    const day = (d: string) => Math.abs(new Date(d).getTime() - new Date(it.date).getTime()) / 86400000;
    const match = cands
      .filter((c) => !used.has(c.id) && Math.abs(c.amount + it.amount) < 0.005 && day(c.date) <= 3 && isTransferLike(c.description))
      .sort((a, b) => day(a.date) - day(b.date))[0];
    if (match) {
      used.add(match.id);
      out.push({ i: it.i, otherId: match.id });
    }
  }
  return out;
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

async function learnRules(items: { description: string; categoryId: string }[]) {
  const byPattern = new Map<string, string>();
  for (const { description, categoryId } of items) {
    const pattern = ruleKey(description);
    if (pattern.length >= 2) byPattern.set(pattern, categoryId);
  }
  if (byPattern.size === 0) return;
  const supabase = await createClient();
  await supabase
    .from("category_rules")
    .upsert([...byPattern].map(([pattern, category_id]) => ({ pattern, category_id })), { onConflict: "user_id,pattern" });
}

/* ---------- Importação ---------- */

export type ImportRow = {
  date: string;
  description: string;
  raw: string;
  note: string | null;
  amount: number;
  externalId: string;
  categoryId: string | null;
  kind: TxKind;
  installment: [number, number] | null;
  learn: boolean; // você escolheu a categoria na mão -> vira regra
};

export async function findExisting(accountId: string, externalIds: string[]) {
  const supabase = await createClient();
  const found = new Set<string>();
  for (let i = 0; i < externalIds.length; i += 300) {
    const { data } = await supabase
      .from("transactions")
      .select("external_id")
      .eq("account_id", accountId)
      .in("external_id", externalIds.slice(i, i + 300));
    data?.forEach((r) => r.external_id && found.add(r.external_id));
  }
  return [...found];
}

export async function importTransactions(input: {
  accountId: string;
  filename: string;
  format: string;
  billMonth: string | null;
  rows: ImportRow[];
  linkTransfers?: string[]; // ids do "outro lado" (em outras contas) para marcar como entre contas
  transferPeople?: string[]; // descrições de pessoas que você marcou como "entre minhas contas"
}) {
  if (input.rows.length === 0) throw new Error("Nenhum lançamento selecionado.");
  if (input.rows.length > 3000) throw new Error("Arquivo grande demais (máximo 3000 lançamentos).");
  const supabase = await createClient();

  const { data: imp, error: impErr } = await supabase
    .from("imports")
    .insert({ account_id: input.accountId, filename: input.filename.slice(0, 200), format: input.format })
    .select("id")
    .single();
  if (impErr || !imp) throw new Error(impErr?.message ?? "Falha ao registrar importação.");

  const payload = input.rows.map((r) => ({
    account_id: input.accountId,
    date: r.date,
    description: r.description.slice(0, 300),
    raw_description: r.raw.slice(0, 500),
    notes: r.note,
    amount: r.amount,
    category_id: r.categoryId,
    kind: r.kind,
    bill_month: input.billMonth,
    installment_current: r.installment?.[0] ?? null,
    installment_total: r.installment?.[1] ?? null,
    external_id: r.externalId,
    import_id: imp.id,
  }));

  const { data: inserted, error } = await supabase
    .from("transactions")
    .upsert(payload, { onConflict: "account_id,external_id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    await supabase.from("imports").delete().eq("id", imp.id);
    throw new Error(error.message);
  }

  const insertedCount = inserted?.length ?? 0;
  await supabase
    .from("imports")
    .update({ inserted_count: insertedCount, skipped_count: payload.length - insertedCount })
    .eq("id", imp.id);

  await learnRules(input.rows.filter((r) => r.learn && r.categoryId).map((r) => ({ description: r.description, categoryId: r.categoryId! })));
  if (input.transferPeople?.length) await learnTransferPeople(input.transferPeople);
  if (input.linkTransfers?.length) {
    await supabase
      .from("transactions")
      .update({ kind: "transfer", notes: "Entre minhas contas", category_id: null })
      .in("id", input.linkTransfers.slice(0, 3000));
  }
  refresh();
  return { importId: imp.id, inserted: insertedCount, skipped: payload.length - insertedCount };
}

export async function undoImport(importId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("imports").delete().eq("id", importId);
  if (error) throw new Error(error.message);
  refresh();
}

/* ---------- Categorias ---------- */

export async function createCategory(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    name: String(formData.get("name") ?? "").trim(),
    kind: formData.get("kind") === "income" ? "income" : "expense",
  });
  if (error) throw new Error(error.code === "23505" ? "Essa categoria já existe." : error.message);
  refresh();
}

export async function deleteCategory(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}
