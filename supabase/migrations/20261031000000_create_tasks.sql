-- Já aplicado no projeto Supabase "meu-sistema". Guardado aqui como histórico.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  notes text,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  priority smallint not null default 2 check (priority between 1 and 3),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_user_due_idx on public.tasks (user_id, due_date);

alter table public.tasks enable row level security;

create policy "tasks_select_own" on public.tasks for select to authenticated using ((select auth.uid()) = user_id);
create policy "tasks_insert_own" on public.tasks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tasks_update_own" on public.tasks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks_delete_own" on public.tasks for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  if new.status = 'done' and old.status <> 'done' then new.completed_at = now(); end if;
  if new.status <> 'done' then new.completed_at = null; end if;
  return new;
end $$;

create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();
