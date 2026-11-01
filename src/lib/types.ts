export type TaskStatus = "todo" | "doing" | "done";

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: 1 | 2 | 3; // 1 = alta, 2 = média, 3 = baixa
  due_date: string | null; // "AAAA-MM-DD"
  completed_at: string | null;
  created_at: string;
};
