-- Já aplicado no Supabase. Guardado aqui como histórico.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('checking','credit_card','wallet')),
  bank text not null default 'outro' check (bank in ('sicoob','mercadopago','nubank','inter','outro')),
  initial_balance numeric(14,2) not null default 0,
  closing_day smallint check (closing_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('expense','income')),
  color text not null default '#6b7280',
  created_at timestamptz not null default now(),
  unique (user_id, name, kind),
  unique (id, user_id)
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null,
  filename text not null,
  format text not null,
  inserted_count int not null default 0,
  skipped_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete cascade
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null,
  date date not null,
  description text not null check (char_length(description) between 1 and 300),
  amount numeric(14,2) not null check (amount <> 0),
  category_id uuid,
  kind text not null default 'normal' check (kind in ('normal','card_payment','transfer')),
  bill_month date check (bill_month is null or extract(day from bill_month) = 1),
  installment_current smallint,
  installment_total smallint,
  external_id text,
  import_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete set null (category_id),
  foreign key (import_id, user_id) references public.imports(id, user_id) on delete cascade,
  unique (account_id, external_id)
);

create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_account_date_idx on public.transactions (account_id, date desc);
create index transactions_bill_idx on public.transactions (account_id, bill_month);

create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pattern text not null check (char_length(pattern) between 2 and 80),
  category_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, pattern),
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','imports','transactions','category_rules'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_select_own" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

create or replace function public.ensure_default_categories()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from public.categories where user_id = auth.uid()) then return; end if;
  insert into public.categories (name, kind, color) values
    ('Alimentação','expense','#f97316'), ('Mercado','expense','#eab308'), ('Transporte','expense','#3b82f6'),
    ('Moradia','expense','#8b5cf6'), ('Contas da casa','expense','#06b6d4'), ('Saúde','expense','#ef4444'),
    ('Lazer','expense','#ec4899'), ('Assinaturas','expense','#a855f7'), ('Compras','expense','#14b8a6'),
    ('Educação','expense','#22c55e'), ('Impostos e taxas','expense','#64748b'), ('Outros','expense','#6b7280'),
    ('Salário','income','#16a34a'), ('Pix e transferências','income','#0ea5e9'),
    ('Rendimentos','income','#84cc16'), ('Outras receitas','income','#10b981');
end $$;
revoke execute on function public.ensure_default_categories() from public, anon;
grant execute on function public.ensure_default_categories() to authenticated;
