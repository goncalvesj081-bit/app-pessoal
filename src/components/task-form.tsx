"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";
import { createTask } from "@/app/(app)/tarefas/actions";

export function TaskForm({ defaultDue }: { defaultDue?: string }) {
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={async (fd) => {
        await createTask(fd);
        ref.current?.reset();
      }}
      className="card flex flex-wrap items-center gap-2"
    >
      <input name="title" required maxLength={300} placeholder="Nova tarefa..." className="input min-w-0 flex-1 basis-full sm:basis-0" />
      <input name="due_date" type="date" defaultValue={defaultDue} className="input w-auto" aria-label="Prazo" />
      <select name="priority" defaultValue="2" className="input w-auto" aria-label="Prioridade">
        <option value="1">Alta</option>
        <option value="2">Média</option>
        <option value="3">Baixa</option>
      </select>
      <button className="btn-primary flex items-center gap-1">
        <Plus size={16} /> Adicionar
      </button>
    </form>
  );
}
