import Link from "next/link";
import { ArrowRight, CalendarDays, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { Task } from "@/lib/types";
import { TaskList } from "@/components/task-item";
import { TaskForm } from "@/components/task-form";
import { formatBRL } from "@/lib/finance/money";
import { monthRange, resolveMonth } from "@/lib/finance/data";

function greeting() {
  const h = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()),
  );
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function Dashboard() {
  const today = todayISO();
  const supabase = await createClient();

  const { start, end } = monthRange(resolveMonth(undefined));
  const [{ data: todayTasks }, { count: openCount }, { count: doneToday }, { data: monthTx }, { data: cardAccounts }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .neq("status", "done")
      .lte("due_date", today)
      .order("due_date")
      .order("priority"),
    supabase.from("tasks").select("*", { count: "exact", head: true }).neq("status", "done"),
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "done")
      .gte("completed_at", `${today}T00:00:00-03:00`),
    supabase.from("transactions").select("account_id,amount").eq("kind", "normal").gte("date", start).lt("date", end),
    supabase.from("accounts").select("id").eq("kind", "credit_card"),
  ]);
  const cardIds = new Set((cardAccounts ?? []).map((a) => a.id));
  let monthOut = 0;
  let monthIn = 0;
  for (const t of monthTx ?? []) {
    const v = Number(t.amount);
    if (v > 0 && !cardIds.has(t.account_id)) monthIn += v;
    else monthOut -= v;
  }

  const tasks = (todayTasks ?? []) as Task[];
  const overdue = tasks.filter((t) => t.due_date! < today).length;
  const dateLabel = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm capitalize text-muted">{dateLabel}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting()}!</h1>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Para hoje" value={tasks.length - overdue} />
        <Stat label="Atrasadas" value={overdue} tone={overdue ? "danger" : undefined} />
        <Stat label="Feitas hoje" value={doneToday ?? 0} tone="success" />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Tarefas de hoje</h2>
          <Link href="/tarefas?f=todas" className="flex items-center gap-1 text-sm text-muted hover:text-fg">
            Ver todas ({openCount ?? 0}) <ArrowRight size={14} />
          </Link>
        </div>
        <TaskForm defaultDue={today} />
        <TaskList tasks={tasks} empty="Nada para hoje. Aproveite! 🎉" />
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Soon href="/agenda" icon={<CalendarDays size={18} />} title="Agenda" text="Compromissos do Google Agenda" />
        <Link href="/financeiro" className="card flex items-center gap-3 hover:border-accent">
          <Wallet size={18} className="text-muted" />
          <div className="text-sm">
            <p className="font-medium">Financeiro do mês</p>
            <p className="text-xs text-muted">
              Saídas <span className="tabular-nums text-danger">{formatBRL(monthOut)}</span> · Entradas{" "}
              <span className="tabular-nums text-success">{formatBRL(monthIn)}</span>
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" | "success" }) {
  const color = tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "";
  return (
    <div className="card">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function Soon({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link href={href} className="card flex items-center gap-3 text-muted hover:border-accent">
      {icon}
      <div>
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="text-xs">{text} · em breve</p>
      </div>
    </Link>
  );
}
