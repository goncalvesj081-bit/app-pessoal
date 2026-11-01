"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { deleteTask, setTaskStatus, updateTask } from "@/app/(app)/tarefas/actions";
import { formatDueDate, todayISO } from "@/lib/dates";
import type { Task } from "@/lib/types";

const PRIORITY = {
  1: { label: "Alta", cls: "text-danger" },
  2: { label: "Média", cls: "text-warning" },
  3: { label: "Baixa", cls: "text-muted" },
} as const;

export function TaskItem({ task }: { task: Task }) {
  const [pending, startTransition] = useTransition();
  // "Otimista": marca como feita na hora, sem esperar o servidor responder.
  const [done, setDone] = useOptimistic(task.status === "done");
  const [editing, setEditing] = useState(false);

  const overdue = !done && task.due_date && task.due_date < todayISO();

  function toggle() {
    startTransition(async () => {
      setDone(!done);
      await setTaskStatus(task.id, done ? "todo" : "done");
    });
  }

  return (
    <li className={`group flex items-center gap-3 px-4 py-3 ${pending ? "opacity-60" : ""}`}>
      <button
        onClick={toggle}
        aria-label={done ? "Desmarcar" : "Concluir"}
        className={`grid size-5 shrink-0 place-items-center rounded-md border ${
          done ? "border-accent bg-accent text-accent-fg" : "border-border hover:border-accent"
        }`}
      >
        {done && <Check size={14} strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            defaultValue={task.title}
            className="input py-1"
            onBlur={(e) => {
              setEditing(false);
              const title = e.target.value.trim();
              if (title && title !== task.title) startTransition(() => updateTask(task.id, { title }));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className={`block w-full truncate text-left text-sm ${done ? "text-muted line-through" : ""}`}
          >
            {task.title}
          </button>
        )}
        <div className="mt-0.5 flex gap-3 text-xs">
          <span className={PRIORITY[task.priority].cls}>{PRIORITY[task.priority].label}</span>
          {task.due_date && (
            <span className={overdue ? "text-danger" : "text-muted"}>
              {overdue ? "Atrasada · " : ""}
              {formatDueDate(task.due_date)}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => startTransition(() => deleteTask(task.id))}
        aria-label="Excluir"
        className="text-muted opacity-100 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}

export function TaskList({ tasks, empty }: { tasks: Task[]; empty: string }) {
  if (tasks.length === 0) return <p className="card text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {tasks.map((t) => (
        <TaskItem key={t.id} task={t} />
      ))}
    </ul>
  );
}
