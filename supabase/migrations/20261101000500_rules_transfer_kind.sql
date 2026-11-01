alter table public.category_rules alter column category_id drop not null;
alter table public.category_rules add column kind text not null default 'normal' check (kind in ('normal','transfer'));
alter table public.category_rules add constraint category_rules_kind_category_chk check (kind = 'transfer' or category_id is not null);
