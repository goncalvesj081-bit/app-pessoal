create index accounts_user_idx on public.accounts (user_id);
create index imports_user_idx on public.imports (user_id);
create index imports_account_user_idx on public.imports (account_id, user_id);
create index transactions_account_user_idx on public.transactions (account_id, user_id);
create index transactions_category_user_idx on public.transactions (category_id, user_id);
create index transactions_import_user_idx on public.transactions (import_id, user_id);
create index category_rules_category_user_idx on public.category_rules (category_id, user_id);
