"use server";

// "Server actions": funções que rodam no servidor quando você clica num botão.
// Depois de salvar, o revalidatePath atualiza as telas que mostram tarefas.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/lib/types";

function refresh() {
  revalidatePath("/");
  revalidatePath("/tarefas");
}

export async function createTask(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const priority = Number(formData.get("priority") ?? 2);
  const due = String(formData.get("due_date") ?? "") || null;

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({ title, priority, due_date: due });
  if (error) throw new Error(error.message);
  refresh();
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function updateTask(
  id: string,
  fields: { title?: string; priority?: number; due_date?: string | null; notes?: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteTask(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}
