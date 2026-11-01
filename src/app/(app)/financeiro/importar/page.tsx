import Link from "next/link";
import { loadBasics } from "@/lib/finance/data";
import { ImportWizard } from "@/components/finance/import-wizard";

export default async function ImportarPage() {
  const { supabase, accounts, categories } = await loadBasics();
  const active = accounts.filter((a) => !a.archived);

  if (active.length === 0) {
    return (
      <p className="card text-sm">
        Primeiro <Link href="/financeiro/contas" className="text-accent">cadastre suas contas e cartões</Link>.
      </p>
    );
  }

  const [{ data: rules }, { data: imports }] = await Promise.all([
    supabase.from("category_rules").select("pattern,category_id"),
    supabase.from("imports").select("id,filename,format,inserted_count,created_at,account_id").order("created_at", { ascending: false }).limit(10),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <div className="space-y-6">
      <ImportWizard accounts={active} categories={categories} rules={rules ?? []} />

      {imports && imports.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Últimas importações</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {imports.map((i) => (
              <li key={i.id}>
                <Link href={`/financeiro/lancamentos?i=${i.id}`} className="flex justify-between gap-3 px-4 py-2.5 hover:bg-border/30">
                  <span className="min-w-0 truncate">
                    {i.filename} <span className="text-muted">· {accountName.get(i.account_id)}</span>
                  </span>
                  <span className="shrink-0 text-muted">
                    {i.inserted_count} · {new Date(i.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
