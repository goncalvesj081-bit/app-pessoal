import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Account, Category } from "./types";

// Carrega contas e categorias (cria as categorias padrão no primeiro acesso)
export async function loadBasics() {
  const supabase = await createClient();
  await supabase.rpc("ensure_default_categories");
  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase.from("accounts").select("*").order("archived").order("kind").order("name"),
    supabase.from("categories").select("id,name,kind,color").order("kind").order("name"),
  ]);
  return {
    supabase,
    accounts: ((accounts ?? []) as Account[]).map((a) => ({ ...a, initial_balance: Number(a.initial_balance) })),
    categories: (categories ?? []) as Category[],
  };
}

// Mês no formato "aaaa-mm" a partir do ?m= da URL (padrão: mês atual em Brasília)
export function resolveMonth(m: string | undefined) {
  if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return m;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date());
}

export function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: `${ym}-01`, end: `${next}-01` };
}
