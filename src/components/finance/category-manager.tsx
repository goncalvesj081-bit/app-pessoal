"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createCategory, deleteCategory } from "@/app/(app)/financeiro/actions";
import type { Category } from "@/lib/finance/types";

export function CategoryManager({ categories }: { categories: Category[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const section = (kind: "expense" | "income", title: string) => (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      <ul className="flex flex-wrap gap-2">
        {categories
          .filter((c) => c.kind === kind)
          .map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-3 pr-1.5 text-sm">
              {c.name}
              <button
                onClick={() => {
                  if (confirm(`Excluir "${c.name}"? Os lançamentos dela ficam sem categoria.`)) start(() => deleteCategory(c.id));
                }}
                className="rounded-full p-0.5 text-muted hover:text-danger"
                aria-label={`Excluir ${c.name}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
      </ul>
    </section>
  );

  return (
    <div className={`space-y-5 ${pending ? "opacity-60" : ""}`}>
      <form
        ref={ref}
        action={(fd) =>
          start(async () => {
            setError("");
            try {
              await createCategory(fd);
              ref.current?.reset();
            } catch (e) {
              setError((e as Error).message);
            }
          })
        }
        className="card flex flex-wrap gap-2"
      >
        <input name="name" required maxLength={40} placeholder="Nova categoria" className="input min-w-0 flex-1" />
        <select name="kind" className="input w-auto" aria-label="Tipo">
          <option value="expense">Gasto</option>
          <option value="income">Receita</option>
        </select>
        <button className="btn-primary flex items-center gap-1">
          <Plus size={16} /> Adicionar
        </button>
        {error && <p className="w-full text-sm text-danger">{error}</p>}
      </form>
      {section("expense", "Gastos")}
      {section("income", "Receitas")}
      <p className="text-xs text-muted">
        Dica: quando você muda a categoria de um lançamento, o sistema aprende e aplica a mesma categoria nos próximos parecidos.
      </p>
    </div>
  );
}
