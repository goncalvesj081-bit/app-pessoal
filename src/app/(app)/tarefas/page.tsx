import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { Task } from "@/lib/types";
import { TaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-item";

const FILTERS = {
  hoje: { label: "Hoje", empty: "Nada para hoje. 🎉" },
  proximas: { label: "Próximas", empty: "Nenhuma tarefa com prazo futuro." },
  todas: { label: "Todas abertas", empty: "Nenhuma tarefa aberta." },
  concluidas: { label: "Concluídas", empty: "Nenhuma tarefa concluída ainda." },
} as const;
type Filter = keyof typeof FILTERS;

export default async function TarefasPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const filter: Filter = f && f in FILTERS ? (f as Filter) : "hoje";
  const today = todayISO();

  const supabase = await createClient();
  let query = supabase.from("tasks").select("*");

  if (filter === "hoje") query = query.neq("status", "done").lte("due_date", today); // inclui atrasadas
  if (filter === "proximas") query = query.neq("status", "done").gt("due_date", today);
  if (filter === "todas") query = query.neq("status", "done");
  if (filter === "concluidas") query = query.eq("status", "done").order("completed_at", { ascending: false }).limit(50);

  if (filter !== "concluidas") {
    query = query
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });
  }

  const { data } = await query;
  const tasks = (data ?? []) as Task[];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Tarefas</h1>

      <TaskForm defaultDue={filter === "hoje" ? today : undefined} />

      <div className="flex gap-1 overflow-x-auto">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <Link
            key={key}
            href={`/tarefas?f=${key}`}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${
              key === filter ? "bg-fg text-bg" : "text-muted hover:text-fg"
            }`}
          >
            {FILTERS[key].label}
          </Link>
        ))}
      </div>

      <TaskList tasks={tasks} empty={FILTERS[filter].empty} />
    </div>
  );
}
